'use client';

/**
 * Client-side top-line recompute for the MMM page. When uploaded sales data is
 * present in the data spine, this recomputes revenue totals and a baseline/media
 * split ESTIMATE directly from the uploaded rows and renders an explicit "using
 * uploaded client data" banner. Otherwise it shows the mock-derived figures
 * passed in as fallback props.
 *
 * The baseline/media split here is a transparent heuristic (same spirit as the
 * mock decomposition): baseline is estimated from each category's low-demand
 * quantile, and the remainder above baseline is treated as incremental, which we
 * attribute proportionally to weather vs media using a fixed demo split. A real
 * V3 Bayesian MMM would estimate these jointly — flagged here, not hidden.
 */
import { useMemo } from 'react';
import { useDataSpine } from '@/lib/store/dataSpineContext';
import { fmtCurrency, SectionCard } from './ui';
import { SalesObservation } from '@/lib/types';

const WEATHER_SHARE_OF_INCREMENTAL = 0.45; // demo assumption; see header note

function computeFromSales(sales: SalesObservation[]) {
  const totalRevenue = sales.reduce((s, r) => s + r.revenue, 0);

  // Baseline estimate per (dma, category): the 25th-percentile daily revenue is
  // treated as the level that would occur regardless of weather/media.
  const groups = new Map<string, number[]>();
  for (const r of sales) {
    const key = `${r.dma}|${r.product_category}`;
    const arr = groups.get(key) ?? [];
    arr.push(r.revenue);
    groups.set(key, arr);
  }
  let baseline = 0;
  for (const arr of groups.values()) {
    arr.sort((a, b) => a - b);
    const q = arr[Math.floor(arr.length * 0.25)] ?? arr[0] ?? 0;
    baseline += q * arr.length; // baseline level applied across that group's rows
  }
  baseline = Math.min(baseline, totalRevenue);
  const incremental = Math.max(0, totalRevenue - baseline);
  const weatherDriven = Math.round(incremental * WEATHER_SHARE_OF_INCREMENTAL);
  const mediaCaused = incremental - weatherDriven;
  return { totalRevenue, baseline: Math.round(baseline), weatherDriven, mediaCaused };
}

export interface MmmFallback {
  totalRevenue: number;
  baseline: number;
  weatherDriven: number;
  mediaCaused: number;
}

export default function MmmDataSpineSummary({ fallback }: { fallback: MmmFallback }) {
  const spine = useDataSpine();

  const computed = useMemo(() => {
    if (spine.hasSales && spine.sales) return computeFromSales(spine.sales);
    return null;
  }, [spine.hasSales, spine.sales]);

  const usingUpload = !!computed;
  const data = computed ?? fallback;
  const incremental = Math.max(1, data.weatherDriven + data.mediaCaused);

  return (
    <SectionCard
      title="Top-Line Decomposition"
      subtitle={
        usingUpload
          ? `Using uploaded client data (${spine.sales!.length.toLocaleString()} rows · ${spine.fileName})`
          : 'Computed from synthetic demo data (upload a sales CSV on /data to drive this from real client data)'
      }
    >
      {usingUpload && (
        <div className="mb-3 inline-flex items-center gap-2 rounded-md border border-[var(--positive)]/40 bg-[var(--positive)]/10 px-3 py-1.5 text-xs text-[var(--positive)]">
          ● Live data spine
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total revenue" value={fmtCurrency(data.totalRevenue)} />
        <Stat label="Estimated baseline" value={fmtCurrency(data.baseline)} sub={`${Math.round((data.baseline / Math.max(1, data.totalRevenue)) * 100)}% of revenue`} />
        <Stat label="Weather-driven lift" value={fmtCurrency(data.weatherDriven)} sub={`${Math.round((data.weatherDriven / incremental) * 100)}% of incremental`} accent />
        <Stat label="Media-caused lift" value={fmtCurrency(data.mediaCaused)} sub={`${Math.round((data.mediaCaused / incremental) * 100)}% of incremental`} accent />
      </div>
    </SectionCard>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="card p-4">
      <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
      <div className={`tabular mt-1 text-lg font-semibold ${accent ? 'text-[var(--accent)]' : ''}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-muted">{sub}</div>}
    </div>
  );
}
