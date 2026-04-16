import * as https from 'https';
import { ScanResult } from './types/index.js';

interface InsightCard {
  type: 'summary' | 'risk-analysis' | 'recommendations' | 'alternatives';
  title: string;
  body: string;
  alternative?: string;
}

function httpsPost(url: string, body: any, headers: Record<string, string>): Promise<any> {
  return new Promise((resolve, reject) => {
    const options = new URL(url);
    const bodyStr = JSON.stringify(body);
    const req = https.request({
      hostname: options.hostname,
      path: options.pathname + options.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr), ...headers },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({}); } });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('timeout')); });
    req.write(bodyStr);
    req.end();
  });
}

function generateRuleBasedInsights(result: ScanResult): InsightCard[] {
  const { summary, dependencies } = result;
  const critical = dependencies.filter(d => d.riskLevel === 'critical');
  const high = dependencies.filter(d => d.riskLevel === 'high');
  const deprecated = dependencies.filter(d => d.flags.some(f => f.type === 'deprecated'));
  const vulnerable = dependencies.filter(d => d.vulnerabilities.length > 0);
  const singleMaintainer = dependencies.filter(d => d.flags.some(f => f.type === 'single-maintainer'));
  const deepChain = dependencies.filter(d => d.flags.some(f => f.type === 'deep-chain'));

  const cards: InsightCard[] = [];

  cards.push({
    type: 'summary',
    title: 'Dependency Health Summary',
    body: `Your project has ${summary.totalDependencies} dependencies with an overall risk score of ${summary.overallScore}/100 (${summary.overallRiskLevel.toUpperCase()}). ` +
      `${summary.criticalCount} critical, ${summary.highCount} high, ${summary.mediumCount} medium, and ${summary.lowCount} low-risk packages detected. ` +
      (summary.vulnerabilityCount > 0 ? `⚠️ ${summary.vulnerabilityCount} known vulnerabilities found across your dependency tree.` : '✅ No known vulnerabilities detected.'),
  });

  if (critical.length > 0 || high.length > 0) {
    cards.push({
      type: 'risk-analysis',
      title: 'High-Priority Risks',
      body: [
        critical.length > 0 ? `🔴 Critical: ${critical.map(d => d.name).join(', ')}` : '',
        high.length > 0 ? `🟠 High Risk: ${high.map(d => d.name).join(', ')}` : '',
        deprecated.length > 0 ? `⛔ Deprecated packages: ${deprecated.map(d => d.name).join(', ')} — these should be replaced immediately.` : '',
        vulnerable.length > 0 ? `🛡️ Vulnerable: ${vulnerable.map(d => `${d.name} (${d.vulnerabilities.length} CVEs)`).join(', ')}` : '',
      ].filter(Boolean).join('\n'),
    });
  }

  cards.push({
    type: 'recommendations',
    title: 'Recommended Actions',
    body: [
      deprecated.length > 0 ? `1. Replace deprecated packages: ${deprecated.map(d => d.name).join(', ')}` : '',
      vulnerable.length > 0 ? `2. Patch vulnerabilities in: ${vulnerable.map(d => d.name).join(', ')}` : '',
      singleMaintainer.length > 0 ? `3. Evaluate bus-factor risk for single-maintainer packages: ${singleMaintainer.map(d => d.name).join(', ')}` : '',
      deepChain.length > 0 ? `4. Review deep dependency chains: ${deepChain.map(d => d.name).join(', ')}` : '',
      '5. Run regular dependency audits and keep packages up to date.',
      '6. Consider using a dependency monitoring service like Dependabot or Renovate.',
    ].filter(Boolean).join('\n'),
  });

  if (deprecated.length > 0) {
    const alternatives: Record<string, string> = {
      'request': 'axios or node-fetch',
      'node-uuid': 'uuid',
      'left-pad': 'String.prototype.padStart()',
      'moment': 'date-fns or dayjs',
    };
    const altList = deprecated.map(d => {
      const alt = alternatives[d.name];
      return alt ? `• ${d.name} → consider ${alt}` : `• ${d.name} → check npm for maintained alternatives`;
    }).join('\n');

    cards.push({
      type: 'alternatives',
      title: 'Suggested Alternatives',
      body: `Consider migrating away from these deprecated or high-risk packages:\n${altList}`,
    });
  }

  return cards;
}

export async function generateAiInsights(result: ScanResult, groqApiKey?: string): Promise<InsightCard[]> {
  if (!groqApiKey) return generateRuleBasedInsights(result);

  try {
    const topDeps = result.dependencies
      .sort((a, b) => b.score.overall - a.score.overall)
      .slice(0, 15)
      .map(d => ({
        name: d.name,
        version: d.version,
        score: d.score.overall,
        riskLevel: d.riskLevel,
        flags: d.flags.map(f => f.type),
        vulns: d.vulnerabilities.length,
      }));

    const prompt = `You are a software security expert. Analyze these npm/Flutter/Android dependencies and provide actionable insights.

Project: ${result.metadata.projectName}
Ecosystem: ${result.metadata.ecosystem}
Overall Risk Score: ${result.summary.overallScore}/100 (${result.summary.overallRiskLevel})
Total Dependencies: ${result.summary.totalDependencies}
Critical: ${result.summary.criticalCount}, High: ${result.summary.highCount}, Medium: ${result.summary.mediumCount}, Low: ${result.summary.lowCount}
Vulnerabilities: ${result.summary.vulnerabilityCount}

Top Risk Dependencies:
${JSON.stringify(topDeps, null, 2)}

Respond with a JSON array of exactly 4 insight cards. Each card has: type (one of: summary, risk-analysis, recommendations, alternatives), title (string), body (string, 2-4 sentences), optional alternative (string for alternatives type).

Return ONLY valid JSON array, no markdown.`;

    const response = await httpsPost(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.35,
        max_tokens: 4096,
      },
      {
        'Authorization': `Bearer ${groqApiKey}`,
        'User-Agent': 'depscope/1.0.0',
      }
    );

    const content = response.choices?.[0]?.message?.content || '';
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed)) return parsed;
    }
    return generateRuleBasedInsights(result);
  } catch {
    return generateRuleBasedInsights(result);
  }
}
