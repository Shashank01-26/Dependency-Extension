import React, { useState, useEffect, useCallback } from 'react';
import { ScanResult, AnalyzedDependency, RiskLevel } from './types';
import ScoreRing from './components/ScoreRing';
import StatCard from './components/StatCard';
import DependencyTable from './components/DependencyTable';
import DependencyGraph from './components/DependencyGraph';
import InsightsPanel from './components/InsightsPanel';

// Acquire VS Code API safely
const vscode = (() => {
  try { return (window as any).acquireVsCodeApi(); }
  catch { return { postMessage: () => {} }; }
})();

type Tab = 'table' | 'graph' | 'insights';

type InterceptState =
  | { stage: 'analyzing'; pkg: string }
  | { stage: 'ready'; pkg: string; dep: AnalyzedDependency }
  | null;

const RISK_COLORS: Record<RiskLevel, string> = {
  low:      '#22c55e',
  medium:   '#f59e0b',
  high:     '#f97316',
  critical: '#ef4444',
};

const RISK_BG: Record<RiskLevel, string> = {
  low:      'rgba(34,197,94,0.1)',
  medium:   'rgba(245,158,11,0.1)',
  high:     'rgba(249,115,22,0.1)',
  critical: 'rgba(239,68,68,0.1)',
};


export default function App() {
  const [result, setResult] = useState<ScanResult | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('table');
  const [loading, setLoading] = useState(false);
  const [intercept, setIntercept] = useState<InterceptState>(null);

  // Tell the extension the webview is ready to receive messages.
  // This triggers a replay of any interceptStart/interceptReady that was sent
  // before the React listener was registered (new-panel race condition).
  useEffect(() => {
    vscode.postMessage({ type: 'webviewReady' });
  }, []);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const message = event.data;
      if (message.type === 'setResult') {
        setResult(message.result);
        setLoading(false);
      } else if (message.type === 'loading') {
        setLoading(true);
      } else if (message.type === 'interceptStart') {
        setIntercept({ stage: 'analyzing', pkg: message.package });
      } else if (message.type === 'interceptReady') {
        setIntercept({ stage: 'ready', pkg: message.package, dep: message.dep });
      } else if (message.type === 'interceptDismiss') {
        setIntercept(null);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const handleAnalyze = () => {
    setLoading(true);
    vscode.postMessage({ type: 'analyze' });
  };

  const handleLoadSample = () => {
    vscode.postMessage({ type: 'loadSample' });
  };

  const riskColor = result
    ? (RISK_COLORS[result.summary.overallRiskLevel as RiskLevel] ?? '#6366f1')
    : '#6366f1';

  return (
    <div style={{ background: '#0d0f14', height: '100vh', color: '#e2e8f0', fontFamily: "'Plus Jakarta Sans', sans-serif", display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* ── Install intercept overlay ─────────────────────────────────────── */}
      {intercept && <InterceptOverlay state={intercept} vscode={vscode} onDismiss={() => setIntercept(null)} />}
      {/* Header */}
      <div style={{ background: '#13151c', borderBottom: '1px solid #1e2130', padding: '12px 24px', display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          <path d="M9 12l2 2 4-4"/>
        </svg>
        <span style={{ fontSize: '18px', fontWeight: 700, color: '#f1f5f9' }}>DepScope</span>
        <span style={{ fontSize: '12px', color: '#64748b', background: '#1e2130', padding: '2px 8px', borderRadius: '4px' }}>v1.0.0</span>
        <div style={{ flex: 1 }} />
        {result && (
          <>
            <span style={{ fontSize: '12px', color: '#22c55e', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', padding: '3px 10px', borderRadius: '4px' }}>● Online</span>
            <button onClick={() => vscode.postMessage({ type: 'exportJson' })} style={btnStyle}>Export JSON</button>
            <button onClick={() => vscode.postMessage({ type: 'exportCsv' })} style={btnStyle}>Export CSV</button>
          </>
        )}
        <button onClick={handleAnalyze} style={{ ...btnStyle, background: '#6366f1', color: '#fff', border: 'none' }}>
          {loading ? '⟳ Analyzing...' : '▶ Analyze'}
        </button>
        <button onClick={handleLoadSample} style={btnStyle}>Load Sample</button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
        {loading && !result && <LoadingSkeleton />}

        {!loading && !result && (
          <EmptyState onAnalyze={handleAnalyze} onLoadSample={handleLoadSample} />
        )}

        {result && (
          <>
            {/* Summary */}
            <div style={{ display: 'flex', gap: '24px', marginBottom: '24px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <ScoreRing score={result.summary.overallScore} riskLevel={result.summary.overallRiskLevel} />
              <div style={{ flex: 1, minWidth: '300px' }}>
                <div style={{ marginBottom: '8px' }}>
                  <span style={{ fontSize: '14px', color: '#94a3b8' }}>{result.metadata.projectName}</span>
                  <span style={{ margin: '0 8px', color: '#1e2130' }}>·</span>
                  <span style={{ fontSize: '12px', color: '#64748b', fontFamily: "'Fira Code', monospace" }}>{result.metadata.ecosystem}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '12px' }}>
                  <StatCard label="Total" value={result.summary.totalDependencies} />
                  <StatCard label="Direct" value={result.summary.directCount} />
                  <StatCard label="Dev" value={result.summary.devCount} color="#94a3b8" />
                  <StatCard label="Critical" value={result.summary.criticalCount} color="#ef4444" />
                  <StatCard label="High" value={result.summary.highCount} color="#f97316" />
                  <StatCard label="Medium" value={result.summary.mediumCount} color="#f59e0b" />
                  <StatCard label="Low" value={result.summary.lowCount} color="#22c55e" />
                  <StatCard label="Vulns" value={result.summary.vulnerabilityCount} color="#a78bfa" />
                </div>
              </div>
            </div>

            {/* Tab Bar */}
            <div style={{ borderBottom: '1px solid #1e2130', marginBottom: '0', display: 'flex', gap: '4px' }}>
              {(['table', 'graph', 'insights'] as Tab[]).map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)} style={{
                  padding: '10px 20px', background: 'none', border: 'none', cursor: 'pointer',
                  color: activeTab === tab ? '#6366f1' : '#64748b',
                  borderBottom: activeTab === tab ? '2px solid #6366f1' : '2px solid transparent',
                  fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 600, fontSize: '14px',
                  transition: 'all 0.2s ease', textTransform: 'capitalize',
                }}>
                  {tab === 'table' ? '📋 Table' : tab === 'graph' ? '🕸 Graph' : '🤖 AI Insights'}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div style={{ paddingTop: '16px', transition: 'opacity 0.2s ease' }}>
              {activeTab === 'table' && <DependencyTable dependencies={result.dependencies} />}
              {activeTab === 'graph' && <DependencyGraph dependencies={result.dependencies} />}
              {activeTab === 'insights' && <InsightsPanel result={result} vscode={vscode} />}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: '6px 14px', background: '#1e2130', border: '1px solid #2d3452', borderRadius: '6px',
  color: '#e2e8f0', cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif",
  fontSize: '13px', fontWeight: 500, transition: 'background 0.15s',
};

// ── Intercept overlay ─────────────────────────────────────────────────────────

function InterceptOverlay({
  state,
  vscode,
  onDismiss,
}: {
  state: NonNullable<InterceptState>;
  vscode: any;
  onDismiss: () => void;
}) {
  const decide = (proceed: boolean) => {
    vscode.postMessage({ type: 'interceptDecision', proceed });
    onDismiss();
  };

  const overlayStyle: React.CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 999,
    background: 'rgba(13,15,20,0.88)',
    backdropFilter: 'blur(6px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };

  // ── Analyzing stage ────────────────────────────────────────────────────────
  if (state.stage === 'analyzing') {
    return (
      <div style={overlayStyle}>
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
          <SpinnerRing />
          <div>
            <p style={{ fontSize: '18px', fontWeight: 700, color: '#f1f5f9', marginBottom: '6px' }}>
              Analyzing <code style={{ color: '#a78bfa', background: '#1e1b3a', padding: '2px 8px', borderRadius: '4px' }}>{state.pkg}</code>
            </p>
            <p style={{ fontSize: '13px', color: '#64748b' }}>
              DepScope is checking security, maintenance &amp; popularity…
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Ready stage — show result + decision buttons ───────────────────────────
  const { dep } = state;
  const risk     = dep.riskLevel as RiskLevel;
  const color    = RISK_COLORS[risk];
  const bg       = RISK_BG[risk];
  const cves     = dep.vulnerabilities.length;
  const topFlags = dep.flags.slice(0, 3);

  return (
    <div style={overlayStyle}>
      <div style={{
        background: '#13151c', border: `1px solid ${color}44`,
        borderRadius: '16px', padding: '32px', maxWidth: '480px', width: '90%',
        boxShadow: `0 0 40px ${color}22`,
      }}>
        {/* Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
          <div style={{ background: bg, border: `1px solid ${color}66`, borderRadius: '8px', padding: '8px' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              {risk === 'low'
                ? <path d="M9 12l2 2 4-4"/>
                : <><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>}
            </svg>
          </div>
          <div>
            <p style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '2px' }}>
              Install intercepted
            </p>
            <p style={{ fontSize: '16px', fontWeight: 700, color: '#f1f5f9' }}>
              <code style={{ color: '#a78bfa', background: '#1e1b3a', padding: '1px 6px', borderRadius: '4px', fontSize: '15px' }}>{state.pkg}</code>
            </p>
          </div>
        </div>

        {/* Risk badge row */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <span style={{ background: bg, border: `1px solid ${color}66`, color, borderRadius: '6px', padding: '4px 12px', fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {risk} risk
          </span>
          <span style={{ background: '#1e2130', border: '1px solid #2d3452', color: '#94a3b8', borderRadius: '6px', padding: '4px 12px', fontSize: '13px' }}>
            Score: {dep.score.overall.toFixed(0)}/100
          </span>
          {cves > 0 && (
            <span style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', borderRadius: '6px', padding: '4px 12px', fontSize: '13px', fontWeight: 600 }}>
              {cves} CVE{cves > 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Top flags */}
        {topFlags.length > 0 && (
          <div style={{ background: '#0d0f14', borderRadius: '8px', padding: '12px 14px', marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {topFlags.map((f, i) => (
              <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                <span style={{ color: RISK_COLORS[f.severity as RiskLevel] ?? '#94a3b8', fontSize: '12px', marginTop: '1px', flexShrink: 0 }}>●</span>
                <span style={{ fontSize: '13px', color: '#cbd5e1', lineHeight: 1.4 }}>{f.message}</span>
              </div>
            ))}
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => decide(false)}
            style={{ flex: 1, padding: '10px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: '8px', color: '#ef4444', cursor: 'pointer', fontWeight: 600, fontSize: '14px', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
          >
            Cancel Install
          </button>
          <button
            onClick={() => decide(true)}
            style={{ flex: 1, padding: '10px', background: '#6366f1', border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '14px', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
          >
            Continue Install
          </button>
        </div>
      </div>
    </div>
  );
}

function SpinnerRing() {
  return (
    <>
      <style>{`
        @keyframes depscope-spin { to { transform: rotate(360deg); } }
        .depscope-spinner { animation: depscope-spin 0.9s linear infinite; }
      `}</style>
      <svg className="depscope-spinner" width="52" height="52" viewBox="0 0 52 52" fill="none">
        <circle cx="26" cy="26" r="22" stroke="#1e2130" strokeWidth="4"/>
        <path d="M26 4a22 22 0 0 1 22 22" stroke="#6366f1" strokeWidth="4" strokeLinecap="round"/>
      </svg>
    </>
  );
}

function EmptyState({ onAnalyze, onLoadSample }: { onAnalyze: () => void; onLoadSample: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '50vh', gap: '16px', color: '#64748b' }}>
      <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="1.5" opacity="0.4">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
      <p style={{ fontSize: '18px', fontWeight: 600, color: '#94a3b8' }}>No analysis yet</p>
      <p style={{ fontSize: '14px', textAlign: 'center', maxWidth: '300px' }}>
        Open a project with package.json, pubspec.yaml, or build.gradle and run an analysis.
      </p>
      <div style={{ display: 'flex', gap: '12px' }}>
        <button onClick={onAnalyze} style={{ padding: '10px 24px', background: '#6366f1', border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '14px' }}>
          ▶ Analyze Project
        </button>
        <button onClick={onLoadSample} style={{ padding: '10px 24px', background: '#1e2130', border: '1px solid #2d3452', borderRadius: '8px', color: '#e2e8f0', cursor: 'pointer', fontWeight: 600, fontSize: '14px' }}>
          Load Sample
        </button>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  const pulse = { animation: 'pulse 1.5s ease-in-out infinite', background: 'linear-gradient(90deg, #1e2130 25%, #2d3452 50%, #1e2130 75%)', backgroundSize: '200% 100%', borderRadius: '8px' };
  return (
    <div>
      <style>{`@keyframes pulse { 0%,100% { background-position: 200% 0; } 50% { background-position: -200% 0; } }`}</style>
      <div style={{ display: 'flex', gap: '24px', marginBottom: '24px' }}>
        <div style={{ ...pulse, width: '180px', height: '180px', borderRadius: '50%' }} />
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', alignContent: 'start' }}>
          {Array(8).fill(0).map((_, i) => <div key={i} style={{ ...pulse, height: '70px' }} />)}
        </div>
      </div>
      {Array(5).fill(0).map((_, i) => <div key={i} style={{ ...pulse, height: '52px', marginBottom: '8px' }} />)}
    </div>
  );
}
