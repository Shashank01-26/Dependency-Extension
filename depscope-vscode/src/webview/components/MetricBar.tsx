import React from 'react';

interface Props {
  label: string;
  value: number;
  weight?: string;
}

function getColor(v: number): string {
  if (v >= 70) return '#ef4444';
  if (v >= 45) return '#f97316';
  if (v >= 25) return '#f59e0b';
  return '#22c55e';
}

export default function MetricBar({ label, value, weight }: Props) {
  const color = getColor(value);
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div style={{ marginBottom: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
        <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 500 }}>
          {label} {weight && <span style={{ color: '#64748b' }}>({weight})</span>}
        </span>
        <span style={{ fontSize: '12px', fontWeight: 700, color, fontFamily: "'Fira Code', monospace" }}>{Math.round(value)}</span>
      </div>
      <div style={{ height: '6px', background: '#1e2130', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '3px', transition: 'width 0.4s ease' }} />
      </div>
    </div>
  );
}
