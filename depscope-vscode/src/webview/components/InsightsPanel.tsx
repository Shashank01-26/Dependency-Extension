import React, { useState, useEffect } from 'react';
import { ScanResult } from '../types';

interface InsightCard {
  type: 'summary' | 'risk-analysis' | 'recommendations' | 'alternatives';
  title: string;
  body: string;
  alternative?: string;
}

const cardIcons: Record<string, string> = {
  'summary': '📊',
  'risk-analysis': '🔍',
  'recommendations': '✅',
  'alternatives': '🔄',
};

const cardColors: Record<string, string> = {
  'summary': '#6366f1',
  'risk-analysis': '#f97316',
  'recommendations': '#22c55e',
  'alternatives': '#a78bfa',
};

interface Props {
  result: ScanResult;
  vscode: { postMessage: (msg: any) => void };
}

function generateRuleBasedInsights(result: ScanResult): InsightCard[] {
  const { summary, dependencies } = result;
  const critical = dependencies.filter(d => d.riskLevel === 'critical');
  const high = dependencies.filter(d => d.riskLevel === 'high');
  const deprecated = dependencies.filter(d => d.flags?.some(f => f.type === 'deprecated'));
  const vulnerable = dependencies.filter(d => d.vulnerabilities?.length > 0);
  const singleMaintainer = dependencies.filter(d => d.flags?.some(f => f.type === 'single-maintainer'));
  const deepChain = dependencies.filter(d => d.flags?.some(f => f.type === 'deep-chain'));

  return [
    {
      type: 'summary',
      title: 'Dependency Health Summary',
      body: `Your project has ${summary.totalDependencies} dependencies with an overall risk score of ${summary.overallScore}/100 (${summary.overallRiskLevel.toUpperCase()}). ${summary.criticalCount} critical, ${summary.highCount} high, ${summary.mediumCount} medium, and ${summary.lowCount} low-risk packages detected. ${summary.vulnerabilityCount > 0 ? `⚠️ ${summary.vulnerabilityCount} known vulnerabilities found.` : '✅ No known vulnerabilities detected.'}`,
    },
    {
      type: 'risk-analysis',
      title: 'High-Priority Risks',
      body: [
        critical.length > 0 ? `🔴 Critical packages: ${critical.map(d => d.name).join(', ')}` : '',
        high.length > 0 ? `🟠 High-risk packages: ${high.map(d => d.name).join(', ')}` : '',
        deprecated.length > 0 ? `⛔ Deprecated: ${deprecated.map(d => d.name).join(', ')} — these must be replaced.` : '',
        vulnerable.length > 0 ? `🛡 Vulnerable: ${vulnerable.map(d => `${d.name} (${d.vulnerabilities.length} CVE${d.vulnerabilities.length > 1 ? 's' : ''})`).join(', ')}` : '',
        critical.length === 0 && high.length === 0 && deprecated.length === 0 && vulnerable.length === 0 ? '✅ No critical or high-priority risks found. Your dependencies look healthy!' : '',
      ].filter(Boolean).join('\n\n'),
    },
    {
      type: 'recommendations',
      title: 'Recommended Actions',
      body: [
        deprecated.length > 0 ? `1. Replace deprecated packages: ${deprecated.map(d => d.name).join(', ')}` : '',
        vulnerable.length > 0 ? `2. Patch known vulnerabilities in: ${vulnerable.map(d => d.name).join(', ')}` : '',
        singleMaintainer.length > 0 ? `3. Evaluate single-maintainer bus-factor risk for: ${singleMaintainer.map(d => d.name).join(', ')}` : '',
        deepChain.length > 0 ? `4. Audit deep dependency chains in: ${deepChain.map(d => d.name).join(', ')}` : '',
        '5. Run regular audits and keep packages updated (Dependabot / Renovate).',
        '6. Consider pinning exact versions in production to avoid surprise updates.',
      ].filter(Boolean).join('\n'),
    },
    {
      type: 'alternatives',
      title: 'Suggested Alternatives',
      body: deprecated.length > 0
        ? `Consider migrating away from these deprecated packages:\n${deprecated.map(d => {
            const alts: Record<string, string> = { request: 'axios or node-fetch', 'node-uuid': 'uuid', 'left-pad': 'String.padStart()', moment: 'date-fns or dayjs' };
            return `• ${d.name} → ${alts[d.name] || 'check npm/pub.dev for maintained alternatives'}`;
          }).join('\n')}`
        : `All packages are actively maintained. No immediate replacements needed. Continue monitoring for deprecation notices.`,
    },
  ];
}

export default function InsightsPanel({ result, vscode }: Props) {
  const [cards, setCards] = useState<InsightCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState<Set<number>>(new Set());

  useEffect(() => {
    setLoading(true);
    setVisible(new Set());
    // Generate rule-based insights immediately (Groq calls happen in core subprocess)
    const insights = generateRuleBasedInsights(result);
    setCards(insights);
    setLoading(false);
    // Staggered entrance
    insights.forEach((_, i) => {
      setTimeout(() => setVisible(prev => new Set([...prev, i])), i * 80);
    });
  }, [result]);

  if (loading) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        {Array(4).fill(0).map((_, i) => (
          <div key={i} style={{ background: '#13151c', border: '1px solid #1e2130', borderRadius: '12px', padding: '20px', height: '160px', animation: 'pulse 1.5s ease-in-out infinite', backgroundImage: 'linear-gradient(90deg, #13151c 25%, #1e2130 50%, #13151c 75%)', backgroundSize: '200% 100%' }} />
        ))}
        <style>{`@keyframes pulse { 0%,100% { background-position: 200% 0; } 50% { background-position: -200% 0; } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
      {cards.map((card, i) => {
        const color = cardColors[card.type] || '#6366f1';
        const icon = cardIcons[card.type] || '💡';
        return (
          <div
            key={i}
            style={{
              background: '#13151c', border: `1px solid #1e2130`, borderRadius: '12px', padding: '20px',
              borderTop: `3px solid ${color}`,
              opacity: visible.has(i) ? 1 : 0,
              transform: visible.has(i) ? 'translateY(0)' : 'translateY(8px)',
              transition: 'opacity 0.35s ease, transform 0.35s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <span style={{ fontSize: '22px' }}>{icon}</span>
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#f1f5f9' }}>{card.title}</h3>
            </div>
            <p style={{ fontSize: '13px', color: '#94a3b8', lineHeight: '1.7', whiteSpace: 'pre-line' }}>{card.body}</p>
            {card.alternative && (
              <div style={{ marginTop: '12px', padding: '8px 12px', background: `${color}15`, border: `1px solid ${color}30`, borderRadius: '6px' }}>
                <span style={{ fontSize: '12px', color, fontWeight: 600 }}>Alternative: </span>
                <span style={{ fontSize: '12px', color: '#94a3b8' }}>{card.alternative}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
