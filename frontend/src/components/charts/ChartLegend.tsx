interface LegendItem {
  key: string;
  label: string;
  value: number;
  color: string;
}

export function ChartLegend({ items }: { items: LegendItem[] }) {
  const visible = items.filter((i) => i.value > 0);
  if (!visible.length) return null;

  return (
    <ul className="chart-legend">
      {visible.map((item) => (
        <li key={item.key} className="chart-legend__item">
          <span className="chart-legend__dot" style={{ background: item.color }} />
          <span className="chart-legend__label">{item.label}</span>
          <span className="chart-legend__value">{item.value}</span>
        </li>
      ))}
    </ul>
  );
}