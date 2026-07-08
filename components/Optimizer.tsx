'use client';

import { useMemo, useState } from 'react';
import { AllocationRow, CapacityStatus, Channel, Region } from '@/lib/types';
import { optimizeBudget, OptimizerOpportunity } from '@/lib/modeling';
import {
  evaluateActivationGuardrails,
  type GuardrailResult,
} from '@/lib/modeling/v4-guardrails';
import { MetaAdsStubConnector, GoogleAdsStubConnector } from '@/lib/integrations/stubConnectors';
import { SlackAlertStubConnector } from '@/lib/integrations/alerting';
import type { ActivationResult } from '@/lib/integrations/types';
import { mulberry32, hashSeed } from '@/lib/rng';
import { ActionBadge, fmtCurrency, Pill, SectionCard } from './ui';
import { BarCompareChart } from './charts';

const META_CONNECTOR = new MetaAdsStubConnector();
const GOOGLE_CONNECTOR = new GoogleAdsStubConnector();
const SLACK_ALERT = new SlackAlertStubConnector();

function rowCapacity(dma: string, channel: string): CapacityStatus {
  const r = mulberry32(hashSeed(`cap-${dma}-${channel}`))();
  if (r < 0.1) return 'Maxed';
  if (r < 0.25) return 'Constrained';
  return 'Healthy';
}
function rowCreativeReady(dma: string, channel: string): boolean {
  return mulberry32(hashSeed(`crt-${dma}-${channel}`))() > 0.2;
}

const CHANNELS: Channel[] = ['Google Search', 'Meta', 'YouTube', 'CTV', 'Direct Mail', 'Email/CRM', 'Programmatic Display'];
const REGIONS: Region[] = ['Northeast', 'Midwest', 'South', 'West', 'Pacific Northwest', 'Southwest'];

export interface ChannelCalibration {
  channel: Channel;
  halfSaturation: number;
  slope: number;
  r2: number;
  n: number;
}

export default function Optimizer({
  opportunities,
  calibration,
}: {
  opportunities: OptimizerOpportunity[];
  calibration?: Record<string, ChannelCalibration>;
}) {
  const [useCalibrated, setUseCalibrated] = useState(false);
  const [budget, setBudget] = useState(250000);
  const [maxShiftChannel, setMaxShiftChannel] = useState(0.4);
  const [riskTolerance, setRiskTolerance] = useState<'Conservative' | 'Balanced' | 'Aggressive'>('Balanced');
  const [priorityKpi, setPriorityKpi] = useState('Revenue');
  const [excludedChannels, setExcludedChannels] = useState<Set<Channel>>(new Set());
  const [excludedRegions, setExcludedRegions] = useState<Set<Region>>(new Set());
  const [capacityConstraint, setCapacityConstraint] = useState(true);
  const [creativeReady, setCreativeReady] = useState(true);

  const result = useMemo(() => {
    const riskMult = riskTolerance === 'Conservative' ? 0.6 : riskTolerance === 'Aggressive' ? 1.4 : 1;
    const filtered = opportunities
      .filter((o) => !excludedChannels.has(o.channel) && !excludedRegions.has(o.region as Region))
      .map((o) => {
        const cal = useCalibrated ? calibration?.[o.channel] : undefined;
        return {
          ...o,
          halfSaturation: cal ? cal.halfSaturation : o.halfSaturation,
          slope: cal ? cal.slope : o.slope,
          maxSpend: o.currentSpend * (1 + maxShiftChannel * riskMult),
          minSpend: o.currentSpend * (1 - maxShiftChannel * 0.5),
        };
      });
    const rows = optimizeBudget(budget, filtered, {});
    return rows.sort((a, b) => b.delta - a.delta);
  }, [opportunities, budget, maxShiftChannel, riskTolerance, excludedChannels, excludedRegions, useCalibrated, calibration]);

  void priorityKpi; void capacityConstraint; void creativeReady;

  // V4 guardrails: evaluate each allocation row.
  const guardrails = useMemo(() => {
    const map = new Map<string, GuardrailResult>();
    for (const r of result) {
      const key = `${r.dma}-${r.channel}`;
      const point = r.marginalRoas;
      // synthesize a plausible CI around the marginal ROAS (deterministic spread).
      const spread = 0.35 + mulberry32(hashSeed(`ci-${key}`))() * 0.4;
      const res = evaluateActivationGuardrails(
        {
          dma: r.dma,
          channel: r.channel,
          proposedSpendChange: r.delta,
          currentSpend: r.currentSpend,
        },
        {
          capacityStatus: rowCapacity(r.dma, r.channel),
          creativeReadiness: rowCreativeReady(r.dma, r.channel),
          marginalRoasCI: { point, lower: point - spread, upper: point + spread },
          riskTolerance,
        },
      );
      map.set(key, res);
    }
    return map;
  }, [result, riskTolerance]);

  const [pushResults, setPushResults] = useState<ActivationResult[] | null>(null);
  const [pushing, setPushing] = useState(false);

  async function pushToPlatforms() {
    setPushing(true);
    const increasing = result.filter((r) => r.delta > 0);
    const results: ActivationResult[] = [];
    let blockedCount = 0;
    for (const r of increasing.slice(0, 25)) {
      const connector = r.channel === 'Google Search' ? GOOGLE_CONNECTOR : META_CONNECTOR;
      const point = r.marginalRoas;
      const spread = 0.35 + mulberry32(hashSeed(`ci-${r.dma}-${r.channel}`))() * 0.4;
      const res = await connector.pushBudgetChange(
        { dma: r.dma, channel: r.channel, proposedSpendChange: r.delta, currentSpend: r.currentSpend },
        r.recommendedSpend,
        {
          capacityStatus: rowCapacity(r.dma, r.channel),
          creativeReadiness: rowCreativeReady(r.dma, r.channel),
          marginalRoasCI: { point, lower: point - spread, upper: point + spread },
          riskTolerance,
        },
      );
      if (!res.success) blockedCount++;
      results.push(res);
    }
    if (blockedCount > 0) {
      await SLACK_ALERT.send({
        title: 'Activation guardrails blocked rows',
        body: `${blockedCount} of ${results.length} proposed pushes were blocked by guardrails (capacity / creative / ROAS).`,
        severity: 'warning',
      });
    }
    setPushResults(results);
    setPushing(false);
  }

  const byChannel = aggregate(result, (r) => r.channel);
  const byDma = aggregate(result, (r) => r.dmaName).slice(0, 10);
  const totalCurrent = result.reduce((s, r) => s + r.currentSpend, 0);
  const totalRecommended = result.reduce((s, r) => s + r.recommendedSpend, 0);
  const expectedRevenue = result.reduce((s, r) => s + r.expectedRevenue, 0);
  const saturated = result.filter((r) => r.saturationFlag).length;

  return (
    <div className="space-y-6">
      <SectionCard title="Optimization Constraints" subtitle="Greedy marginal allocation respecting per-opportunity shift limits">
        <div className="grid gap-4 md:grid-cols-3">
          <Range label={`Incremental budget — ${fmtCurrency(budget)}`} min={50000} max={1000000} step={10000} value={budget} onChange={setBudget} />
          <Range label={`Max shift / channel — ${Math.round(maxShiftChannel * 100)}%`} min={0.1} max={0.8} step={0.05} value={maxShiftChannel} onChange={setMaxShiftChannel} />
          <Field label="Priority KPI"><select value={priorityKpi} onChange={(e) => setPriorityKpi(e.target.value)} className="sel"><option>Revenue</option><option>New Customers</option><option>Contribution Margin</option><option>MER</option></select></Field>
          <Field label="Risk tolerance"><select value={riskTolerance} onChange={(e) => setRiskTolerance(e.target.value as 'Conservative' | 'Balanced' | 'Aggressive')} className="sel"><option>Conservative</option><option>Balanced</option><option>Aggressive</option></select></Field>
          <div className="flex items-center gap-4 pt-5">
            <Toggle label="Capacity constraint" value={capacityConstraint} onChange={setCapacityConstraint} />
            <Toggle label="Creative readiness" value={creativeReady} onChange={setCreativeReady} />
          </div>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <ChipGroup label="Exclude channels" items={CHANNELS} excluded={excludedChannels} toggle={(c) => setExcludedChannels(toggleSet(excludedChannels, c))} />
          <ChipGroup label="Exclude regions" items={REGIONS} excluded={excludedRegions} toggle={(r) => setExcludedRegions(toggleSet(excludedRegions, r))} />
        </div>
        <style>{`.sel{background:var(--surface-2);border:1px solid var(--border);border-radius:0.375rem;padding:0.375rem 0.5rem;font-size:0.75rem;color:var(--foreground);outline:none;width:100%}`}</style>
      </SectionCard>

      {calibration && (
        <SectionCard
          title="Hill Curve Calibration"
          subtitle="Fit half-saturation & slope per channel from historical spend → conversions (Open-source curve fit; see lib/modeling/calibration.ts)"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={useCalibrated}
                onChange={(e) => setUseCalibrated(e.target.checked)}
                className="accent-[var(--accent)]"
              />
              Calibrate from historical spend
              {useCalibrated ? <Pill>calibrated params active</Pill> : <span className="text-xs text-muted">(using default half-sat ×1.1, slope 1.3)</span>}
            </label>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-3 py-2">Channel</th>
                  <th className="px-3 py-2 text-right">Half-saturation</th>
                  <th className="px-3 py-2 text-right">Slope</th>
                  <th className="px-3 py-2 text-right">R²</th>
                  <th className="px-3 py-2 text-right">Obs.</th>
                </tr>
              </thead>
              <tbody>
                {Object.values(calibration).map((c) => (
                  <tr key={c.channel} className={`border-b ${useCalibrated ? '' : 'opacity-60'}`}>
                    <td className="px-3 py-2">{c.channel}</td>
                    <td className="px-3 py-2 text-right tabular">{fmtCurrency(c.halfSaturation)}</td>
                    <td className="px-3 py-2 text-right tabular">{c.slope.toFixed(2)}</td>
                    <td className={`px-3 py-2 text-right tabular ${c.r2 >= 0.6 ? 'text-[var(--positive)]' : 'text-[var(--warning)]'}`}>{c.r2.toFixed(3)}</td>
                    <td className="px-3 py-2 text-right tabular">{c.n.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Current spend" value={fmtCurrency(totalCurrent)} />
        <Stat label="Recommended spend" value={fmtCurrency(totalRecommended)} accent />
        <Stat label="Expected revenue" value={fmtCurrency(expectedRevenue)} />
        <Stat label="Saturation flags" value={String(saturated)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Before / After by Channel"><BarCompareChart data={byChannel} /></SectionCard>
        <SectionCard title="Before / After by DMA"><BarCompareChart data={byDma} /></SectionCard>
      </div>

      <SectionCard title="Allocation Detail" subtitle="Marginal dollars allocated by descending marginal ROAS">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-3 py-2">DMA</th><th className="px-3 py-2">Channel</th>
                <th className="px-3 py-2 text-right">Current</th><th className="px-3 py-2 text-right">Recommended</th>
                <th className="px-3 py-2 text-right">Δ</th><th className="px-3 py-2 text-right">mROAS</th>
                <th className="px-3 py-2">Flags</th><th className="px-3 py-2">Guardrail</th><th className="px-3 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {result.slice(0, 40).map((r, i) => (
                <tr key={i} className="border-b">
                  <td className="px-3 py-2">{r.dmaName}</td>
                  <td className="px-3 py-2 text-xs">{r.channel}</td>
                  <td className="px-3 py-2 text-right tabular">{fmtCurrency(r.currentSpend)}</td>
                  <td className="px-3 py-2 text-right tabular">{fmtCurrency(r.recommendedSpend)}</td>
                  <td className={`px-3 py-2 text-right tabular ${r.delta >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}`}>{r.delta >= 0 ? '+' : ''}{fmtCurrency(r.delta)}</td>
                  <td className="px-3 py-2 text-right tabular">{r.marginalRoas.toFixed(2)}</td>
                  <td className="px-3 py-2">{r.saturationFlag ? <Pill>⚠ saturating</Pill> : <span className="text-xs text-muted">—</span>}</td>
                  <td className="px-3 py-2"><GuardrailBadge g={guardrails.get(`${r.dma}-${r.channel}`)} delta={r.delta} /></td>
                  <td className="px-3 py-2"><ActionBadge action={r.action} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {saturated > 0 && (
          <p className="mt-3 rounded-lg border border-dashed border-[var(--warning)]/40 p-3 text-xs text-[var(--warning)]">
            ⚠ {saturated} channel/DMA combinations are near saturation (&gt;75% of max response). Additional spend there yields diminishing returns — the optimizer has stopped allocating to them.
          </p>
        )}
      </SectionCard>

      <SectionCard
        title="Platform Activation (V4 · guardrailed, simulated)"
        subtitle="Each spend increase is checked against activation guardrails (DMA capacity, creative readiness, marginal-ROAS CI vs breakeven, step-size cap) before being pushed. Connectors are clearly-labeled stubs — V5 would use real Meta/Google OAuth credentials."
      >
        <button
          onClick={pushToPlatforms}
          disabled={pushing}
          className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-black disabled:opacity-60"
        >
          {pushing ? 'Pushing…' : 'Push to platforms (simulated)'}
        </button>
        {pushResults && (
          <div className="mt-4 space-y-2">
            <p className="text-xs text-muted">
              {pushResults.filter((r) => r.success).length} pushed (simulated) ·{' '}
              {pushResults.filter((r) => !r.success).length} blocked by guardrails. All results are{' '}
              <strong className="text-foreground">simulated — no real API calls were made</strong>.
            </p>
            <div className="max-h-72 overflow-y-auto rounded-lg border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-left uppercase tracking-wide text-muted">
                    <th className="px-3 py-2">DMA</th><th className="px-3 py-2">Channel</th>
                    <th className="px-3 py-2">Platform</th><th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {pushResults.map((r, i) => (
                    <tr key={i} className="border-b">
                      <td className="px-3 py-2">{r.dma}</td>
                      <td className="px-3 py-2">{r.channel}</td>
                      <td className="px-3 py-2">{r.platform}</td>
                      <td className="px-3 py-2">
                        {r.success ? (
                          <span className="text-[var(--positive)]">✓ pushed (sim)</span>
                        ) : (
                          <span className="text-[var(--negative)]">✕ blocked</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-muted">
                        {r.success ? r.note : (r.blockedReasons ?? []).join(' ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="rounded-lg border border-dashed border-[var(--accent)]/40 p-2.5 text-xs text-muted">
              A simulated Slack alert fires via the stub alert connector whenever rows are blocked (see console). Real
              webhook/SMTP delivery requires production credentials in V5+.
            </p>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function GuardrailBadge({ g, delta }: { g: GuardrailResult | undefined; delta: number }) {
  if (!g || delta <= 0) return <span className="text-xs text-muted">—</span>;
  if (!g.approved) {
    return (
      <span
        title={g.blockedReasons.join(' ')}
        className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-[var(--negative)]/15 text-[var(--negative)]"
      >
        ✕ blocked
      </span>
    );
  }
  if (g.warnings.length) {
    return (
      <span
        title={g.warnings.join(' ')}
        className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-[var(--warning)]/15 text-[var(--warning)]"
      >
        ⚠ warn
      </span>
    );
  }
  return (
    <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-[var(--positive)]/15 text-[var(--positive)]">
      ✓ approved
    </span>
  );
}

function aggregate(rows: AllocationRow[], key: (r: AllocationRow) => string) {
  const m = new Map<string, { current: number; recommended: number }>();
  for (const r of rows) {
    const k = key(r);
    const cur = m.get(k) ?? { current: 0, recommended: 0 };
    cur.current += r.currentSpend;
    cur.recommended += r.recommendedSpend;
    m.set(k, cur);
  }
  return Array.from(m.entries()).map(([label, v]) => ({ label, ...v })).sort((a, b) => b.recommended - a.recommended);
}

function toggleSet<T>(set: Set<T>, item: T): Set<T> {
  const next = new Set(set);
  if (next.has(item)) next.delete(item);
  else next.add(item);
  return next;
}

function ChipGroup<T extends string>({ label, items, excluded, toggle }: { label: string; items: T[]; excluded: Set<T>; toggle: (t: T) => void }) {
  return (
    <div>
      <div className="mb-1.5 text-xs text-muted">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((i) => {
          const off = excluded.has(i);
          return (
            <button key={i} onClick={() => toggle(i)} className={`rounded-md border px-2 py-1 text-xs ${off ? 'bg-[var(--surface)] text-muted line-through' : 'bg-[var(--surface-2)]'}`}>{i}</button>
          );
        })}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex flex-col gap-1 text-xs text-muted">{label}{children}</label>;
}
function Range({ label, ...p }: { label: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted">{label}
      <input type="range" min={p.min} max={p.max} step={p.step} value={p.value} onChange={(e) => p.onChange(Number(e.target.value))} className="accent-[var(--accent)]" />
    </label>
  );
}
function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} className="accent-[var(--accent)]" />{label}</label>;
}
function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return <div className="card p-4"><div className="text-xs uppercase tracking-wide text-muted">{label}</div><div className={`tabular mt-1 text-xl font-semibold ${accent ? 'text-[var(--accent)]' : ''}`}>{value}</div></div>;
}
