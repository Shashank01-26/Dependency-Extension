import React, { useEffect, useState } from 'react';
import { ScanResult } from '../types';
import { AiInsightsData, AiInsightsStatus } from '../types';

interface Props {
  result: ScanResult;
  vscode: { postMessage: (msg: any) => void };
  aiInsights: AiInsightsData | null;
  aiStatus: AiInsightsStatus;
  aiError: string | null;
}

// ─── Tiny markdown renderer ───────────────────────────────────────────────────
// Handles: ## headings, - bullets, 1. numbered lists, **bold**, `code`, blank lines

function InlineMd({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith('**') && p.endsWith('**')) {
          return <strong key={i} style={{ color: '#e2e8f0', fontWeight: 600 }}>{p.slice(2, -2)}</strong>;
        }
        if (p.startsWith('`') && p.endsWith('`')) {
          return (
            <code key={i} style={{
              fontFamily: "'Fira Code', monospace", fontSize: '11px',
              color: '#a78bfa', background: '#1e1b3a',
              padding: '1px 5px', borderRadius: '3px',
            }}>{p.slice(1, -1)}</code>
          );
        }
        return <React.Fragment key={i}>{p}</React.Fragment>;
      })}
    </>
  );
}

function MarkdownLite({ text, accentColor }: { text: string; accentColor: string }) {
  const safeText = String(text ?? '');
  if (!safeText) return null;
  const lines = safeText.split('\n');
  const elements: React.ReactNode[] = [];

  lines.forEach((line, i) => {
    const trimmed = line.trim();

    if (!trimmed) {
      elements.push(<div key={i} style={{ height: '8px' }} />);
      return;
    }

    // ## heading
    if (trimmed.startsWith('## ')) {
      elements.push(
        <p key={i} style={{
          fontSize: '12px', fontWeight: 700, color: accentColor,
          textTransform: 'uppercase', letterSpacing: '0.06em',
          marginTop: '14px', marginBottom: '6px',
        }}>
          {trimmed.slice(3)}
        </p>,
      );
      return;
    }

    // Numbered list item: "1. ..." or "1) ..."
    const numMatch = trimmed.match(/^(\d+)[.)]\s+(.+)/);
    if (numMatch) {
      elements.push(
        <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '6px', alignItems: 'flex-start' }}>
          <span style={{
            minWidth: '20px', height: '20px', borderRadius: '50%',
            background: `${accentColor}25`, border: `1px solid ${accentColor}50`,
            color: accentColor, fontSize: '10px', fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, marginTop: '1px',
          }}>{numMatch[1]}</span>
          <p style={{ fontSize: '13px', color: '#94a3b8', lineHeight: 1.65, flex: 1, margin: 0 }}>
            <InlineMd text={numMatch[2]} />
          </p>
        </div>,
      );
      return;
    }

    // Bullet: "- " or "• "
    if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
      elements.push(
        <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '5px', alignItems: 'flex-start' }}>
          <span style={{ color: accentColor, fontSize: '14px', lineHeight: 1, marginTop: '3px', flexShrink: 0 }}>›</span>
          <p style={{ fontSize: '13px', color: '#94a3b8', lineHeight: 1.65, flex: 1, margin: 0 }}>
            <InlineMd text={trimmed.slice(2)} />
          </p>
        </div>,
      );
      return;
    }

    // Normal paragraph line
    elements.push(
      <p key={i} style={{ fontSize: '13px', color: '#94a3b8', lineHeight: 1.75, marginBottom: '4px' }}>
        <InlineMd text={trimmed} />
      </p>,
    );
  });

  return <>{elements}</>;
}

// ─── Card configs ─────────────────────────────────────────────────────────────

const CARDS = [
  {
    key: 'summary' as const,
    title: 'Executive Summary',
    color: '#6366f1',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>
      </svg>
    ),
  },
  {
    key: 'riskAnalysis' as const,
    title: 'Risk Deep-Dive',
    color: '#f97316',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
    ),
  },
  {
    key: 'recommendations' as const,
    title: 'Action Plan',
    color: '#22c55e',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
      </svg>
    ),
  },
  {
    key: 'alternatives' as const,
    title: 'Safer Alternatives',
    color: '#a78bfa',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/>
      </svg>
    ),
  },
] as const;

// ─── Main component ───────────────────────────────────────────────────────────

export default function InsightsPanel({ result, vscode, aiInsights, aiStatus, aiError }: Props) {
  const [visible, setVisible] = useState<Set<number>>(new Set());

  // Request insights when this tab mounts and no data exists yet
  useEffect(() => {
    if (aiStatus === 'idle') {
      vscode.postMessage({ type: 'requestInsights', result });
    }
  }, [aiStatus]);

  // Stagger card entrance when insights arrive
  useEffect(() => {
    if (aiStatus === 'ready') {
      const timers = CARDS.map((_, i) =>
        setTimeout(() => setVisible(prev => new Set([...prev, i])), i * 120)
      );
      return () => timers.forEach(clearTimeout);
    }
  }, [aiStatus]);

  // ── Loading ───────────────────────────────────────────────────────────────
  if (aiStatus === 'idle' || aiStatus === 'loading') {
    return (
      <div>
        <AIHeader />
        <LoadingShimmer />
      </div>
    );
  }

  // ── No API key ────────────────────────────────────────────────────────────
  if (aiStatus === 'error' && aiError === 'no_api_key') {
    return (
      <div>
        <AIHeader />
        <NoApiKeyState result={result} />
      </div>
    );
  }

  // ── API error ─────────────────────────────────────────────────────────────
  if (aiStatus === 'error') {
    return (
      <div>
        <AIHeader />
        <ApiErrorState message={aiError || 'Unknown error'} onRetry={() => vscode.postMessage({ type: 'requestInsights', result })} />
      </div>
    );
  }

  // ── Ready ─────────────────────────────────────────────────────────────────
  if (!aiInsights) {
    return (
      <div>
        <AIHeader />
        <LoadingShimmer />
      </div>
    );
  }

  return (
    <div>
      <AIHeader onRegenerate={() => vscode.postMessage({ type: 'requestInsights', result })} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        {CARDS.map((card, i) => {
          const bodyText = aiInsights?.[card.key] ?? '';
          return (
            <InsightCard
              key={card.key}
              title={card.title}
              color={card.color}
              icon={card.icon}
              body={bodyText}
              visible={visible.has(i)}
            />
          );
        })}
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function AIHeader({ onRegenerate }: { onRegenerate?: () => void }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid #1e2130',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{
          width: '28px', height: '28px', borderRadius: '6px',
          background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2.2">
            <path d="M12 2a10 10 0 100 20A10 10 0 0012 2z"/>
            <path d="M12 6v6l4 2"/>
          </svg>
        </div>
        <div>
          <span style={{ fontSize: '14px', fontWeight: 700, color: '#f1f5f9' }}>AI Insights</span>
          <span style={{
            marginLeft: '8px', fontSize: '10px', color: '#6366f1',
            background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)',
            padding: '2px 7px', borderRadius: '4px', fontWeight: 600,
          }}>Groq · llama-3.3-70b</span>
        </div>
      </div>
      {onRegenerate && (
        <button onClick={onRegenerate} style={{
          display: 'flex', alignItems: 'center', gap: '5px',
          padding: '5px 12px', background: '#13151c', border: '1px solid #1e2130',
          borderRadius: '6px', color: '#64748b', cursor: 'pointer',
          fontSize: '12px', fontWeight: 500,
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/>
          </svg>
          Regenerate
        </button>
      )}
    </div>
  );
}

function InsightCard({
  title, color, icon, body, visible,
}: {
  title: string; color: string; icon: React.ReactNode;
  body: string; visible: boolean;
}) {
  return (
    <div style={{
      background: '#13151c', border: '1px solid #1e2130', borderRadius: '12px',
      borderTop: `3px solid ${color}`,
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(10px)',
      transition: 'opacity 0.35s ease, transform 0.35s ease',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Card header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '9px',
        padding: '14px 16px 10px',
        borderBottom: `1px solid ${color}18`,
      }}>
        <span style={{ color, display: 'flex' }}>{icon}</span>
        <h3 style={{ fontSize: '13px', fontWeight: 700, color: '#f1f5f9', letterSpacing: '0.01em' }}>{title}</h3>
      </div>
      {/* Card body — scrollable */}
      <div style={{ padding: '12px 16px 16px', overflowY: 'auto', maxHeight: '300px' }}>
        {body
          ? <MarkdownLite text={body} accentColor={color} />
          : <p style={{ fontSize: '13px', color: '#475569', fontStyle: 'italic' }}>No data for this section.</p>
        }
      </div>
    </div>
  );
}

function LoadingShimmer() {
  return (
    <>
      <style>{`
        @keyframes ds-shimmer {
          0%,100% { background-position: 200% 0; }
          50% { background-position: -200% 0; }
        }
      `}</style>
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', gap: '12px', padding: '20px 0 24px',
      }}>
        <GeneratingSpinner />
        <p style={{ fontSize: '13px', color: '#64748b' }}>Generating AI analysis with Groq…</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        {Array(4).fill(0).map((_, i) => (
          <div key={i} style={{
            borderRadius: '12px', height: '200px',
            background: 'linear-gradient(90deg, #13151c 25%, #1e2130 50%, #13151c 75%)',
            backgroundSize: '200% 100%',
            animation: `ds-shimmer 1.8s ease-in-out infinite`,
            animationDelay: `${i * 0.15}s`,
            border: '1px solid #1e2130',
          }} />
        ))}
      </div>
    </>
  );
}

function GeneratingSpinner() {
  return (
    <>
      <style>{`@keyframes ds-spin { to { transform: rotate(360deg); } }`}</style>
      <svg
        width="36" height="36" viewBox="0 0 36 36" fill="none"
        style={{ animation: 'ds-spin 1s linear infinite' }}
      >
        <circle cx="18" cy="18" r="14" stroke="#1e2130" strokeWidth="3" />
        <path d="M18 4a14 14 0 0114 14" stroke="#6366f1" strokeWidth="3" strokeLinecap="round" />
      </svg>
    </>
  );
}

function NoApiKeyState({ result }: { result: ScanResult }) {
  return (
    <div style={{
      background: '#13151c', border: '1px solid #1e2130', borderRadius: '12px',
      padding: '32px', maxWidth: '560px', margin: '0 auto',
    }}>
      <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
        <div style={{
          width: '40px', height: '40px', borderRadius: '8px', flexShrink: 0,
          background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0110 0v4"/>
          </svg>
        </div>
        <div>
          <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#f1f5f9', marginBottom: '6px' }}>
            Configure Groq API Key for AI Insights
          </h3>
          <p style={{ fontSize: '13px', color: '#64748b', lineHeight: 1.65, marginBottom: '18px' }}>
            DepScope uses Groq's <code style={{ color: '#a78bfa', background: '#1e1b3a', padding: '1px 5px', borderRadius: '3px', fontSize: '12px' }}>llama-3.3-70b-versatile</code> model
            to generate deep, actionable security insights for your dependency scan. It's free — get your key in under a minute.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
            {[
              { step: '1', text: 'Visit console.groq.com and create a free account' },
              { step: '2', text: 'Generate an API key under API Keys → Create API key' },
              { step: '3', text: 'Open VS Code Settings (⌘, or Ctrl+,) and search "DepScope"' },
              { step: '4', text: 'Paste your key into the DepScope: Groq Api Key field' },
              { step: '5', text: 'Switch to another tab and back — insights will generate automatically' },
            ].map(({ step, text }) => (
              <div key={step} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <span style={{
                  minWidth: '22px', height: '22px', borderRadius: '50%',
                  background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.4)',
                  color: '#6366f1', fontSize: '11px', fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>{step}</span>
                <p style={{ fontSize: '13px', color: '#94a3b8', lineHeight: 1.55, margin: 0 }}>{text}</p>
              </div>
            ))}
          </div>
          {/* Rule-based summary while no key is set */}
          <RuleBasedSummary result={result} />
        </div>
      </div>
    </div>
  );
}

function ApiErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div style={{
      background: '#13151c', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '12px',
      padding: '24px', maxWidth: '480px', margin: '0 auto', textAlign: 'center',
    }}>
      <div style={{
        width: '44px', height: '44px', borderRadius: '50%', margin: '0 auto 14px',
        background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      </div>
      <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#f1f5f9', marginBottom: '8px' }}>
        AI Insights Failed
      </h3>
      <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '16px', fontFamily: "'Fira Code', monospace", wordBreak: 'break-all' }}>
        {message}
      </p>
      <button onClick={onRetry} style={{
        padding: '8px 20px', background: '#6366f1', border: 'none',
        borderRadius: '8px', color: '#fff', cursor: 'pointer',
        fontWeight: 600, fontSize: '13px',
      }}>
        Retry
      </button>
    </div>
  );
}

// ── Compact rule-based summary shown in the "no key" state ───────────────────
function RuleBasedSummary({ result }: { result: ScanResult }) {
  const { summary, dependencies } = result;
  const critical = dependencies.filter(d => d.riskLevel === 'critical');
  const high = dependencies.filter(d => d.riskLevel === 'high');
  const vulnerable = dependencies.filter(d => d.vulnerabilities?.length > 0);
  const deprecated = dependencies.filter(d => d.flags?.some(f => f.type === 'deprecated'));

  const RISK_COLORS: Record<string, string> = {
    critical: '#ef4444', high: '#f97316', medium: '#f59e0b', low: '#22c55e',
  };
  const riskColor = RISK_COLORS[summary.overallRiskLevel] || '#6366f1';

  return (
    <div style={{ borderTop: '1px solid #1e2130', paddingTop: '16px' }}>
      <p style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>
        Rule-Based Summary (while AI is unavailable)
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
        {[
          { label: 'Overall Score', value: `${summary.overallScore}/100 — ${summary.overallRiskLevel.toUpperCase()}`, color: riskColor },
          { label: 'Total Dependencies', value: `${summary.totalDependencies} (${summary.directCount} direct)`, color: '#94a3b8' },
          ...(summary.vulnerabilityCount > 0 ? [{ label: 'Vulnerabilities', value: `${summary.vulnerabilityCount} CVE${summary.vulnerabilityCount > 1 ? 's' : ''}`, color: '#ef4444' }] : []),
          ...(critical.length > 0 ? [{ label: 'Critical Packages', value: critical.map(d => d.name).join(', '), color: '#ef4444' }] : []),
          ...(high.length > 0 ? [{ label: 'High-Risk Packages', value: high.slice(0, 4).map(d => d.name).join(', ') + (high.length > 4 ? ` +${high.length - 4} more` : ''), color: '#f97316' }] : []),
          ...(deprecated.length > 0 ? [{ label: 'Deprecated', value: deprecated.map(d => d.name).join(', '), color: '#f59e0b' }] : []),
          ...(vulnerable.length > 0 ? [{ label: 'Vulnerable', value: vulnerable.map(d => `${d.name} (${d.vulnerabilities.length})`).join(', '), color: '#a78bfa' }] : []),
        ].map(({ label, value, color }) => (
          <div key={label} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '12px', color: '#475569', minWidth: '140px', flexShrink: 0 }}>{label}</span>
            <span style={{ fontSize: '12px', color, fontFamily: "'Fira Code', monospace", lineHeight: 1.4 }}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
