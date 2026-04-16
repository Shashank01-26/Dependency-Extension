import React from 'react';
import { RiskLevel } from '../types';

const config = {
  critical: { bg: 'rgba(239,68,68,0.15)', border: 'rgba(239,68,68,0.4)', text: '#ef4444' },
  high:     { bg: 'rgba(249,115,22,0.15)', border: 'rgba(249,115,22,0.4)', text: '#f97316' },
  medium:   { bg: 'rgba(245,158,11,0.15)', border: 'rgba(245,158,11,0.4)', text: '#f59e0b' },
  low:      { bg: 'rgba(34,197,94,0.15)',  border: 'rgba(34,197,94,0.4)',  text: '#22c55e' },
};

interface Props {
  level: RiskLevel | string;
  score?: number;
  size?: 'sm' | 'md';
}

export default function RiskBadge({ level, score, size = 'md' }: Props) {
  const c = config[level as RiskLevel] || config.low;
  const padding = size === 'sm' ? '2px 7px' : '4px 10px';
  const fontSize = size === 'sm' ? '11px' : '12px';
  return (
    <span style={{
      background: c.bg, border: `1px solid ${c.border}`, color: c.text,
      padding, borderRadius: '20px', fontSize, fontWeight: 700,
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      textTransform: 'uppercase', letterSpacing: '0.04em',
    }}>
      {score !== undefined ? `${Math.round(score)}` : level}
    </span>
  );
}
