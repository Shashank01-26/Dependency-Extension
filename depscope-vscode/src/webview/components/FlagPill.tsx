import React from 'react';
import { RiskFlag } from '../types';

const severityColors = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#f59e0b',
  low: '#22c55e',
};

interface Props {
  flag: RiskFlag;
}

export default function FlagPill({ flag }: Props) {
  const color = severityColors[flag.severity as keyof typeof severityColors] || '#94a3b8';
  return (
    <span title={flag.message} style={{
      background: `${color}18`, border: `1px solid ${color}40`, color,
      padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600,
      whiteSpace: 'nowrap', cursor: 'default',
    }}>
      {flag.type}
    </span>
  );
}
