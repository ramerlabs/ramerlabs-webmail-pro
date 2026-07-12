"use client";

const CHART_COLORS = [
  "#0f6e56",
  "#3d9b7f",
  "#c4913a",
  "#5b7cfa",
  "#d97757",
  "#7c6bc4",
  "#2a9d8f",
  "#e76f51",
];

export interface ChartSlice {
  id: string;
  label: string;
  value: number;
}

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
}

function polarToCartesian(cx: number, cy: number, r: number, angle: number) {
  const rad = ((angle - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number,
) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? "0" : "1";
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}

export function ExpenseDonutChart({
  title,
  slices,
  currency,
  emptyLabel = "No data yet",
}: {
  title: string;
  slices: ChartSlice[];
  currency: string;
  emptyLabel?: string;
}) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const size = 160;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 58;
  const stroke = 18;

  let angle = 0;
  const arcs =
    total <= 0
      ? []
      : slices.map((slice, i) => {
          const sweep = (slice.value / total) * 360;
          const start = angle;
          const end = angle + Math.max(sweep, 0.01);
          angle = end;
          return {
            ...slice,
            color: CHART_COLORS[i % CHART_COLORS.length],
            d: describeArc(cx, cy, radius, start, end),
          };
        });

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <p className="mb-3 text-sm font-medium">{title}</p>
      {total <= 0 ? (
        <p className="py-10 text-center text-sm text-[var(--muted)]">
          {emptyLabel}
        </p>
      ) : (
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            className="shrink-0"
            role="img"
            aria-label={title}
          >
            <circle
              cx={cx}
              cy={cy}
              r={radius}
              fill="none"
              stroke="var(--surface-muted)"
              strokeWidth={stroke}
            />
            {arcs.map((arc) => (
              <path
                key={arc.id}
                d={arc.d}
                fill="none"
                stroke={arc.color}
                strokeWidth={stroke}
                strokeLinecap="butt"
              />
            ))}
            <text
              x={cx}
              y={cy - 4}
              textAnchor="middle"
              className="fill-[var(--foreground)]"
              style={{ fontSize: 12, fontWeight: 600 }}
            >
              {formatMoney(total, currency)}
            </text>
            <text
              x={cx}
              y={cy + 12}
              textAnchor="middle"
              className="fill-[var(--muted)]"
              style={{ fontSize: 10 }}
            >
              total
            </text>
          </svg>
          <ul className="min-w-0 flex-1 space-y-1.5">
            {arcs.map((arc) => (
              <li
                key={arc.id}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: arc.color }}
                  />
                  <span className="truncate text-[var(--muted-strong)]">
                    {arc.label}
                  </span>
                </span>
                <span className="shrink-0 tabular-nums text-[var(--foreground)]">
                  {formatMoney(arc.value, currency)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function ExpenseBarChart({
  title,
  slices,
  currency,
  emptyLabel = "No data yet",
}: {
  title: string;
  slices: ChartSlice[];
  currency: string;
  emptyLabel?: string;
}) {
  const max = Math.max(...slices.map((s) => s.value), 0);

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <p className="mb-3 text-sm font-medium">{title}</p>
      {max <= 0 ? (
        <p className="py-10 text-center text-sm text-[var(--muted)]">
          {emptyLabel}
        </p>
      ) : (
        <ul className="space-y-3">
          {slices.map((slice, i) => {
            const pct = max > 0 ? (slice.value / max) * 100 : 0;
            const color = CHART_COLORS[i % CHART_COLORS.length];
            return (
              <li key={slice.id}>
                <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                  <span className="truncate text-[var(--muted-strong)]">
                    {slice.label}
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {formatMoney(slice.value, currency)}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-muted)]">
                  <div
                    className="h-full rounded-full transition-[width] duration-500"
                    style={{ width: `${pct}%`, background: color }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function ExpenseMonthChart({
  title,
  points,
  currency,
  emptyLabel = "No data yet",
}: {
  title: string;
  points: { key: string; label: string; value: number }[];
  currency: string;
  emptyLabel?: string;
}) {
  const max = Math.max(...points.map((p) => p.value), 0);
  const height = 120;
  const width = Math.max(points.length * 36, 220);
  const pad = 8;
  const barW = Math.min(28, (width - pad * 2) / Math.max(points.length, 1) - 8);

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <p className="mb-3 text-sm font-medium">{title}</p>
      {max <= 0 ? (
        <p className="py-10 text-center text-sm text-[var(--muted)]">
          {emptyLabel}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <svg
            width={width}
            height={height + 28}
            viewBox={`0 0 ${width} ${height + 28}`}
            role="img"
            aria-label={title}
          >
            {points.map((point, i) => {
              const h = max > 0 ? (point.value / max) * (height - pad) : 0;
              const x =
                pad +
                i * ((width - pad * 2) / points.length) +
                ((width - pad * 2) / points.length - barW) / 2;
              const y = height - h;
              return (
                <g key={point.key}>
                  <rect
                    x={x}
                    y={y}
                    width={barW}
                    height={h}
                    rx={4}
                    fill={CHART_COLORS[i % CHART_COLORS.length]}
                  />
                  <text
                    x={x + barW / 2}
                    y={height + 16}
                    textAnchor="middle"
                    className="fill-[var(--muted)]"
                    style={{ fontSize: 10 }}
                  >
                    {point.label}
                  </text>
                </g>
              );
            })}
          </svg>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Peak month:{" "}
            {formatMoney(
              max,
              currency,
            )}
          </p>
        </div>
      )}
    </div>
  );
}
