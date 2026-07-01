'use client';

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export interface BarChartItem {
  key: string;
  label: string;
  value: number;
  color?: string;
}

interface HorizontalBarChartProps {
  data: BarChartItem[];
  height?: number;
  emptyLabel?: string;
}

export function HorizontalBarChart({ data, height = 180, emptyLabel = 'Нет данных' }: HorizontalBarChartProps) {
  const filtered = data.filter((d) => d.value > 0);
  if (!filtered.length) {
    return (
      <div className="chart-empty" style={{ height }}>
        {emptyLabel}
      </div>
    );
  }

  const chartHeight = Math.max(height, filtered.length * 36 + 24);

  return (
    <div style={{ height: chartHeight }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={filtered} layout="vertical" margin={{ top: 4, right: 8, left: 4, bottom: 4 }}>
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="label"
            width={100}
            tick={{ fill: 'var(--muted)', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: 'var(--surface-muted)' }}
            contentStyle={{
              background: 'var(--surface-elevated)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              fontSize: '12px',
              color: 'var(--text)',
            }}
            formatter={(value) => [value ?? 0, '']}
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={20}>
            {filtered.map((entry) => (
              <Cell key={entry.key} fill={entry.color || 'var(--accent)'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}