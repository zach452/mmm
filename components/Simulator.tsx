'use client';

import { useMemo, useState } from 'react';
import {
  Action,
  Channel,
  FunnelStage,
  ProductCategory,
  ScenarioOutput,
  WeatherRegime,
} from '@/lib/types';
import {
  calculateCategoryTriggerIndex,
  calculateMarginalROAS,
  decomposeRevenue,
  estimateMediaIncrementality,
  estimateWeatherMediaInteraction,
} from '@/lib/modeling';
import { ActionBadge, fmtCurrency, Pill, RiskBadge, SectionCard } from './ui';

export interface SimDMA {
  id: string;
  name: string;
  region: string;
  baseline: number;
}

const CATEGORIES: ProductCategory[] = ['At-Home Beauty', 'Outerwear', 'Footwear', 'Hydration', 'Baby Care', 'Wellness'];
const REGIMES: WeatherRegime[] = ['Normal', 'Cold Snap', 'Heat Wave', 'Rainy Weekend', 'Snow Event', 'High UV', 'Poor Air Quality', 'Severe Storm', 'First Warm Weekend', 'First Cold Snap'];
const CHANNELS: Channel[] = ['Meta', 'Google Search', 'TikTok', 'YouTube', 'CTV', 'Pinterest', 'Amazon/RMN'];
const STAGES: FunnelStage[] = ['TOF', 'MOF', 'BOF', 'Retention'];

export default function Simulator({ dmas }: { dmas: SimDMA[] }) {
  const [dmaId, setDmaId] = useState(dmas[0].id);
  const [category, setCategory] = useState<ProductCategory>('Outerwear');
  const [regime, setRegime] = useState<WeatherRegime>('Cold Snap');
  const [timeWindow, setTimeWindow] = useState<'pre' | 'during' | 'post'>('during');
  const [currentBudget, setCurrentBudget] = useState(20000);
  const [proposedChange, setProposedChange] = useState(8000);
  const [channel, setChannel] = useState<Channel>('Google Search');
  const [funnel, setFunnel] = useState<FunnelStage>('BOF');
  const [margin, setMargin] = useState(0.42);
  const [cacTarget, setCacTarget] = useState(45);
  const [merTarget, setMerTarget] = useState(4);
  const [inventoryReady, setInventoryReady] = useState(true);
  const [creativeReady, setCreativeReady] = useState(true);

  const dma = dmas.find((d) => d.id === dmaId)!;

  const output: ScenarioOutput = useMemo(() => {
    const trigger = calculateCategoryTriggerIndex(category, regime, { tempAnomaly: regime.includes('Cold') ? -8 : regime === 'Heat Wave' ? 8 : 0 });
    const interaction = estimateWeatherMediaInteraction({ regime, channel, funnel, triggerIndex: trigger });
    const newBudget = Math.max(0, currentBudget + proposedChange);
    const halfSat = currentBudget * 1.1 || 1000;
    const maxResponse = dma.baseline * 0.45;
    const mediaInc = estimateMediaIncrementality({ spend: newBudget, channel, halfSaturation: halfSat, maxResponse });
    const baseInc = estimateMediaIncrementality({ spend: currentBudget, channel, halfSaturation: halfSat, maxResponse });
    const decomp = decomposeRevenue({
      baseline: dma.baseline,
      triggerIndex: trigger,
      mediaIncrementality: mediaInc,
      interactionMultiplier: interaction,
      promoActive: false,
      promoDiscount: 0,
      inventoryHealthy: inventoryReady,
      seed: dma.baseline + trigger,
    });
    const incrementalRevenue = Math.round((mediaInc - baseInc) * interaction + decomp.weatherLift * 0.3);
    const { marginalRoas, confidence } = calculateMarginalROAS({ spend: newBudget, channel, halfSaturation: halfSat, maxResponse, interactionMultiplier: interaction });

    // timing modifier
    const timingMult = timeWindow === 'during' && funnel === 'BOF' ? 1.15 : timeWindow === 'pre' && (funnel === 'TOF' || funnel === 'MOF') ? 1.1 : timeWindow === 'post' && funnel === 'Retention' ? 1.08 : 0.95;
    const revLift = Math.round(incrementalRevenue * timingMult);
    const newCustomers = Math.max(0, Math.round((revLift * 0.5) / 70));
    const cac = newCustomers > 0 ? Math.round(proposedChange / newCustomers) : Infinity;
    const mer = proposedChange > 0 ? Math.round((revLift / proposedChange) * 10) / 10 : 0;
    const contributionMargin = Math.round(revLift * margin);

    let riskLevel: 'Low' | 'Medium' | 'High' = 'Low';
    if (!inventoryReady || regime === 'Severe Storm') riskLevel = 'High';
    else if (!creativeReady || confidence < 0.55 || cac > cacTarget * 1.3) riskLevel = 'Medium';

    let action: Action = 'Monitor';
    if (riskLevel === 'High') action = 'Suppress';
    else if (marginalRoas >= 1.8 && mer >= merTarget && cac <= cacTarget && creativeReady) action = 'Act';
    else if (marginalRoas >= 1.2 && mer >= merTarget * 0.7) action = 'Test';
    else if (mer < 1) action = 'Ignore';

    const explanation = buildExplanation(action, revLift, mer, cac, cacTarget, marginalRoas, regime, timeWindow, funnel);

    return {
      expectedRevenueLift: revLift,
      expectedRevenueLow: Math.round(revLift * 0.82),
      expectedRevenueHigh: Math.round(revLift * 1.18),
      newCustomers,
      cac: cac === Infinity ? 0 : cac,
      mer,
      contributionMargin,
      confidence,
      action,
      riskLevel,
      explanation,
    };
  }, [dma, category, regime, timeWindow, currentBudget, proposedChange, channel, funnel, margin, cacTarget, merTarget, inventoryReady, creativeReady]);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
      <SectionCard title="Scenario Inputs" subtitle="Adjust and watch the output update live">
        <div className="grid grid-cols-2 gap-3">
          <Field label="DMA"><select value={dmaId} onChange={(e) => setDmaId(e.target.value)} className="sel">{dmas.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
          <Field label="Category"><select value={category} onChange={(e) => setCategory(e.target.value as ProductCategory)} className="sel">{CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></Field>
          <Field label="Weather regime"><select value={regime} onChange={(e) => setRegime(e.target.value as WeatherRegime)} className="sel">{REGIMES.map((r) => <option key={r} value={r}>{r}</option>)}</select></Field>
          <Field label="Time window"><select value={timeWindow} onChange={(e) => setTimeWindow(e.target.value as 'pre' | 'during' | 'post')} className="sel"><option value="pre">Pre-event</option><option value="during">During-event</option><option value="post">Post-event</option></select></Field>
          <Field label="Channel"><select value={channel} onChange={(e) => setChannel(e.target.value as Channel)} className="sel">{CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}</select></Field>
          <Field label="Funnel stage"><select value={funnel} onChange={(e) => setFunnel(e.target.value as FunnelStage)} className="sel">{STAGES.map((s) => <option key={s} value={s}>{s}</option>)}</select></Field>
          <Range label={`Current budget — ${fmtCurrency(currentBudget)}`} min={2000} max={80000} step={1000} value={currentBudget} onChange={setCurrentBudget} />
          <Range label={`Proposed change — ${proposedChange >= 0 ? '+' : ''}${fmtCurrency(proposedChange)}`} min={-20000} max={40000} step={1000} value={proposedChange} onChange={setProposedChange} />
          <Range label={`Margin — ${Math.round(margin * 100)}%`} min={0.2} max={0.7} step={0.01} value={margin} onChange={setMargin} />
          <Range label={`CAC target — $${cacTarget}`} min={20} max={120} step={5} value={cacTarget} onChange={setCacTarget} />
          <Range label={`MER target — ${merTarget}x`} min={1} max={8} step={0.5} value={merTarget} onChange={setMerTarget} />
        </div>
        <div className="mt-3 flex gap-4">
          <Toggle label="Inventory ready" value={inventoryReady} onChange={setInventoryReady} />
          <Toggle label="Creative ready" value={creativeReady} onChange={setCreativeReady} />
        </div>
        <style>{`.sel{background:var(--surface-2);border:1px solid var(--border);border-radius:0.375rem;padding:0.375rem 0.5rem;font-size:0.75rem;color:var(--foreground);outline:none;width:100%}`}</style>
      </SectionCard>

      <SectionCard title="Projected Outcome" subtitle="Modeled from the scenario inputs" right={<ActionBadge action={output.action} />}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Out label="Revenue lift" value={fmtCurrency(output.expectedRevenueLift)} accent sub={`${fmtCurrency(output.expectedRevenueLow)}–${fmtCurrency(output.expectedRevenueHigh)}`} />
          <Out label="New customers" value={output.newCustomers.toLocaleString()} />
          <Out label="CAC" value={output.cac ? `$${output.cac}` : 'n/a'} sub={`target $${cacTarget}`} />
          <Out label="MER" value={`${output.mer}x`} sub={`target ${merTarget}x`} />
          <Out label="Contribution margin" value={fmtCurrency(output.contributionMargin)} />
          <Out label="Confidence" value={`${Math.round(output.confidence * 100)}%`} />
        </div>
        <div className="mt-4 flex items-center gap-2">
          <RiskBadge level={output.riskLevel} />
          <Pill>{regime}</Pill>
          <Pill>{timeWindow}-event</Pill>
        </div>
        <p className="mt-4 rounded-lg border border-dashed p-3 text-sm leading-relaxed text-muted">{output.explanation}</p>
      </SectionCard>
    </div>
  );
}

function buildExplanation(action: Action, rev: number, mer: number, cac: number, cacTarget: number, mroas: number, regime: WeatherRegime, tw: string, funnel: FunnelStage): string {
  const timing = tw === 'during' && funnel === 'BOF' ? 'Timing is well-matched: BOF during the event harvests in-market intent.' : tw === 'pre' && (funnel === 'TOF' || funnel === 'MOF') ? 'Timing is well-matched: upper-funnel ahead of the event primes demand.' : 'Timing/funnel alignment is suboptimal for this window.';
  switch (action) {
    case 'Act':
      return `Scale this. Marginal ROAS ${mroas.toFixed(2)} with ${mer}x MER and CAC under the $${cacTarget} target projects ${rev >= 0 ? '+' : ''}${Math.round(rev).toLocaleString()} in revenue. ${timing}`;
    case 'Test':
      return `Promising but not a slam-dunk — run a controlled geo test first. ${timing}`;
    case 'Suppress':
      return `Hold spend. ${regime} or fulfillment risk makes this a poor acquisition window; protect efficiency. ${timing}`;
    case 'Ignore':
      return `Low marginal return (MER ${mer}x). Added spend mostly subsidizes demand that converts anyway. ${timing}`;
    default:
      return `Mixed signal — keep monitoring. ${timing}`;
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex flex-col gap-1 text-xs text-muted">{label}{children}</label>;
}
function Range({ label, ...p }: { label: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void }) {
  return (
    <label className="col-span-2 flex flex-col gap-1 text-xs text-muted">
      {label}
      <input type="range" min={p.min} max={p.max} step={p.step} value={p.value} onChange={(e) => p.onChange(Number(e.target.value))} className="accent-[var(--accent)]" />
    </label>
  );
}
function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} className="accent-[var(--accent)]" />
      {label}
    </label>
  );
}
function Out({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="card p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
      <div className={`tabular text-lg font-semibold ${accent ? 'text-[var(--positive)]' : ''}`}>{value}</div>
      {sub && <div className="text-[10px] text-muted">{sub}</div>}
    </div>
  );
}
