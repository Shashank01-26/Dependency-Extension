import React, { useRef, useEffect, useState, useCallback } from 'react';
import { AnalyzedDependency } from '../types';
import RiskBadge from './RiskBadge';

const RISK_COLORS: Record<string, string> = {
  critical: '#ef4444', high: '#f97316', medium: '#f59e0b', low: '#22c55e',
};
const STUB_COLOR = '#475569';

interface Props {
  dependencies: AnalyzedDependency[];
}

interface GraphNode {
  id: string;           // unique: name + parent key
  name: string;
  version: string;
  level: number;        // 0=hub, 1=direct, 2=transitive, 3=deep
  riskLevel: string;
  score: number;
  analyzed: boolean;
  dep: AnalyzedDependency | null;
  parent: string | null; // parent node id
  x: number;
  y: number;
  r: number;
  angle: number;
}

interface GraphEdge {
  from: string;
  to: string;
}

function buildGraph(deps: AnalyzedDependency[], hiddenLevels: Set<string>): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const nodeMap = new Map<string, GraphNode>();

  const analysisMap = new Map<string, AnalyzedDependency>();
  deps.forEach(d => analysisMap.set(d.name, d));

  // Hub node
  const hub: GraphNode = {
    id: '__hub__', name: 'Project', version: '', level: 0,
    riskLevel: 'low', score: 0, analyzed: true, dep: null,
    parent: null, x: 0, y: 0, r: 38, angle: 0,
  };
  nodes.push(hub);
  nodeMap.set('__hub__', hub);

  // Level 1: direct (root-level) deps — those with no parent
  const directDeps = deps.filter(d => !d.parent);
  const visibleDirect = directDeps.filter(d => !hiddenLevels.has(d.riskLevel));
  const totalLevel1 = visibleDirect.length;
  const R1 = 160;

  visibleDirect.forEach((dep, i) => {
    const angle = (i / totalLevel1) * Math.PI * 2 - Math.PI / 2;
    const node: GraphNode = {
      id: dep.name,
      name: dep.name,
      version: dep.version,
      level: 1,
      riskLevel: dep.riskLevel,
      score: dep.score.overall,
      analyzed: true,
      dep,
      parent: '__hub__',
      x: Math.cos(angle) * R1,
      y: Math.sin(angle) * R1,
      r: dep.riskLevel === 'critical' ? 14 : dep.riskLevel === 'high' ? 12 : 10,
      angle,
    };
    nodes.push(node);
    nodeMap.set(dep.name, node);
    edges.push({ from: '__hub__', to: dep.name });
  });

  // Level 2: transitive deps from directDeps[] lists
  const R2 = 290;
  const seenLevel2 = new Map<string, string>(); // name → first parent id

  visibleDirect.forEach((dep) => {
    const parentNode = nodeMap.get(dep.name);
    if (!parentNode) return;
    const children = (dep.directDeps || []).slice(0, 10);
    const totalChildren = children.length;
    if (totalChildren === 0) return;

    const spreadAngle = Math.min((totalChildren / totalLevel1) * Math.PI * 2, Math.PI * 0.9);
    const startAngle = parentNode.angle - spreadAngle / 2;

    children.forEach((childName, ci) => {
      const nodeId = `${childName}::${dep.name}`;
      if (seenLevel2.has(childName)) {
        // Already placed — just add an edge to this additional parent
        edges.push({ from: dep.name, to: seenLevel2.get(childName)! });
        return;
      }
      seenLevel2.set(childName, nodeId);

      const angle = startAngle + (ci / Math.max(totalChildren - 1, 1)) * spreadAngle;
      const analyzedDep = analysisMap.get(childName);
      const isAnalyzed = !!analyzedDep;
      const riskLevel = analyzedDep?.riskLevel || 'low';

      const node: GraphNode = {
        id: nodeId,
        name: childName,
        version: analyzedDep?.version || '*',
        level: 2,
        riskLevel,
        score: analyzedDep?.score.overall || 0,
        analyzed: isAnalyzed,
        dep: analyzedDep || null,
        parent: dep.name,
        x: Math.cos(angle) * R2,
        y: Math.sin(angle) * R2,
        r: isAnalyzed ? 9 : 6,
        angle,
      };
      nodes.push(node);
      nodeMap.set(nodeId, node);
      edges.push({ from: dep.name, to: nodeId });

      // Level 3: deps-of-deps (only from analyzed transitive nodes, limited)
      if (isAnalyzed && analyzedDep!.directDeps.length > 0) {
        const R3 = 400;
        const l3Children = analyzedDep!.directDeps.slice(0, 5);
        const l3Spread = Math.min(l3Children.length * 0.12, 0.6);
        const l3Start = angle - l3Spread / 2;
        l3Children.forEach((l3Name, l3i) => {
          const l3Id = `${l3Name}::${nodeId}`;
          if (nodeMap.has(l3Id)) return;
          const l3Angle = l3Start + (l3i / Math.max(l3Children.length - 1, 1)) * l3Spread;
          const l3Node: GraphNode = {
            id: l3Id, name: l3Name, version: '*', level: 3,
            riskLevel: 'low', score: 0, analyzed: false, dep: null,
            parent: nodeId,
            x: Math.cos(l3Angle) * R3,
            y: Math.sin(l3Angle) * R3,
            r: 4, angle: l3Angle,
          };
          nodes.push(l3Node);
          nodeMap.set(l3Id, l3Node);
          edges.push({ from: nodeId, to: l3Id });
        });
      }
    });
  });

  return { nodes, edges };
}

export default function DependencyGraph({ dependencies }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [zoom, setZoom] = useState(0.85);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [hiddenLevels, setHiddenLevels] = useState<Set<string>>(new Set());
  const graphRef = useRef<{ nodes: GraphNode[]; edges: GraphEdge[] }>({ nodes: [], edges: [] });

  useEffect(() => {
    graphRef.current = buildGraph(dependencies, hiddenLevels);
  }, [dependencies, hiddenLevels]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const { nodes, edges } = graphRef.current;
    const cx = W / 2 + offset.x;
    const cy = H / 2 + offset.y;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(zoom, zoom);

    if (nodes.length === 0) {
      ctx.fillStyle = '#475569';
      ctx.font = "13px 'Plus Jakarta Sans', sans-serif";
      ctx.textAlign = 'center';
      ctx.fillText('Run an analysis to see the dependency graph', 0, 0);
      ctx.restore();
      return;
    }

    // Draw ring guides
    [160, 290, 400].forEach((r, i) => {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(30,33,48,${0.6 - i * 0.15})`;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 6]);
      ctx.stroke();
      ctx.setLineDash([]);
    });

    // Draw edges
    edges.forEach(edge => {
      const from = nodes.find(n => n.id === edge.from);
      const to = nodes.find(n => n.id === edge.to);
      if (!from || !to) return;
      const color = to.analyzed ? RISK_COLORS[to.riskLevel] || STUB_COLOR : STUB_COLOR;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      const alpha = to.level === 3 ? 15 : to.level === 2 ? 25 : 40;
      ctx.strokeStyle = `${color}${alpha.toString(16).padStart(2, '0')}`;
      ctx.lineWidth = to.level === 3 ? 0.5 : to.level === 2 ? 0.8 : 1.2;
      ctx.stroke();
    });

    // Draw nodes (back to front by level)
    [3, 2, 1, 0].forEach(level => {
      nodes.filter(n => n.level === level).forEach(node => {
        const color = node.id === '__hub__' ? '#6366f1'
          : node.analyzed ? (RISK_COLORS[node.riskLevel] || STUB_COLOR)
          : STUB_COLOR;
        const isSelected = selected?.id === node.id;

        if (node.id === '__hub__') {
          // Hub
          const grad = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, node.r);
          grad.addColorStop(0, '#2d3452');
          grad.addColorStop(1, '#1e2130');
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.r, 0, Math.PI * 2);
          ctx.fillStyle = grad;
          ctx.fill();
          ctx.strokeStyle = '#6366f1';
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.fillStyle = '#e2e8f0';
          ctx.font = `bold ${Math.max(10, 14 * zoom)}px 'Plus Jakarta Sans', sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(dependencies.filter(d => !d.parent).length), node.x, node.y - 5);
          ctx.font = `${Math.max(8, 10 * zoom)}px 'Plus Jakarta Sans', sans-serif`;
          ctx.fillStyle = '#64748b';
          ctx.fillText('deps', node.x, node.y + 9);
          return;
        }

        // Glow for selected
        if (isSelected) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.r + 7, 0, Math.PI * 2);
          ctx.fillStyle = `${color}35`;
          ctx.fill();
        }

        // Fill
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.r, 0, Math.PI * 2);
        ctx.fillStyle = node.analyzed ? `${color}30` : `${color}18`;
        ctx.fill();

        // Border
        ctx.strokeStyle = color;
        ctx.lineWidth = isSelected ? 2.5 : node.level === 1 ? 1.5 : 1;
        ctx.stroke();

        // Label — only for level 1 and zoom > 0.5, level 2 at zoom > 0.8
        const showLabel = (node.level === 1 && zoom > 0.4) || (node.level === 2 && zoom > 0.7);
        if (showLabel) {
          const maxLen = node.level === 1 ? 13 : 10;
          const label = node.name.length > maxLen ? node.name.slice(0, maxLen) + '\u2026' : node.name;
          ctx.font = `${node.level === 1 ? 11 : 9}px 'Plus Jakarta Sans', sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillStyle = node.analyzed ? '#e2e8f0' : '#64748b';
          ctx.fillText(label, node.x, node.y + node.r + 3);
        }
      });
    });

    ctx.restore();

    // Controls (drawn in screen space, not transformed)
    drawControls(ctx, hiddenLevels);
  }, [dependencies, selected, zoom, offset, hiddenLevels]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      draw();
    });
    ro.observe(canvas);
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    draw();
    return () => ro.disconnect();
  }, [draw]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left - canvas.width / 2 - offset.x) / zoom;
    const my = (e.clientY - rect.top - canvas.height / 2 - offset.y) / zoom;

    const { nodes } = graphRef.current;
    const hit = nodes.find(n => {
      const dx = mx - n.x, dy = my - n.y;
      return Math.sqrt(dx * dx + dy * dy) <= n.r + 6;
    });
    setSelected(prev => hit && hit.id !== '__hub__' ? (prev?.id === hit.id ? null : hit) : null);
  }, [offset, zoom]);

  const handleMouseDown = (e: React.MouseEvent) => {
    setDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (dragging) setOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };
  const handleMouseUp = () => setDragging(false);
  const handleWheel = (e: React.WheelEvent) => {
    setZoom(z => Math.min(Math.max(z * (e.deltaY < 0 ? 1.1 : 0.9), 0.2), 4));
  };

  const toggleLevel = (level: string) => {
    setHiddenLevels(prev => {
      const s = new Set(prev);
      if (s.has(level)) s.delete(level); else s.add(level);
      return s;
    });
  };

  // Legend counts
  const directCount = dependencies.filter(d => !d.parent).length;
  const transitiveCount = dependencies.filter(d => !!d.parent).length +
    (graphRef.current.nodes.filter(n => n.level === 2 && !n.analyzed).length);

  return (
    <div style={{ display: 'flex', gap: '12px', height: '560px' }}>
      <div style={{ flex: 1, position: 'relative', background: '#0a0c10', border: '1px solid #1e2130', borderRadius: '10px', overflow: 'hidden' }}>
        {/* Controls bar */}
        <div style={{ position: 'absolute', top: '10px', left: '10px', display: 'flex', gap: '6px', zIndex: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {(['critical', 'high', 'medium', 'low'] as const).map(level => {
            const color = RISK_COLORS[level];
            const hidden = hiddenLevels.has(level);
            const count = dependencies.filter(d => !d.parent && d.riskLevel === level).length;
            return (
              <button key={level} onClick={() => toggleLevel(level)} style={{
                padding: '3px 10px', borderRadius: '6px', border: `1px solid ${color}50`,
                background: hidden ? '#13151c' : `${color}20`, color: hidden ? '#475569' : color,
                cursor: 'pointer', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase',
              }}>
                {level} ({count})
              </button>
            );
          })}
          <div style={{ width: '1px', height: '20px', background: '#1e2130', margin: '0 4px' }} />
          {[
            { label: '+', action: () => setZoom(z => Math.min(z + 0.15, 4)) },
            { label: '\u2212', action: () => setZoom(z => Math.max(z - 0.15, 0.2)) },
            { label: '\u27f3', action: () => { setZoom(0.85); setOffset({ x: 0, y: 0 }); } },
          ].map(({ label, action }) => (
            <button key={label} onClick={action} style={{
              padding: '3px 9px', borderRadius: '6px', border: '1px solid #1e2130',
              background: '#13151c', color: '#e2e8f0', cursor: 'pointer', fontSize: '13px',
            }}>{label}</button>
          ))}
        </div>
        {/* Legend */}
        <div style={{ position: 'absolute', bottom: '10px', left: '10px', display: 'flex', gap: '14px', zIndex: 10 }}>
          {[
            { color: '#6366f1', label: `Hub (${directCount} direct)` },
            { color: '#e2e8f0', label: 'Direct dep' },
            { color: '#475569', label: `Transitive (~${transitiveCount})` },
          ].map(({ color, label }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: color }} />
              <span style={{ fontSize: '11px', color: '#64748b' }}>{label}</span>
            </div>
          ))}
        </div>
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: '100%', cursor: dragging ? 'grabbing' : 'grab', display: 'block' }}
          onClick={handleClick}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
        />
      </div>

      {/* Detail Sidebar */}
      {selected && (
        <div style={{ width: '240px', background: '#13151c', border: '1px solid #1e2130', borderRadius: '10px', padding: '16px', overflow: 'auto', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
            <span style={{ fontFamily: "'Fira Code', monospace", fontSize: '13px', color: '#e2e8f0', wordBreak: 'break-all', flex: 1 }}>{selected.name}</span>
            <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '18px', lineHeight: 1, marginLeft: '8px' }}>&times;</button>
          </div>
          <p style={{ fontSize: '11px', color: '#64748b', marginBottom: '10px', fontFamily: "'Fira Code', monospace" }}>
            {selected.version !== '*' ? `v${selected.version}` : 'version unknown'}
          </p>
          {selected.analyzed ? (
            <>
              <RiskBadge level={selected.riskLevel} score={selected.score} />
              <div style={{ marginTop: '14px' }}>
                <p style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Score Breakdown</p>
                {selected.dep && [
                  ['Maintenance', selected.dep.score.maintenance],
                  ['Security', selected.dep.score.security],
                  ['Popularity', selected.dep.score.popularity],
                  ['Community', selected.dep.score.community],
                  ['Depth', selected.dep.score.depthRisk],
                ].map(([k, v]) => (
                  <div key={k as string} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '12px', color: '#94a3b8' }}>{k}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{ width: '60px', height: '4px', background: '#1e2130', borderRadius: '2px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${v}%`, background: RISK_COLORS[(v as number) >= 70 ? 'critical' : (v as number) >= 45 ? 'high' : (v as number) >= 25 ? 'medium' : 'low'], borderRadius: '2px' }} />
                      </div>
                      <span style={{ fontSize: '11px', color: '#e2e8f0', fontFamily: "'Fira Code', monospace", minWidth: '24px' }}>{Math.round(v as number)}</span>
                    </div>
                  </div>
                ))}
              </div>
              {selected.dep && selected.dep.directDeps.length > 0 && (
                <div style={{ marginTop: '12px' }}>
                  <p style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>Depends On ({selected.dep.directDeps.length})</p>
                  {selected.dep.directDeps.slice(0, 8).map(d => (
                    <p key={d} style={{ fontSize: '11px', color: '#94a3b8', fontFamily: "'Fira Code', monospace", marginBottom: '2px' }}>&middot; {d}</p>
                  ))}
                  {selected.dep.directDeps.length > 8 && <p style={{ fontSize: '11px', color: '#64748b' }}>+{selected.dep.directDeps.length - 8} more</p>}
                </div>
              )}
              {selected.dep && selected.dep.vulnerabilities.length > 0 && (
                <div style={{ marginTop: '12px' }}>
                  <p style={{ fontSize: '11px', color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>Vulnerabilities ({selected.dep.vulnerabilities.length})</p>
                  {selected.dep.vulnerabilities.slice(0, 3).map((v, i) => (
                    <div key={i} style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '6px', padding: '6px 8px', marginBottom: '4px' }}>
                      <p style={{ fontSize: '11px', color: '#ef4444', fontWeight: 600 }}>{v.severity.toUpperCase()}</p>
                      <p style={{ fontSize: '11px', color: '#94a3b8' }}>{v.title}</p>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div style={{ marginTop: '8px' }}>
              <span style={{ fontSize: '12px', color: '#475569', background: '#1e2130', padding: '3px 8px', borderRadius: '4px' }}>transitive dep</span>
              <p style={{ fontSize: '12px', color: '#64748b', marginTop: '10px', lineHeight: 1.5 }}>
                This package is a transitive dependency. Run a deeper analysis to see its full risk score.
              </p>
              {selected.dep?.parent && (
                <p style={{ fontSize: '11px', color: '#475569', marginTop: '8px' }}>
                  Required by: <span style={{ color: '#94a3b8', fontFamily: "'Fira Code', monospace" }}>{selected.dep.parent}</span>
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function drawControls(_ctx: CanvasRenderingContext2D, _hidden: Set<string>) {
  // Controls are rendered as React elements above the canvas, not on canvas
}
