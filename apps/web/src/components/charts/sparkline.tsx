export function Sparkline({ values, color = 'var(--s-net)', width = 96, height = 26, baseline }: { values: number[]; color?: string; width?: number; height?: number; baseline?: boolean }) {
  if (values.length < 2) return <svg width={width} height={height} aria-hidden />;
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const span = max - min || 1;
  const step = width / (values.length - 1);
  const y = (v: number) => height - ((v - min) / span) * (height - 4) - 2;
  const d = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const last = values[values.length - 1]!;
  return (
    <svg width={width} height={height} aria-hidden className="overflow-visible">
      {baseline && <line x1={0} x2={width} y1={y(0)} y2={y(0)} stroke="var(--line-strong)" strokeWidth={1} />}
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={(values.length - 1) * step} cy={y(last)} r={2.5} fill={color} stroke="var(--panel)" strokeWidth={1.5} />
    </svg>
  );
}
