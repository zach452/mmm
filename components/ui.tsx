import { Action } from '@/lib/types';

export function MetricCard({
  label,
  value,
  sub,
  trend,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  trend?: 'up' | 'down' | 'flat';
  accent?: boolean;
}) {
  return (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div
        className={`mt-1.5 text-2xl font-semibold tabular ${
          accent ? 'text-[var(--accent)]' : ''
        }`}
      >
        {value}
      </div>
      {sub && (
        <div
          className={`mt-1 text-xs ${
            trend === 'up'
              ? 'text-[var(--positive)]'
              : trend === 'down'
                ? 'text-[var(--negative)]'
                : 'text-muted'
          }`}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

const ACTION_STYLES: Record<Action, string> = {
  Act: 'bg-[var(--positive)]/15 text-[var(--positive)] border-[var(--positive)]/30',
  Test: 'bg-[var(--accent)]/15 text-[var(--accent)] border-[var(--accent)]/30',
  Monitor: 'bg-[var(--warning)]/15 text-[var(--warning)] border-[var(--warning)]/30',
  Ignore: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
  Suppress: 'bg-[var(--negative)]/15 text-[var(--negative)] border-[var(--negative)]/30',
};

export function ActionBadge({ action }: { action: Action }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${ACTION_STYLES[action]}`}
    >
      {action}
    </span>
  );
}

export function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const tone =
    pct >= 70
      ? 'text-[var(--positive)]'
      : pct >= 55
        ? 'text-[var(--warning)]'
        : 'text-[var(--negative)]';
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span className="h-1.5 w-12 overflow-hidden rounded-full bg-[var(--surface-2)]">
        <span
          className="block h-full rounded-full bg-current"
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className={`tabular ${tone}`}>{pct}%</span>
    </span>
  );
}

export function RiskBadge({ level }: { level: 'Low' | 'Medium' | 'High' }) {
  const tone =
    level === 'Low'
      ? 'bg-[var(--positive)]/15 text-[var(--positive)] border-[var(--positive)]/30'
      : level === 'Medium'
        ? 'bg-[var(--warning)]/15 text-[var(--warning)] border-[var(--warning)]/30'
        : 'bg-[var(--negative)]/15 text-[var(--negative)] border-[var(--negative)]/30';
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${tone}`}>
      {level} risk
    </span>
  );
}

export function SectionCard({
  title,
  subtitle,
  children,
  right,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <section className="card p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex rounded-md border bg-[var(--surface-2)] px-2 py-0.5 text-xs text-muted">
      {children}
    </span>
  );
}

export function fmtCurrency(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

export function fmtNumber(n: number): string {
  return n.toLocaleString('en-US');
}
