'use client';

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { statusChartColor } from '@/lib/chart-colors';

export interface ChartSlice {
  key: string;
  label: string;
  value: number;
  colorKey?: string;
}

interface StatusDonutChartProps {
  data: ChartSlice[];
  height?: number;
  innerRadius?: number;
  emptyLabel?: string;
}

export function StatusDonutChart({
  data,
  height = 200,
  innerRadius = 52,
  emptyLabel = 'Нет данных',
}: StatusDonutChartProps) {
  const filtered = data.filter((d) => d.value > 0);
  const total = filtered.reduce((s, d) => s + d.value, 0);

  if (!total) {
    return (
      <div className="chart-empty" style={{ height }}>
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="chart-wrap" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={filtered}
            dataKey="value"
            nameKey="label"
            cx="50%"
            cy="50%"
            innerRadius={innerRadius}
            outerRadius={innerRadius + 28}
            paddingAngle={2}
            stroke="none"
          >
            {filtered.map((entry) => (
              <Cell
                key={entry.key}
                fill={statusChartColor((entry.colorKey || entry.key) as Parameters<typeof statusChartColor>[0])}
              />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: 'var(--surface-elevated)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              fontSize: '12px',
              color: 'var(--text)',
            }}
            formatter={(value, name) => [`${value ?? 0}`, name]}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="chart-donut-center">
        <span className="chart-donut-center__value">{total}</span>
        <span className="chart-donut-center__label">всего</span>
      </div>
    </div>
  );
}