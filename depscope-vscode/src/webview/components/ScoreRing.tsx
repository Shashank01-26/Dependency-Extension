import React from 'react';

const RISK_COLORS = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#f59e0b',
  low: '#22c55e',
};

interface Props {
  score: number;
  riskLevel: string;
}

export default function ScoreRing({ score, riskLevel }: Props) {
  const color = RISK_COLORS[riskLevel as keyof typeof RISK_COLORS] || '#6366f1';
  const radius = 72;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;
  const offset = circumference - progress;

  return (
    <div style={{ position: 'relative', width: '180px', height: '180px', flexShrink: 0 }}>
      <svg width="180" height="180" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="90" cy="90" r={radius} fill="none" stroke="#1e2130" strokeWidth="12" />
        <circle
          cx="90" cy="90" r={radius} fill="none"
          stroke={color} strokeWidth="12"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.8s ease' }}
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: '42px', fontWeight: 800, color, lineHeight: 1 }}>{Math.round(score)}</span>
        <span style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>/100</span>
        <span style={{ fontSize: '13px', fontWeight: 700, color, marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{riskLevel}</span>
      </div>
    </div>
  );
}
