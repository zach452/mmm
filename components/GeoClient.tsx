'use client';

import { useMemo, useState } from 'react';
import { Action, CapacityStatus, Recommendation, Region, ServiceLine, WeatherRegime } from '@/lib/types';
import { ActionBadge, ConfidenceBadge, fmtCurrency, Pill } from './ui';
import { DecompositionChart, ChannelResponseCurve } from './charts';
import { DecompositionResult } from '@/lib/types';

export interface GeoRow {
  rec: Recommendation;
  temperature: number;
  tempAnomaly: number;
  indoorIndex: number;
  triggerIndex: number;
  decomposition: DecompositionResult;
  decompSeries: (DecompositionResult & { date: string })[];
  channelCurves: { channel: string; halfSaturation: number; maxResponse: number; currentSpend: number; interactionMultiplier: number }[];
  population: number;
  locationCount: number;
  locationDensity: 'High' | 'Medium' | 'Low';
  capacityStatus: CapacityStatus;
  hierarchical: {
    n: number;
    raw: number;
    shrunk: number;
    weight: number;
    grandMean: number;
    ciLower: number;
    ciUpper: number;
  } | null;
  syntheticControl: {
    weights: { dma: string; weight: number }[];
    observed: number[];
    counterfactual: number[];
    dates: string[];
    treatmentStartIndex: number;
    cumulativeLift: number;
    preRmse: number;
  };
}

const REGIONS: (Region | 'All')[] = ['All', 'Northeast', 'Midwest', 'South', 'West', 'Pacific Northwest', 'Southwest'];
const ACTIONS: (Action | 'All')[] = ['All', 'Act', 'Test', 'Monitor', 'Ignore', 'Suppress'];
const SERVICE_LINES: (ServiceLine | 'All')[] = ['All', 'Standard Oil Change', 'Synthetic Oil Change', 'Tire Services', 'Wiper Blades', 'Battery/Electrical', 'Cooling System', 'Air Filtration'];

const CAPACITY_STYLES: Record<CapacityStatus, string> = {
  Healthy: 'bg-[var(--positive)]/15 text-[var(--positive)]',
  Constrained: 'bg-[var(--warning)]/15 text-[var(--warning)]',
  Maxed: 'bg-[var(--negative)]/15 text-[var(--negative)]',
};

function CapacityBadge({ status }: { status: CapacityStatus }) {
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${CAPACITY_STYLES[status]}`}>{status}</span>;
}

const REGION_COLORS: Record<Region, string> = {
  Northeast: '#5b8cff',
  Midwest: '#22d3ee',
  South: '#fbbf24',
  West: '#34d399',
  'Pacific Northwest': '#a78bfa',
  Southwest: '#f87171',
};

type SortKey = 'opportunity' | 'confidence' | 'revenue' | 'urgency';

export default function GeoClient({ rows }: { rows: GeoRow[] }) {
  const [region, setRegion] = useState<Region | 'All'>('All');
  const [regime, setRegime] = useState<WeatherRegime | 'All'>('All');
  const [action, setAction] = useState<Action | 'All'>('All');
  const [serviceLine, setServiceLine] = useState<ServiceLine | 'All'>('All');
  const [sortKey, setSortKey] = useState<SortKey>('opportunity');
  const [selected, setSelected] = useState<GeoRow | null>(null);

  const regimes = useMemo(() => {
    const set = new Set(rows.map((r) => r.rec.regime));
    return ['All', ...Array.from(set)] as (WeatherRegime | 'All')[];
  }, [rows]);

  const filtered = useMemo(() => {
    const f = rows.filter(
      (r) =>
        (region === 'All' || r.rec.region === region) &&
        (regime === 'All' || r.rec.regime === regime) &&
        (action === 'All' || r.rec.action === action) &&
        (serviceLine === 'All' || r.rec.service_line === serviceLine),
    );
    return f.sort((a, b) => {
      switch (sortKey) {
        case 'confidence':
          return b.rec.confidence - a.rec.confidence;
        case 'revenue':
          return b.rec.expectedRevenueLift - a.rec.expectedRevenueLift;
        case 'urgency':
          return b.rec.urgency - a.rec.urgency;
        default:
          return b.rec.opportunityScore - a.rec.opportunityScore;
      }
    });
  }, [rows, region, regime, action, serviceLine, sortKey]);

  return (
    <div className="space-y-6">
      {/* Heatmap grid */}
      <div className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Geo Opportunity Heatmap</h2>
            <p className="text-xs text-muted">Color = region · intensity = opportunity score</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {Object.entries(REGION_COLORS).map(([r, c]) => (
              <span key={r} className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: c }} /> {r}
              </span>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 md:grid-cols-10">
          {filtered.map((r) => {
            const intensity = 0.25 + (r.rec.opportunityScore / 100) * 0.75;
            return (
              <button
                key={r.rec.id}
                onClick={() => setSelected(r)}
                title={`${r.rec.dmaName} · opp ${r.rec.opportunityScore}`}
                className="flex aspect-square flex-col items-center justify-center rounded-md p-1 text-center transition-transform hover:scale-105"
                style={{ background: REGION_COLORS[r.rec.region], opacity: intensity }}
              >
                <span className="truncate text-[9px] font-medium text-black/90">{r.rec.dmaName}</span>
                <span className="tabular text-[11px] font-bold text-black">{r.rec.opportunityScore}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Select label="Region" value={region} onChange={setRegion} options={REGIONS} />
        <Select label="Regime" value={regime} onChange={setRegime} options={regimes} />
        <Select label="Action" value={action} onChange={setAction} options={ACTIONS} />
        <Select label="Service line" value={serviceLine} onChange={setServiceLine} options={SERVICE_LINES} />
        <Select label="Sort" value={sortKey} onChange={setSortKey} options={['opportunity', 'confidence', 'revenue', 'urgency'] as SortKey[]} />
        <span className="ml-auto text-xs text-muted">{filtered.length} markets</span>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-3">DMA</th>
                <th className="px-4 py-3">Regime</th>
                <th className="px-4 py-3">Service line</th>
                <th className="px-4 py-3 text-right">Locations</th>
                <th className="px-4 py-3">Density</th>
                <th className="px-4 py-3">Capacity</th>
                <th className="px-4 py-3 text-right">Opp</th>
                <th className="px-4 py-3 text-right">mROAS</th>
                <th className="px-4 py-3 text-right">Rev Lift</th>
                <th className="px-4 py-3">Confidence</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr
                  key={r.rec.id}
                  onClick={() => setSelected(r)}
                  className="cursor-pointer border-b transition-colors hover:bg-[var(--surface-2)]"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium">{r.rec.dmaName}</div>
                    <div className="text-xs text-muted">{r.rec.region}</div>
                  </td>
                  <td className="px-4 py-3"><Pill>{r.rec.regime}</Pill></td>
                  <td className="px-4 py-3 text-xs">{r.rec.service_line}</td>
                  <td className="px-4 py-3 text-right tabular">{r.locationCount}</td>
                  <td className="px-4 py-3 text-xs">{r.locationDensity}</td>
                  <td className="px-4 py-3"><CapacityBadge status={r.capacityStatus} /></td>
                  <td className="px-4 py-3 text-right tabular font-semibold">{r.rec.opportunityScore}</td>
                  <td className="px-4 py-3 text-right tabular">{r.rec.marginalRoas.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right tabular text-[var(--positive)]">{fmtCurrency(r.rec.expectedRevenueLift)}</td>
                  <td className="px-4 py-3"><ConfidenceBadge value={r.rec.confidence} /></td>
                  <td className="px-4 py-3"><ActionBadge action={r.rec.action} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selected && <DMAInsightDrawer row={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function Select<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: T[];
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs">
      <span className="text-muted">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="rounded-md border bg-[var(--surface-2)] px-2 py-1.5 text-xs capitalize text-foreground outline-none focus:border-[var(--accent)]"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

function DMAInsightDrawer({ row, onClose }: { row: GeoRow; onClose: () => void }) {
  const { rec } = row;
  const [showHierarchical, setShowHierarchical] = useState(true);
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/50" onClick={onClose}>
      <div
        className="h-full w-full max-w-2xl overflow-y-auto border-l p-6"
        style={{ background: 'var(--surface)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">{rec.dmaName}</h2>
            <p className="text-xs text-muted">
              {rec.region} · pop {row.population.toLocaleString()} · {row.locationCount} locations ({row.locationDensity} density) · capacity {row.capacityStatus}
            </p>
          </div>
          <button onClick={onClose} className="rounded-md border px-3 py-1 text-sm text-muted hover:text-foreground">
            Close
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <ActionBadge action={rec.action} />
          <Pill>{rec.regime}</Pill>
          <Pill>{rec.service_line}</Pill>
          <CapacityBadge status={row.capacityStatus} />
          <ConfidenceBadge value={rec.confidence} />
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Temp" value={`${row.temperature}°C`} sub={`${row.tempAnomaly >= 0 ? '+' : ''}${row.tempAnomaly}° anom`} />
          <Stat label="Indoor Idx" value={String(row.indoorIndex)} />
          <Stat label="Trigger Idx" value={String(row.triggerIndex)} />
          <Stat label="mROAS" value={rec.marginalRoas.toFixed(2)} />
        </div>

        <Section title="Weather Summary">
          <p className="text-xs leading-relaxed text-muted">
            {rec.dmaName} is in a <strong className="text-foreground">{rec.regime}</strong> regime with a temperature anomaly of{' '}
            {row.tempAnomaly}°C. Indoor/Friction Index {row.indoorIndex}/100 and {rec.service_line} Service Trigger Index{' '}
            {row.triggerIndex}/100. Service network: {row.locationCount} locations ({row.locationDensity} density), capacity{' '}
            <strong className="text-foreground">{row.capacityStatus}</strong>
            {row.capacityStatus === 'Maxed' ? ' — do not add spend here even if demand is high; bays are full.' : '.'}
          </p>
        </Section>

        <Section title="Demand Decomposition (recent window)">
          <DecompositionChart data={row.decompSeries} />
        </Section>

        <Section title="Channel Response Curves">
          <div className="grid gap-4 sm:grid-cols-2">
            {row.channelCurves.map((c) => (
              <div key={c.channel} className="card p-3">
                <ChannelResponseCurve {...c} />
              </div>
            ))}
          </div>
        </Section>

        <Section title="Hierarchical Estimate (V3 · empirical-Bayes partial pooling)">
          <button
            onClick={() => setShowHierarchical((v) => !v)}
            className="mb-2 rounded-md border px-3 py-1 text-xs text-muted hover:text-foreground"
          >
            {showHierarchical ? 'Hide' : 'Show'} hierarchical estimate
          </button>
          {showHierarchical &&
            (row.hierarchical ? (
              <div className="space-y-2 text-xs">
                <div className="grid grid-cols-3 gap-2">
                  <Stat label="Raw estimate" value={row.hierarchical.raw.toFixed(2)} sub={`n=${row.hierarchical.n} obs`} />
                  <Stat
                    label="Shrunk (pooled)"
                    value={row.hierarchical.shrunk.toFixed(2)}
                    sub={`CI ${row.hierarchical.ciLower.toFixed(2)}–${row.hierarchical.ciUpper.toFixed(2)}`}
                  />
                  <Stat
                    label="Trust weight"
                    value={`${Math.round(row.hierarchical.weight * 100)}%`}
                    sub={`pool mean ${row.hierarchical.grandMean.toFixed(2)}`}
                  />
                </div>
                <p className="leading-relaxed text-muted">
                  The raw per-DMA incrementality estimate is partially pooled toward the cross-DMA grand mean
                  ({row.hierarchical.grandMean.toFixed(2)}). This market keeps{' '}
                  <strong className="text-foreground">{Math.round(row.hierarchical.weight * 100)}%</strong> of its own
                  estimate; the rest is borrowed from the pool. Small-sample / noisy DMAs have a lower trust weight and
                  shrink <em>more</em> toward the mean — large, stable DMAs shrink less. The interval is a real
                  nonparametric bootstrap (90%) over daily samples. This is an empirical-Bayes approximation to a full
                  Bayesian hierarchical MMM (Stan/PyMC NUTS in a future V4+).
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted">No hierarchical estimate available for this DMA.</p>
            ))}
        </Section>

        <Section title="Synthetic Control Lift (V4 · causal counterfactual)">
          <SyntheticControlChart sc={row.syntheticControl} />
          <p className="mt-2 text-xs leading-relaxed text-muted">
            Donor weights (same-region DMAs):{' '}
            {row.syntheticControl.weights
              .filter((w) => w.weight > 0.001)
              .sort((a, b) => b.weight - a.weight)
              .slice(0, 4)
              .map((w) => `${w.dma} ${Math.round(w.weight * 100)}%`)
              .join(' · ') || 'none'}
            . Pre-period fit RMSE {Math.round(row.syntheticControl.preRmse).toLocaleString()}. Cumulative post-period
            lift {fmtCurrency(Math.round(row.syntheticControl.cumulativeLift))}. Hand-rolled synthetic control
            (projected-gradient simplex weights) on real mock sales — same estimand as Synth/gsynth.
          </p>
        </Section>

        <Section title="Recommended Media Plan">
          <ul className="space-y-1 text-xs text-muted">
            <li>· Primary channel: <strong className="text-foreground">{rec.topChannel}</strong> ({rec.funnelFocus})</li>
            <li>· Recommended budget shift: <strong className="text-foreground">{fmtCurrency(rec.recommendedBudgetShift)}</strong></li>
            <li>· Expected revenue lift: <strong className="text-[var(--positive)]">{fmtCurrency(rec.expectedRevenueLift)}</strong></li>
            <li>· Weather-driven share of lift: <strong className="text-foreground">{Math.round(rec.weatherShare * 100)}%</strong></li>
          </ul>
        </Section>

        <Section title="Creative Message Recommendation">
          <p className="text-xs leading-relaxed text-muted">{rec.rationale}</p>
        </Section>

        <Section title="Measurement Plan">
          <p className="text-xs leading-relaxed text-muted">
            Run a geo holdout against matched control DMAs over the weather window plus a 7-day tail. Read incremental
            revenue and new-customer rate; attribute lift net of the modeled weather baseline.
          </p>
        </Section>

        <Section title="Key Risks">
          {rec.riskFlags.length ? (
            <ul className="space-y-1 text-xs text-[var(--warning)]">
              {rec.riskFlags.map((r, i) => (
                <li key={i}>⚠ {r}</li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted">No material risks flagged.</p>
          )}
        </Section>
      </div>
    </div>
  );
}

function SyntheticControlChart({ sc }: { sc: GeoRow['syntheticControl'] }) {
  const { observed, counterfactual, treatmentStartIndex } = sc;
  const n = observed.length;
  if (n === 0) return <p className="text-xs text-muted">No series available.</p>;
  const all = [...observed, ...counterfactual];
  const min = Math.min(...all);
  const max = Math.max(...all);
  const range = max - min || 1;
  const W = 520;
  const H = 140;
  const x = (i: number) => (i / Math.max(1, n - 1)) * W;
  const y = (v: number) => H - ((v - min) / range) * H;
  const path = (series: number[]) =>
    series.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const splitX = x(treatmentStartIndex);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 160 }}>
      <rect x={splitX} y={0} width={W - splitX} height={H} fill="var(--accent)" opacity={0.06} />
      <line x1={splitX} y1={0} x2={splitX} y2={H} stroke="var(--accent)" strokeDasharray="3 3" strokeWidth={1} />
      <path d={path(counterfactual)} fill="none" stroke="#a78bfa" strokeWidth={1.5} strokeDasharray="4 3" />
      <path d={path(observed)} fill="none" stroke="#34d399" strokeWidth={1.75} />
      <text x={4} y={12} fontSize={9} fill="#34d399">observed</text>
      <text x={4} y={24} fontSize={9} fill="#a78bfa">synthetic counterfactual</text>
      <text x={splitX + 4} y={H - 4} fontSize={9} fill="var(--accent)">intervention →</text>
    </svg>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
      <div className="tabular text-lg font-semibold">{value}</div>
      {sub && <div className="text-[10px] text-muted">{sub}</div>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6">
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      {children}
    </div>
  );
}
