import React, { useState, useMemo } from 'react';
import { AnalyzedDependency } from '../types';
import RiskBadge from './RiskBadge';
import FlagPill from './FlagPill';
import MetricBar from './MetricBar';

type SortBy = 'name' | 'score' | 'downloads' | 'maintainers';

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

interface Props {
  dependencies: AnalyzedDependency[];
}

export default function DependencyTable({ dependencies }: Props) {
  const [search, setSearch] = useState('');
  const [showDev, setShowDev] = useState(true);
  const [sortBy, setSortBy] = useState<SortBy>('score');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    let list = [...dependencies];
    if (search) list = list.filter(d => d.name.toLowerCase().includes(search.toLowerCase()));
    if (!showDev) list = list.filter(d => !d.isDev);
    list.sort((a, b) => {
      let av: number | string, bv: number | string;
      if (sortBy === 'name') { av = a.name; bv = b.name; }
      else if (sortBy === 'score') { av = a.score.overall; bv = b.score.overall; }
      else if (sortBy === 'downloads') { av = a.registryData.weeklyDownloads; bv = b.registryData.weeklyDownloads; }
      else { av = a.registryData.maintainers; bv = b.registryData.maintainers; }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [dependencies, search, showDev, sortBy, sortDir]);

  const toggleSort = (col: SortBy) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('desc'); }
  };

  const toggleExpand = (name: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const SortBtn = ({ col, label }: { col: SortBy; label: string }) => (
    <span onClick={() => toggleSort(col)} style={{ cursor: 'pointer', userSelect: 'none', color: sortBy === col ? '#6366f1' : '#64748b' }}>
      {label} {sortBy === col ? (sortDir === 'desc' ? '↓' : '↑') : ''}
    </span>
  );

  return (
    <div>
      {/* Filter Bar */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', alignItems: 'center' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search packages..."
          style={{
            flex: 1, background: '#13151c', border: '1px solid #1e2130', borderRadius: '8px',
            padding: '8px 14px', color: '#e2e8f0', fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontSize: '14px', outline: 'none',
          }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: '#94a3b8', fontSize: '14px', userSelect: 'none' }}>
          <input type="checkbox" checked={showDev} onChange={e => setShowDev(e.target.checked)} style={{ accentColor: '#6366f1' }} />
          Show Dev
        </label>
        <span style={{ color: '#64748b', fontSize: '13px' }}>{filtered.length} packages</span>
      </div>

      {/* Table Header */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px 110px 100px 1fr', gap: '0', background: '#13151c', border: '1px solid #1e2130', borderRadius: '10px 10px 0 0', padding: '10px 16px', fontSize: '12px', color: '#64748b', fontWeight: 600 }}>
        <SortBtn col="name" label="PACKAGE" />
        <SortBtn col="score" label="RISK SCORE" />
        <SortBtn col="downloads" label="DOWNLOADS" />
        <SortBtn col="maintainers" label="MAINTAINERS" />
        <span>FLAGS</span>
      </div>

      {/* Rows */}
      {filtered.length === 0 && (
        <div style={{ background: '#13151c', border: '1px solid #1e2130', borderTop: 'none', borderRadius: '0 0 10px 10px', padding: '32px', textAlign: 'center', color: '#64748b' }}>
          No packages match your filter.
        </div>
      )}

      {filtered.map((dep, idx) => {
        const isExpanded = expanded.has(dep.name);
        const isLast = idx === filtered.length - 1;
        return (
          <div key={dep.name} style={{ border: '1px solid #1e2130', borderTop: 'none', borderRadius: isLast && !isExpanded ? '0 0 10px 10px' : '0' }}>
            {/* Row */}
            <div
              onClick={() => toggleExpand(dep.name)}
              style={{
                display: 'grid', gridTemplateColumns: '1fr 140px 110px 100px 1fr', gap: '0',
                padding: '12px 16px', background: '#0d0f14', cursor: 'pointer', alignItems: 'center',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#13151c')}
              onMouseLeave={e => (e.currentTarget.style.background = '#0d0f14')}
            >
              {/* Name */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontFamily: "'Fira Code', monospace", fontSize: '13px', color: '#e2e8f0' }}>{dep.name}</span>
                <span style={{ fontFamily: "'Fira Code', monospace", fontSize: '11px', color: '#64748b' }}>@{dep.version}</span>
                {dep.isDev && <span style={{ fontSize: '10px', background: '#1e2130', color: '#94a3b8', padding: '1px 6px', borderRadius: '4px' }}>DEV</span>}
              </div>
              {/* Score */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <RiskBadge level={dep.riskLevel} />
                <div style={{ flex: 1, height: '4px', background: '#1e2130', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${dep.score.overall}%`, background: riskColor(dep.riskLevel), borderRadius: '2px' }} />
                </div>
                <span style={{ fontSize: '12px', fontFamily: "'Fira Code', monospace", color: '#94a3b8', minWidth: '28px' }}>{Math.round(dep.score.overall)}</span>
              </div>
              {/* Downloads */}
              <span style={{ fontSize: '13px', color: '#94a3b8', fontFamily: "'Fira Code', monospace" }}>{fmt(dep.registryData.weeklyDownloads)}/wk</span>
              {/* Maintainers */}
              <span style={{ fontSize: '13px', color: '#94a3b8' }}>{dep.registryData.maintainers}</span>
              {/* Flags */}
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
                {dep.flags.slice(0, 3).map(f => <FlagPill key={f.type} flag={f} />)}
                {dep.flags.length > 3 && <span style={{ fontSize: '11px', color: '#64748b' }}>+{dep.flags.length - 3} more</span>}
              </div>
            </div>

            {/* Expanded Row */}
            {isExpanded && (
              <div style={{ background: '#0a0c10', borderTop: '1px solid #1e2130', padding: '16px 24px', animation: 'expandIn 0.15s ease' }}>
                <style>{`@keyframes expandIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }`}</style>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '24px' }}>
                  {/* Metrics */}
                  <div>
                    <p style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Risk Breakdown</p>
                    <MetricBar label="Maintenance" value={dep.score.maintenance} weight="25%" />
                    <MetricBar label="Security" value={dep.score.security} weight="30%" />
                    <MetricBar label="Popularity" value={dep.score.popularity} weight="15%" />
                    <MetricBar label="Community" value={dep.score.community} weight="15%" />
                    <MetricBar label="Dep Depth" value={dep.score.depthRisk} weight="15%" />
                  </div>
                  {/* GitHub + Registry */}
                  <div>
                    <p style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Package Info</p>
                    <InfoRow label="Last Publish" value={new Date(dep.registryData.lastPublish).toLocaleDateString()} />
                    <InfoRow label="Versions" value={dep.registryData.versions} />
                    <InfoRow label="License" value={dep.registryData.license} />
                    {dep.registryData.deprecation && <InfoRow label="Deprecated" value={dep.registryData.deprecation} highlight />}
                    {dep.github && (
                      <>
                        <InfoRow label="Stars" value={`★ ${fmt(dep.github.stars)}`} />
                        <InfoRow label="Forks" value={dep.github.forks} />
                        <InfoRow label="Open Issues" value={dep.github.openIssues} />
                        <InfoRow label="Last Commit" value={new Date(dep.github.lastCommit).toLocaleDateString()} />
                        {dep.github.archived && <InfoRow label="Status" value="⚠ Archived" highlight />}
                      </>
                    )}
                  </div>
                  {/* Flags + Vulns */}
                  <div>
                    {dep.flags.length > 0 && (
                      <>
                        <p style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Risk Flags</p>
                        {dep.flags.map(f => (
                          <div key={f.type} style={{ marginBottom: '8px' }}>
                            <FlagPill flag={f} />
                            <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '3px', marginLeft: '4px' }}>{f.message}</p>
                          </div>
                        ))}
                      </>
                    )}
                    {dep.vulnerabilities.length > 0 && (
                      <>
                        <p style={{ fontSize: '12px', fontWeight: 700, color: '#ef4444', marginBottom: '12px', marginTop: '12px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Vulnerabilities ({dep.vulnerabilities.length})</p>
                        {dep.vulnerabilities.map((v, i) => (
                          <div key={i} style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '6px', padding: '8px 10px', marginBottom: '6px' }}>
                            <p style={{ fontSize: '12px', fontWeight: 600, color: '#ef4444' }}>{v.severity.toUpperCase()} — {v.title}</p>
                            {v.cve && <p style={{ fontSize: '11px', color: '#94a3b8', fontFamily: "'Fira Code', monospace" }}>{v.cve}</p>}
                            <p style={{ fontSize: '11px', color: '#64748b' }}>Affects: {v.affectedVersions}</p>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function riskColor(level: string) {
  const m: Record<string, string> = { critical: '#ef4444', high: '#f97316', medium: '#f59e0b', low: '#22c55e' };
  return m[level] || '#94a3b8';
}

function InfoRow({ label, value, highlight }: { label: string; value: any; highlight?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
      <span style={{ fontSize: '12px', color: '#64748b' }}>{label}</span>
      <span style={{ fontSize: '12px', color: highlight ? '#f97316' : '#94a3b8', fontFamily: "'Fira Code', monospace", maxWidth: '160px', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(value)}</span>
    </div>
  );
}
