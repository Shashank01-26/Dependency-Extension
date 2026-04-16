import React, { useState, useMemo } from 'react';
import { AnalyzedDependency } from '../types';
import RiskBadge from './RiskBadge';

const RISK_COLORS: Record<string, string> = {
  critical: '#ef4444', high: '#f97316', medium: '#f59e0b', low: '#22c55e',
};
const STUB_COLOR = '#475569';

interface Props {
  dependencies: AnalyzedDependency[];
}

interface TreeNode {
  id: string;             // unique path-based key
  name: string;
  version: string;
  riskLevel: string;
  score: number;
  cveCount: number;
  flagTypes: string[];
  depth: number;          // 0 = direct, 1 = transitive, 2 = deep
  hasChildren: boolean;
  analyzed: boolean;
  fullDep: AnalyzedDependency | null;
  childNames: string[];
}

const MAX_CHILDREN = [20, 12, 0] as const; // max per depth level (deep deps are leaves)

// ─── Build flat renderable list from the tree + expand state ─────────────────

function buildRows(
  directDeps: AnalyzedDependency[],
  analysisMap: Map<string, AnalyzedDependency>,
  expanded: Set<string>,
  hiddenRisks: Set<string>,
  search: string,
): TreeNode[] {
  const rows: TreeNode[] = [];
  const searchLower = search.toLowerCase();

  function pushNode(
    name: string,
    version: string,
    depth: number,
    dep: AnalyzedDependency | null,
    parentId: string | null,
  ) {
    const id = parentId ? `${name}::${parentId}` : name;
    const riskLevel = dep?.riskLevel || 'low';
    const childNames = dep?.directDeps?.slice(0, MAX_CHILDREN[depth] ?? 0) || [];

    rows.push({
      id,
      name,
      version,
      riskLevel,
      score: dep?.score.overall || 0,
      cveCount: dep?.vulnerabilities.length || 0,
      flagTypes: dep?.flags.map(f => f.type) || [],
      depth,
      hasChildren: childNames.length > 0,
      analyzed: !!dep,
      fullDep: dep,
      childNames,
    });

    if (expanded.has(id) && depth < 2) {
      childNames.forEach(childName => {
        const childDep = analysisMap.get(childName) || null;
        pushNode(childName, childDep?.version || '?', depth + 1, childDep, id);
      });

      // "N more not shown" stub
      const totalChildren = dep?.directDeps?.length || 0;
      const shown = childNames.length;
      if (totalChildren > shown) {
        rows.push({
          id: `__more__${id}`,
          name: `…${totalChildren - shown} more dependencies not shown`,
          version: '', riskLevel: 'low', score: 0, cveCount: 0,
          flagTypes: [], depth: depth + 1, hasChildren: false,
          analyzed: false, fullDep: null, childNames: [],
        });
      }
    }
  }

  directDeps.forEach(dep => {
    if (hiddenRisks.has(dep.riskLevel)) return;
    if (searchLower && !dep.name.toLowerCase().includes(searchLower)) return;
    pushNode(dep.name, dep.version, 0, dep, null);
  });

  return rows;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DependencyGraph({ dependencies }: Props) {
  const [expanded, setExpanded] = useState(new Set<string>());
  const [selected, setSelected] = useState<TreeNode | null>(null);
  const [search, setSearch] = useState('');
  const [hiddenRisks, setHiddenRisks] = useState(new Set<string>());

  const analysisMap = useMemo(() => {
    const m = new Map<string, AnalyzedDependency>();
    dependencies.forEach(d => m.set(d.name, d));
    return m;
  }, [dependencies]);

  const directDeps = useMemo(
    () => dependencies.filter(d => !d.parent),
    [dependencies],
  );

  const rows = useMemo(
    () => buildRows(directDeps, analysisMap, expanded, hiddenRisks, search),
    [directDeps, analysisMap, expanded, hiddenRisks, search],
  );

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const toggleRisk = (risk: string) =>
    setHiddenRisks(prev => {
      const s = new Set(prev);
      s.has(risk) ? s.delete(risk) : s.add(risk);
      return s;
    });

  const expandAll = () =>
    setExpanded(new Set(directDeps.filter(d => d.directDeps.length > 0).map(d => d.name)));

  const collapseAll = () => {
    setExpanded(new Set());
    setSelected(null);
  };

  const transitiveCount = dependencies.filter(d => !!d.parent).length;

  return (
    <div style={{ display: 'flex', gap: '12px', height: '560px' }}>
      {/* ── Tree panel ────────────────────────────────────────────────────── */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        background: '#0a0c10', border: '1px solid #1e2130',
        borderRadius: '10px', overflow: 'hidden', minWidth: 0,
      }}>
        {/* Toolbar */}
        <div style={{
          padding: '8px 12px', borderBottom: '1px solid #1e2130',
          display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap',
          flexShrink: 0,
        }}>
          {/* Search */}
          <div style={{ position: 'relative', marginRight: '4px' }}>
            <svg
              width="12" height="12" viewBox="0 0 24 24" fill="none"
              stroke="#475569" strokeWidth="2"
              style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)' }}
            >
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search…"
              style={{
                background: '#13151c', border: '1px solid #1e2130', borderRadius: '6px',
                color: '#e2e8f0', fontSize: '12px', padding: '4px 8px 4px 26px',
                outline: 'none', width: '140px',
                fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}
            />
          </div>

          {/* Risk toggles */}
          {(['critical', 'high', 'medium', 'low'] as const).map(risk => {
            const color = RISK_COLORS[risk];
            const hidden = hiddenRisks.has(risk);
            const count = directDeps.filter(d => d.riskLevel === risk).length;
            return (
              <button key={risk} onClick={() => toggleRisk(risk)} style={{
                padding: '3px 9px', borderRadius: '5px',
                border: `1px solid ${color}50`,
                background: hidden ? '#13151c' : `${color}18`,
                color: hidden ? '#475569' : color,
                fontSize: '11px', fontWeight: 700, cursor: 'pointer',
                textTransform: 'uppercase',
              }}>
                {risk} {count > 0 && `(${count})`}
              </button>
            );
          })}

          <div style={{ width: '1px', height: '18px', background: '#1e2130', margin: '0 2px' }} />

          {/* Expand / collapse */}
          {[
            { label: 'Expand all', action: expandAll },
            { label: 'Collapse', action: collapseAll },
          ].map(({ label, action }) => (
            <button key={label} onClick={action} style={{
              padding: '3px 9px', borderRadius: '5px', border: '1px solid #1e2130',
              background: '#13151c', color: '#64748b', fontSize: '11px', cursor: 'pointer',
            }}>{label}</button>
          ))}
        </div>

        {/* Column header */}
        <div style={{
          padding: '5px 12px', borderBottom: '1px solid #1e2130',
          display: 'flex', alignItems: 'center', flexShrink: 0,
          background: '#0d0f14',
        }}>
          <span style={{ flex: 1, fontSize: '10px', color: '#334155', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Package</span>
          <span style={{ width: '80px', fontSize: '10px', color: '#334155', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'right', marginRight: '12px' }}>Version</span>
          <span style={{ width: '72px', fontSize: '10px', color: '#334155', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'center' }}>Risk</span>
          <span style={{ width: '44px', fontSize: '10px', color: '#334155', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'right', marginLeft: '8px' }}>Score</span>
          <span style={{ width: '48px' }} />
        </div>

        {/* Tree rows */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {rows.length === 0 ? (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              height: '100%', color: '#475569', fontSize: '13px',
            }}>
              {dependencies.length === 0
                ? 'Run an analysis to see dependencies'
                : 'No packages match the current filters'}
            </div>
          ) : (
            rows.map((node, i) => (
              <TreeRow
                key={node.id}
                node={node}
                rowIndex={i}
                isSelected={selected?.id === node.id}
                isExpanded={expanded.has(node.id)}
                onToggle={toggleExpand}
                onSelect={n => setSelected(prev => prev?.id === n.id ? null : n)}
              />
            ))
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '6px 14px', borderTop: '1px solid #1e2130',
          display: 'flex', gap: '18px', flexShrink: 0,
        }}>
          {[
            { label: 'direct', value: directDeps.length },
            { label: 'transitive', value: transitiveCount },
            { label: 'critical', value: dependencies.filter(d => d.riskLevel === 'critical').length, color: '#ef4444' },
            { label: 'high', value: dependencies.filter(d => d.riskLevel === 'high').length, color: '#f97316' },
          ].map(({ label, value, color }) => (
            <span key={label} style={{ fontSize: '11px', color: color || '#475569' }}>
              {value} {label}
            </span>
          ))}
        </div>
      </div>

      {/* ── Detail sidebar ─────────────────────────────────────────────────── */}
      {selected?.fullDep && (
        <DetailSidebar dep={selected.fullDep} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

// ─── Tree row ─────────────────────────────────────────────────────────────────

function TreeRow({
  node, rowIndex, isSelected, isExpanded, onToggle, onSelect,
}: {
  node: TreeNode;
  rowIndex: number;
  isSelected: boolean;
  isExpanded: boolean;
  onToggle: (id: string, e: React.MouseEvent) => void;
  onSelect: (node: TreeNode) => void;
}) {
  const isMoreRow = node.id.startsWith('__more__');
  const riskColor = RISK_COLORS[node.riskLevel] || STUB_COLOR;
  const indentPx = 12 + node.depth * 22;

  return (
    <div
      onClick={() => { if (!isMoreRow) onSelect(node); }}
      style={{
        display: 'flex', alignItems: 'center', minHeight: '32px',
        paddingLeft: `${indentPx}px`, paddingRight: '12px',
        background: isSelected ? '#151929' : rowIndex % 2 === 0 ? '#0a0c10' : '#0c0e13',
        borderLeft: isSelected ? `2px solid ${riskColor}` : '2px solid transparent',
        cursor: isMoreRow ? 'default' : 'pointer',
        transition: 'background 0.1s',
        userSelect: 'none',
      }}
      onMouseEnter={e => {
        if (!isSelected) (e.currentTarget as HTMLElement).style.background = '#121520';
      }}
      onMouseLeave={e => {
        if (!isSelected) (e.currentTarget as HTMLElement).style.background =
          rowIndex % 2 === 0 ? '#0a0c10' : '#0c0e13';
      }}
    >
      {/* Tree guide lines for depth > 0 */}
      {node.depth > 0 && (
        <span style={{
          display: 'inline-block', width: '14px', height: '100%',
          borderLeft: '1px solid #1e2130', marginRight: '4px', flexShrink: 0,
        }} />
      )}

      {/* Expand toggle or leaf dot */}
      <span
        onClick={e => { if (node.hasChildren) onToggle(node.id, e); }}
        style={{
          width: '16px', height: '16px', display: 'flex', alignItems: 'center',
          justifyContent: 'center', marginRight: '6px', flexShrink: 0,
          cursor: node.hasChildren ? 'pointer' : 'default',
        }}
      >
        {isMoreRow ? null : node.hasChildren ? (
          <svg
            width="9" height="9" viewBox="0 0 9 9" fill={isExpanded ? '#64748b' : '#475569'}
            style={{ transition: 'transform 0.15s', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0)' }}
          >
            <path d="M3 1.5L6.5 4.5L3 7.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none"/>
          </svg>
        ) : (
          <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: `${riskColor}60`, display: 'block' }} />
        )}
      </span>

      {/* Package name */}
      <span style={{
        flex: 1, fontFamily: isMoreRow ? "'Plus Jakarta Sans', sans-serif" : "'Fira Code', monospace",
        fontSize: isMoreRow ? '11px' : '12px',
        color: isMoreRow ? '#334155' : node.analyzed ? '#e2e8f0' : '#64748b',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        fontStyle: isMoreRow ? 'italic' : 'normal',
      }}>
        {node.name}
      </span>

      {/* Version */}
      {!isMoreRow && (
        <span style={{
          width: '80px', fontFamily: "'Fira Code', monospace", fontSize: '11px',
          color: '#334155', textAlign: 'right', marginRight: '12px', flexShrink: 0,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {node.version !== '?' ? node.version : ''}
        </span>
      )}

      {/* Risk badge */}
      {!isMoreRow && (
        <span style={{
          width: '72px', textAlign: 'center', fontSize: '9px', fontWeight: 700,
          letterSpacing: '0.05em', textTransform: 'uppercase',
          color: riskColor, background: `${riskColor}15`,
          border: `1px solid ${riskColor}30`, borderRadius: '4px',
          padding: '2px 0', flexShrink: 0,
        }}>
          {node.riskLevel}
        </span>
      )}

      {/* Score */}
      {!isMoreRow && node.analyzed && (
        <span style={{
          width: '44px', fontFamily: "'Fira Code', monospace", fontSize: '11px',
          color: riskColor, textAlign: 'right', flexShrink: 0, marginLeft: '8px',
        }}>
          {Math.round(node.score)}
        </span>
      )}

      {/* CVE count */}
      <span style={{ width: '48px', display: 'flex', justifyContent: 'flex-end', flexShrink: 0, marginLeft: '4px' }}>
        {node.cveCount > 0 && (
          <span style={{
            fontSize: '9px', fontWeight: 700, color: '#ef4444',
            background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: '3px', padding: '1px 5px',
          }}>
            {node.cveCount} CVE
          </span>
        )}
        {node.flagTypes.includes('deprecated') && node.cveCount === 0 && (
          <span style={{
            fontSize: '9px', fontWeight: 600, color: '#f59e0b',
            background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)',
            borderRadius: '3px', padding: '1px 5px',
          }}>
            depr
          </span>
        )}
      </span>
    </div>
  );
}

// ─── Detail sidebar ───────────────────────────────────────────────────────────

function DetailSidebar({ dep, onClose }: { dep: AnalyzedDependency; onClose: () => void }) {
  const RISK_COLORS_MAP: Record<string, string> = {
    critical: '#ef4444', high: '#f97316', medium: '#f59e0b', low: '#22c55e',
  };

  return (
    <div style={{
      width: '240px', flexShrink: 0, background: '#13151c',
      border: '1px solid #1e2130', borderRadius: '10px',
      padding: '16px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '0',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
        <span style={{
          fontFamily: "'Fira Code', monospace", fontSize: '13px',
          color: '#e2e8f0', wordBreak: 'break-all', flex: 1,
        }}>{dep.name}</span>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', color: '#475569',
          cursor: 'pointer', fontSize: '18px', lineHeight: 1, marginLeft: '8px',
        }}>&times;</button>
      </div>

      <p style={{ fontSize: '11px', color: '#64748b', marginBottom: '12px', fontFamily: "'Fira Code', monospace" }}>
        v{dep.version}
        {dep.isDev && <span style={{ marginLeft: '6px', color: '#475569', background: '#1e2130', padding: '1px 5px', borderRadius: '3px' }}>dev</span>}
      </p>

      <RiskBadge level={dep.riskLevel} score={dep.score.overall} />

      {/* Score breakdown */}
      <div style={{ marginTop: '16px' }}>
        <p style={{ fontSize: '10px', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Score Breakdown</p>
        {([
          ['Maintenance', dep.score.maintenance],
          ['Security', dep.score.security],
          ['Popularity', dep.score.popularity],
          ['Community', dep.score.community],
          ['Depth Risk', dep.score.depthRisk],
        ] as [string, number][]).map(([label, val]) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
            <span style={{ fontSize: '12px', color: '#94a3b8' }}>{label}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '56px', height: '4px', background: '#1e2130', borderRadius: '2px', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${val}%`,
                  background: RISK_COLORS_MAP[val >= 70 ? 'critical' : val >= 45 ? 'high' : val >= 25 ? 'medium' : 'low'],
                  borderRadius: '2px',
                }} />
              </div>
              <span style={{ fontSize: '11px', color: '#e2e8f0', fontFamily: "'Fira Code', monospace", minWidth: '22px' }}>{Math.round(val)}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Flags */}
      {dep.flags.length > 0 && (
        <div style={{ marginTop: '12px' }}>
          <p style={{ fontSize: '10px', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>Flags</p>
          {dep.flags.map((f, i) => (
            <div key={i} style={{
              fontSize: '11px', color: '#94a3b8', background: '#0d0f14',
              border: '1px solid #1e2130', borderRadius: '4px',
              padding: '4px 8px', marginBottom: '4px', lineHeight: 1.4,
            }}>{f.message}</div>
          ))}
        </div>
      )}

      {/* Direct dependencies */}
      {dep.directDeps.length > 0 && (
        <div style={{ marginTop: '12px' }}>
          <p style={{ fontSize: '10px', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>
            Depends On ({dep.directDeps.length})
          </p>
          {dep.directDeps.slice(0, 10).map(d => (
            <p key={d} style={{ fontSize: '11px', color: '#64748b', fontFamily: "'Fira Code', monospace", marginBottom: '2px' }}>· {d}</p>
          ))}
          {dep.directDeps.length > 10 && (
            <p style={{ fontSize: '11px', color: '#334155' }}>+{dep.directDeps.length - 10} more</p>
          )}
        </div>
      )}

      {/* Vulnerabilities */}
      {dep.vulnerabilities.length > 0 && (
        <div style={{ marginTop: '12px' }}>
          <p style={{ fontSize: '10px', color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>
            Vulnerabilities ({dep.vulnerabilities.length})
          </p>
          {dep.vulnerabilities.slice(0, 4).map((v, i) => (
            <div key={i} style={{
              background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.18)',
              borderRadius: '6px', padding: '6px 8px', marginBottom: '4px',
            }}>
              <p style={{ fontSize: '11px', color: '#ef4444', fontWeight: 600, marginBottom: '2px' }}>
                {v.severity.toUpperCase()} {v.cve && <span style={{ fontFamily: "'Fira Code', monospace", fontWeight: 400 }}>· {v.cve}</span>}
              </p>
              <p style={{ fontSize: '11px', color: '#94a3b8' }}>{v.title}</p>
              {v.affectedVersions && (
                <p style={{ fontSize: '10px', color: '#475569', marginTop: '2px' }}>Affects: {v.affectedVersions}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
