'use client';

import { useMemo, useState } from 'react';
import { DMA, MatchedMarket, Recommendation } from '@/lib/types';
import { selectMatchedMarkets } from '@/lib/modeling';
import {
  applyExperimentReadout,
  type ExperimentReadout,
  type UpdatedRecommendation,
} from '@/lib/modeling/v3-feedback';
import {
  automatedGeoExperimentDesign,
  type GeoExperimentDesign,
} from '@/lib/modeling/v4-causal';
import { mulberry32, hashSeed, gaussian } from '@/lib/rng';
import { ActionBadge, Pill, SectionCard } from './ui';

const EXPERIMENT_TYPES = [
  { type: 'Weather-Window Geo Lift Test', objective: 'Measure incremental revenue from increasing spend in DMAs entering a high-trigger weather regime.', kpi: 'Incremental revenue', secondary: ['New customer rate', 'iROAS'], duration: 21, mde: '~8% lift (power 0.8, α 0.05)', risk: 'Weather regime may dissipate mid-test; pre-register the window.' },
  { type: 'Matched Market Test', objective: 'Compare treatment DMAs against similar control DMAs to isolate media causality from weather demand.', kpi: 'Incremental revenue vs control', secondary: ['CAC', 'MER'], duration: 28, mde: '~6% lift', risk: 'Control contamination if controls share a media buy.' },
  { type: 'Synthetic Control', objective: 'Build a weighted synthetic counterfactual from untreated DMAs to estimate lift where no clean 1:1 match exists.', kpi: 'Gap vs synthetic control', secondary: ['Cumulative lift'], duration: 35, mde: '~5% lift', risk: 'Requires stable pre-period; weather shocks reduce fit quality.' },
  { type: 'Creative Relevance Test', objective: 'Test weather-themed creative vs evergreen creative within the same weather regime.', kpi: 'CVR / ROAS by creative', secondary: ['CTR', 'Thumb-stop rate'], duration: 14, mde: '~10% CVR delta', risk: 'Creative fatigue; rotate to avoid frequency confounds.' },
  { type: 'Funnel Mix Test', objective: 'Test full-funnel sequencing (TOF→BOF) vs BOF-only during a weather window.', kpi: 'Blended MER', secondary: ['New customers', 'AOV'], duration: 28, mde: '~7% MER delta', risk: 'Attribution windows must cover the full path.' },
  { type: 'Timing Test', objective: 'Test pre-event priming vs during-event activation to find the optimal spend curve.', kpi: 'Revenue per $ by timing', secondary: ['Lead time to conversion'], duration: 21, mde: '~8% efficiency delta', risk: 'Forecast error shifts the true event window.' },
];

export default function Experiments({
  dmas,
  recentDemand,
  recommendations,
}: {
  dmas: DMA[];
  recentDemand: Record<string, number>;
  recommendations: Recommendation[];
}) {
  const [treatmentId, setTreatmentId] = useState(dmas[0].id);
  const treatment = dmas.find((d) => d.id === treatmentId)!;

  const matches: MatchedMarket[] = useMemo(
    () => selectMatchedMarkets(treatment, dmas, { recentDemand }).slice(0, 6),
    [treatment, dmas, recentDemand],
  );

  const recByDma = useMemo(
    () => new Map(recommendations.map((r) => [r.dma, r])),
    [recommendations],
  );

  // V3 feedback loop: simulate a readout for the selected treatment DMA and run it
  // through applyExperimentReadout to show the before/after recommendation.
  const [readout, setReadout] = useState<{
    result: ExperimentReadout;
    updated: UpdatedRecommendation;
    prior: Recommendation;
  } | null>(null);

  function simulateReadout() {
    const prior = recByDma.get(treatmentId) ?? recommendations[0];
    if (!prior) return;
    // Seeded synthetic experiment result anchored on the model's prediction.
    const rand = mulberry32(hashSeed(`readout-${treatmentId}-${prior.action}`));
    const predictedFracLift = Math.max(
      0.02,
      Math.min(0.18, prior.expectedRevenueLift / Math.max(1, prior.expectedRevenueLift + 60000)),
    );
    // Observed lift drawn around the model prediction with noise; sometimes contradicts.
    const observedLift = gaussian(rand, predictedFracLift * (rand() < 0.25 ? -0.8 : 1), 0.05);
    const se = 0.025 + rand() * 0.02;
    const ciLower = observedLift - 1.64 * se;
    const ciUpper = observedLift + 1.64 * se;
    const isSignificant = ciLower > 0 || ciUpper < 0;
    const result: ExperimentReadout = { observedLift, ciLower, ciUpper, isSignificant };
    const updated = applyExperimentReadout(prior, result);
    setReadout({ result, updated, prior });
  }

  // V4 automated experiment slate.
  const [slate, setSlate] = useState<GeoExperimentDesign[] | null>(null);
  function generateSlate() {
    const designs = automatedGeoExperimentDesign(dmas, recommendations, 5, recentDemand, {
      controlsPerTreatment: 3,
      durationDays: 21,
    });
    setSlate(designs);
  }

  const dmaName = (id: string) => dmas.find((d) => d.id === id)?.name ?? id;

  return (
    <div className="space-y-6">
      <SectionCard title="Matched Market Finder" subtitle="Pick a treatment DMA; controls are ranked live by weighted similarity (population, region, baseline, climate, recent demand).">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-muted">
            Treatment DMA
            <select value={treatmentId} onChange={(e) => setTreatmentId(e.target.value)} className="rounded-md border bg-[var(--surface-2)] px-2 py-1.5 text-xs text-foreground outline-none">
              {dmas.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.region})</option>)}
            </select>
          </label>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-3 py-2">Rank</th><th className="px-3 py-2">Control DMA</th><th className="px-3 py-2">Region</th>
                <th className="px-3 py-2 text-right">Similarity</th><th className="px-3 py-2 text-right">Distance</th>
              </tr>
            </thead>
            <tbody>
              {matches.map((m, i) => (
                <tr key={m.dma} className="border-b">
                  <td className="px-3 py-2 tabular">{i + 1}</td>
                  <td className="px-3 py-2 font-medium">{m.dmaName}</td>
                  <td className="px-3 py-2 text-xs">{m.region}</td>
                  <td className="px-3 py-2 text-right">
                    <span className="inline-flex items-center gap-2">
                      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-[var(--surface-2)]"><span className="block h-full rounded-full bg-[var(--accent)]" style={{ width: `${m.similarity * 100}%` }} /></span>
                      <span className="tabular">{Math.round(m.similarity * 100)}%</span>
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular text-muted">{m.distance.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard
        title="Experiment Feedback Loop (V3)"
        subtitle="Model informs the experiment; the experiment readout feeds back to update the recommendation. Simulated readout uses the seeded RNG."
      >
        <button
          onClick={simulateReadout}
          className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-black"
        >
          Simulate readout → update recommendation
        </button>
        {readout && (
          <div className="mt-4 space-y-3 text-xs">
            <div className="rounded-lg bg-[var(--surface-2)] p-3">
              <span className="text-muted">Synthetic experiment result for {treatment.name}: </span>
              observed lift <strong className="text-foreground">{(readout.result.observedLift * 100).toFixed(1)}%</strong>{' '}
              (90% CI {(readout.result.ciLower * 100).toFixed(1)}% … {(readout.result.ciUpper * 100).toFixed(1)}%) ·{' '}
              {readout.result.isSignificant ? 'significant' : 'not significant'} · verdict:{' '}
              <strong className="text-foreground capitalize">{readout.updated.feedbackVerdict}</strong>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="card p-3">
                <div className="text-[10px] uppercase tracking-wide text-muted">Before (model only)</div>
                <div className="mt-1 flex items-center gap-2">
                  <ActionBadge action={readout.prior.action} />
                  <span className="tabular text-muted">conf {Math.round(readout.prior.confidence * 100)}%</span>
                </div>
              </div>
              <div className="card p-3">
                <div className="text-[10px] uppercase tracking-wide text-muted">After (model + experiment)</div>
                <div className="mt-1 flex items-center gap-2">
                  <ActionBadge action={readout.updated.action} />
                  <span className="tabular text-muted">conf {Math.round(readout.updated.confidence * 100)}%</span>
                </div>
              </div>
            </div>
            <p className="leading-relaxed text-muted">{readout.updated.feedbackNote}</p>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Automated Experiment Slate (V4)"
        subtitle="Automatically lays out multiple non-overlapping treatment/control geo clusters, ranked by investability, from current recommendation data."
      >
        <button
          onClick={generateSlate}
          className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-black"
        >
          Generate automated experiment slate
        </button>
        {slate && (
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {slate.length === 0 && <p className="text-xs text-muted">No investable designs found.</p>}
            {slate.map((d, i) => (
              <div key={d.id} className="card p-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold">#{i + 1} · {dmaName(d.treatmentDmas[0])}</h4>
                  <Pill>power {Math.round(d.expectedPower * 100)}%</Pill>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <Detail label="Treatment" value={d.treatmentDmas.map(dmaName).join(', ')} />
                  <Detail label="Controls" value={d.controlDmas.map(dmaName).join(', ')} />
                </div>
                <p className="mt-2 text-xs leading-relaxed text-muted">{d.designRationale}</p>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        {EXPERIMENT_TYPES.map((e) => (
          <div key={e.type} className="card p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">{e.type}</h3>
              <Pill>{e.duration}d</Pill>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted">{e.objective}</p>
            <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
              <Detail label="Treatment markets" value={`${treatment.name} + 2 similar`} />
              <Detail label="Control markets" value={matches.slice(0, 3).map((m) => m.dmaName).join(', ')} />
              <Detail label="Primary KPI" value={e.kpi} />
              <Detail label="Secondary KPIs" value={e.secondary.join(', ')} />
              <Detail label="MDE" value={e.mde} />
              <Detail label="Measurement risk" value={e.risk} />
            </div>
            <div className="mt-3 rounded-lg bg-[var(--surface-2)] p-2.5 text-xs leading-relaxed">
              <span className="text-muted">Recommended readout: </span>
              Difference-in-differences vs matched control over the test window + 7-day tail, with the weather baseline netted out before attributing lift to media.
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
      <div className="leading-relaxed">{value}</div>
    </div>
  );
}
