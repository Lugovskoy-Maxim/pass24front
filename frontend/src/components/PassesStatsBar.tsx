'use client';

import { useEffect, useState } from 'react';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, PassStats, PassType, TYPE_LABELS } from '@/lib/api';
import { CHART_STATUS_COLORS, CHART_TYPE_COLORS } from '@/lib/chart-colors';
import { getStatusLabel, getUiLabels } from '@/lib/ui-labels';
import { PassStatus } from '@/lib/api';
import { useConfig } from '@/hooks/useConfig';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAuth } from '@/lib/auth';
import { canViewAllPasses, canViewPassCharts } from '@/lib/permissions';

export function PassesStatsBar() {
  const { user } = useAuth();
  const config = useConfig();
  const labels = getUiLabels(config);
  const showCharts = canViewPassCharts(user);
  const [stats, setStats] = useState<PassStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!showCharts) return;
    api.getStats()
      .then(setStats)
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, [showCharts]);

  if (!showCharts) return null;

  if (loading) {
    return (
      <div className="card p-4 mb-6 grid sm:grid-cols-3 gap-4">
        <Skeleton className="h-16" />
        <Skeleton className="h-16 sm:col-span-2" />
      </div>
    );
  }

  if (!stats) return null;

  const statusItems = (['pending', 'active', 'approved'] as PassStatus[])
    .map((key) => ({
      key,
      label: getStatusLabel(key, labels),
      value: stats.byStatus[key] || 0,
      fill: CHART_STATUS_COLORS[key],
    }))
    .filter((d) => d.value > 0);

  const typeItems = (Object.keys(TYPE_LABELS) as PassType[])
    .map((key) => ({
      key,
      label: TYPE_LABELS[key],
      value: stats.todayByType[key] || 0,
      fill: CHART_TYPE_COLORS[key] || CHART_STATUS_COLORS.total,
    }))
    .filter((d) => d.value > 0);

  return (
    <div className="card p-4 mb-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
        <h2 className="text-sm font-semibold">
          {canViewAllPasses(user) ? 'Сводка по пропускам' : 'Мои пропуска'}
        </h2>
        <p className="text-xs text-[var(--muted)]">
          Сегодня: {stats.todayCount} · за период: {stats.weekCount}
        </p>
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        <StatMiniChart
          title="По статусам"
          data={statusItems}
          emptyText="Нет активных заявок"
        />
        <StatMiniChart
          title={`Сегодня по типам (${stats.today})`}
          data={typeItems}
          emptyText="Сегодня пропусков нет"
        />
      </div>
    </div>
  );
}

function StatMiniChart({
  title,
  data,
  emptyText,
}: {
  title: string;
  data: { key: string; label: string; value: number; fill: string }[];
  emptyText: string;
}) {
  if (!data.length) {
    return (
      <div>
        <p className="text-xs text-[var(--muted)] mb-2">{title}</p>
        <p className="text-sm text-[var(--muted)] py-6 text-center">{emptyText}</p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-xs text-[var(--muted)] mb-2">{title}</p>
      <div className="h-[120px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <XAxis dataKey="label" tick={{ fill: 'var(--muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis hide allowDecimals={false} />
            <Tooltip
              cursor={{ fill: 'var(--surface-muted)' }}
              contentStyle={{
                background: 'var(--surface-elevated)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                fontSize: '12px',
              }}
              formatter={(v) => [v ?? 0, '']}
            />
            <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={32}>
              {data.map((entry) => (
                <Cell key={entry.key} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}