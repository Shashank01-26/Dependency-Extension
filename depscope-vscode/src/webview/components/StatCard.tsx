import React from 'react';

interface Props {
  label: string;
  value: number | string;
  color?: string;
}

export default function StatCard({ label, value, color = '#e2e8f0' }: Props) {
  return (
    <div style={{
      background: '#13151c', border: '1px solid #1e2130', borderRadius: '10px',
      padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '4px',
      transition: 'border-color 0.15s',
    }}>
      <span style={{ fontSize: '24px', fontWeight: 800, color, fontFamily: "'Fira Code', monospace" }}>{value}</span>
      <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 500 }}>{label}</span>
    </div>
  );
}
