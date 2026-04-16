import * as https from 'https';
import { AiInsights, ScanResult } from './types/index.js';

// ─── HTTP helper ──────────────────────────────────────────────────────────────

function httpsPost(url: string, body: any, headers: Record<string, string>): Promise<any> {
  return new Promise((resolve, reject) => {
    const options = new URL(url);
    const bodyStr = JSON.stringify(body);
    const req = https.request(
      {
        hostname: options.hostname,
        path: options.pathname + options.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(bodyStr),
          ...headers,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch { resolve({}); }
        });
      },
    );
    req.on('error', reject);
    req.setTimeout(45000, () => { req.destroy(); reject(new Error('Groq request timed out')); });
    req.write(bodyStr);
    req.end();
  });
}

// ─── Prompt builder — uses every signal the risk engines produce ─────────────

function buildPrompt(result: ScanResult): string {
  const { summary, dependencies, metadata } = result;
  const direct = dependencies.filter(d => !d.parent);
  const critical = direct.filter(d => d.riskLevel === 'critical');
  const high = direct.filter(d => d.riskLevel === 'high');
  const vulnerable = direct.filter(d => d.vulnerabilities.length > 0);
  const deprecated = direct.filter(d => d.flags.some(f => f.type === 'deprecated'));
  const singleMaintainer = direct.filter(d => d.flags.some(f => f.type === 'single-maintainer'));
  const unmaintained = direct.filter(d => d.flags.some(f => f.type === 'unmaintained'));
  const deepChain = direct.filter(d => d.flags.some(f => f.type === 'deep-chain'));

  const depLine = (d: typeof direct[0]) =>
    `  - ${d.name}@${d.version}` +
    ` | risk=${d.riskLevel} score=${Math.round(d.score.overall)}/100` +
    ` | maintenance=${Math.round(d.score.maintenance)} security=${Math.round(d.score.security)}` +
    ` popularity=${Math.round(d.score.popularity)} community=${Math.round(d.score.community)}` +
    ` depthRisk=${Math.round(d.score.depthRisk)}` +
    ` | maintainers=${d.registryData.maintainers}` +
    ` downloads/wk=${d.registryData.weeklyDownloads.toLocaleString()}` +
    ` lastPublish=${d.registryData.lastPublish.slice(0, 10)}` +
    ` versions=${d.registryData.versions}` +
    (d.registryData.deprecation ? ` DEPRECATED="${d.registryData.deprecation}"` : '') +
    (d.github ? ` stars=${d.github.stars} openIssues=${d.github.openIssues} lastCommit=${d.github.lastCommit.slice(0, 10)}` + (d.github.archived ? ' ARCHIVED' : '') : '') +
    (d.vulnerabilities.length
      ? ` | CVEs: ${d.vulnerabilities.map(v => `${v.severity.toUpperCase()}:${v.cve || 'N/A'} "${v.title}" (${v.affectedVersions})`).join('; ')}`
      : '') +
    (d.flags.length ? ` | flags: ${d.flags.map(f => f.type).join(',')}` : '') +
    (d.directDeps.length ? ` | transitiveCount=${d.transitiveCount}` : '');

  return `You are a senior software security auditor. Analyze this ${metadata.ecosystem} project dependency scan and return structured JSON insights.

PROJECT: ${metadata.projectName} (${metadata.ecosystem})
SCAN DATE: ${metadata.timestamp.slice(0, 10)}

SUMMARY
  Overall risk: ${summary.overallRiskLevel.toUpperCase()} (score ${summary.overallScore}/100)
  Total deps: ${summary.totalDependencies} | Direct: ${summary.directCount} | Dev: ${summary.devCount}
  Critical: ${summary.criticalCount} | High: ${summary.highCount} | Medium: ${summary.mediumCount} | Low: ${summary.lowCount}
  Known CVEs: ${summary.vulnerabilityCount}

CRITICAL PACKAGES (${critical.length})
${critical.map(depLine).join('\n') || '  none'}

HIGH-RISK PACKAGES (${high.length > 8 ? `top 8 of ${high.length}` : high.length})
${high.slice(0, 8).map(depLine).join('\n') || '  none'}

PACKAGES WITH CVEs (${vulnerable.length})
${vulnerable.slice(0, 8).map(depLine).join('\n') || '  none'}

DEPRECATED PACKAGES (${deprecated.length})
${deprecated.map(depLine).join('\n') || '  none'}

SINGLE-MAINTAINER PACKAGES (${singleMaintainer.length})
${singleMaintainer.slice(0, 5).map(d => `  - ${d.name}@${d.version}`).join('\n') || '  none'}

UNMAINTAINED PACKAGES (${unmaintained.length})
${unmaintained.slice(0, 5).map(d => `  - ${d.name}@${d.version} lastPublish=${d.registryData.lastPublish.slice(0, 10)}`).join('\n') || '  none'}

DEEP DEPENDENCY CHAINS (${deepChain.length})
${deepChain.slice(0, 5).map(d => `  - ${d.name} transitiveCount=${d.transitiveCount}`).join('\n') || '  none'}

Return ONLY this JSON (no markdown, no extra keys):
{
  "summary": "3–4 paragraph executive summary. P1: interpret the ${summary.overallScore}/100 score in plain language — what it means for a real ${metadata.ecosystem} project in production. P2: identify the most dangerous packages by name; explain the compounded risk (CVEs + low maintenance + single maintainer, etc.). P3: describe the realistic worst-case exploitation scenario from the vulnerabilities found. P4: honest overall verdict and urgency.",
  "riskAnalysis": "Per-package deep-dive for every critical and high-risk package. For each: (a) what the package does, (b) exact risk signals — low maintenance score, single maintainer, CVE IDs with severity and affected versions, days since last publish, (c) what an attacker can do if it is compromised, (d) whether the installed version is in the vulnerable range. Use numbered entries like '1. lodash@3.10.1 — ...'.",
  "recommendations": "Prioritized action plan as a PLAIN STRING with numbered bullet lines. Each line must be a self-contained action item. Format each line exactly as: '1. [URGENCY] package-name - action. Run: npm install pkg@version'. Order by urgency (CRITICAL first). End with a general audit command line. Do NOT return an array - return one multiline string.",
  "alternatives": "PLAIN STRING listing safer replacements for deprecated, unmaintained, or critically risky packages. For each package use this format on its own line: '- package-name -> replacement-name: migration effort (trivial/easy/moderate/significant), key API differences, install command'. Do NOT return an array or nested object - return one multiline string. If no replacements are needed, say so."
}`;
}

// ─── Rule-based fallback ──────────────────────────────────────────────────────

export function generateRuleBasedInsights(result: ScanResult): AiInsights {
  const { summary, dependencies } = result;
  const direct = dependencies.filter(d => !d.parent);
  const critical = direct.filter(d => d.riskLevel === 'critical');
  const high = direct.filter(d => d.riskLevel === 'high');
  const vulnerable = direct.filter(d => d.vulnerabilities.length > 0);
  const deprecated = direct.filter(d => d.flags.some(f => f.type === 'deprecated'));
  const singleMaintainer = direct.filter(d => d.flags.some(f => f.type === 'single-maintainer'));
  const deepChain = direct.filter(d => d.flags.some(f => f.type === 'deep-chain'));

  const ALTS: Record<string, string> = {
    request: 'axios or node-fetch',
    'node-uuid': 'uuid',
    'left-pad': 'String.prototype.padStart()',
    moment: 'date-fns or dayjs',
  };

  const summary_text =
    `Your project has ${summary.totalDependencies} dependencies with an overall risk score of ` +
    `${summary.overallScore}/100 (${summary.overallRiskLevel.toUpperCase()}). ` +
    `${summary.criticalCount} critical, ${summary.highCount} high, ${summary.mediumCount} medium, ` +
    `and ${summary.lowCount} low-risk packages were detected. ` +
    (summary.vulnerabilityCount > 0
      ? `${summary.vulnerabilityCount} known CVEs are present in the dependency tree — these represent active security exposure.`
      : 'No known CVEs were detected across the dependency tree.');

  const riskAnalysis =
    [
      critical.length > 0
        ? `Critical packages: ${critical.map(d => `${d.name}@${d.version} (score ${Math.round(d.score.overall)})`).join(', ')}. These require immediate attention.`
        : '',
      high.length > 0
        ? `High-risk packages: ${high.map(d => d.name).join(', ')}.`
        : '',
      deprecated.length > 0
        ? `Deprecated: ${deprecated.map(d => d.name).join(', ')} — these packages are no longer maintained and must be replaced.`
        : '',
      vulnerable.length > 0
        ? `Packages with CVEs: ${vulnerable.map(d => `${d.name} (${d.vulnerabilities.length} CVE${d.vulnerabilities.length > 1 ? 's' : ''})`).join(', ')}.`
        : '',
      singleMaintainer.length > 0
        ? `Single-maintainer bus-factor risk: ${singleMaintainer.map(d => d.name).join(', ')}.`
        : '',
      critical.length === 0 && high.length === 0 && deprecated.length === 0 && vulnerable.length === 0
        ? 'No critical or high-priority risks found. Your dependency tree looks healthy.'
        : '',
    ]
      .filter(Boolean)
      .join('\n\n');

  const recommendations = [
    deprecated.length > 0 ? `1. Replace deprecated packages: ${deprecated.map(d => d.name).join(', ')}` : '',
    vulnerable.length > 0 ? `2. Patch CVEs in: ${vulnerable.map(d => d.name).join(', ')}` : '',
    singleMaintainer.length > 0 ? `3. Evaluate bus-factor risk for single-maintainer packages: ${singleMaintainer.map(d => d.name).join(', ')}` : '',
    deepChain.length > 0 ? `4. Audit deep dependency chains in: ${deepChain.map(d => d.name).join(', ')}` : '',
    '5. Run `npm audit` (or equivalent) regularly and keep packages up to date.',
    '6. Enable automated dependency monitoring (Dependabot / Renovate).',
    '7. Pin exact versions in production to avoid unexpected updates.',
  ]
    .filter(Boolean)
    .join('\n');

  const alternatives =
    deprecated.length > 0
      ? deprecated
          .map(d => {
            const alt = ALTS[d.name];
            return `- **${d.name}** → ${alt || 'search npm/pub.dev for a maintained alternative'}${alt ? '' : ' (no standard drop-in exists)'}`;
          })
          .join('\n')
      : 'All packages are actively maintained. No immediate replacements are needed. Continue monitoring for deprecation notices.';

  return { summary: summary_text, riskAnalysis, recommendations, alternatives };
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function generateAiInsights(result: ScanResult, groqApiKey?: string): Promise<AiInsights> {
  if (!groqApiKey) return generateRuleBasedInsights(result);

  try {
    const response = await httpsPost(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content:
              'You are an expert software security auditor specializing in dependency risk analysis. ' +
              'Provide detailed, actionable insights grounded in the provided scan data. ' +
              'Be specific about package names, CVE IDs, scores, and exact CLI commands. ' +
              'Return only valid JSON — no markdown fences, no preamble.',
          },
          { role: 'user', content: buildPrompt(result) },
        ],
        temperature: 0.2,
        max_tokens: 2048,
        response_format: { type: 'json_object' },
      },
      {
        Authorization: `Bearer ${groqApiKey}`,
        'User-Agent': 'depscope/1.0.0',
      },
    );

    const content: string = response.choices?.[0]?.message?.content ?? '';
    if (!content) return generateRuleBasedInsights(result);

    const parsed = JSON.parse(content) as Record<string, unknown>;

    // The model may return arrays or nested objects for some fields — flatten to string.
    function fieldToString(v: unknown): string {
      if (typeof v === 'string') return v;
      if (Array.isArray(v)) {
        return v
          .map((item, idx) => {
            if (typeof item === 'string') return `${idx + 1}. ${item}`;
            if (typeof item === 'object' && item !== null) {
              const obj = item as Record<string, unknown>;
              // Common shapes: { package, action, command, urgency, reason } or { name, alternative, ... }
              const parts: string[] = [];
              if (obj.package || obj.name) parts.push(`**${obj.package ?? obj.name}**`);
              if (obj.urgency) parts.push(`[${obj.urgency}]`);
              if (obj.action) parts.push(String(obj.action));
              if (obj.reason || obj.description) parts.push(String(obj.reason ?? obj.description));
              if (obj.command) parts.push(`\`${obj.command}\``);
              if (obj.alternative || obj.alternatives) parts.push(`→ ${obj.alternative ?? obj.alternatives}`);
              if (obj.migration_effort || obj.migrationEffort) parts.push(`Migration: ${obj.migration_effort ?? obj.migrationEffort}`);
              return parts.length > 0 ? `${idx + 1}. ${parts.join(' — ')}` : `${idx + 1}. ${JSON.stringify(item)}`;
            }
            return String(item);
          })
          .join('\n');
      }
      if (typeof v === 'object' && v !== null) return JSON.stringify(v, null, 2);
      return String(v ?? '');
    }

    return {
      summary: fieldToString(parsed.summary),
      riskAnalysis: fieldToString(parsed.riskAnalysis),
      recommendations: fieldToString(parsed.recommendations),
      alternatives: fieldToString(parsed.alternatives),
    };
  } catch {
    return generateRuleBasedInsights(result);
  }
}
