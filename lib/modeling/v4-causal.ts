/**
 * V4 — Causal / structural estimators.
 *
 * 1. syntheticControlEstimate: a REAL, hand-rolled synthetic control method. It finds
 *    non-negative donor weights on the simplex (sum to 1) that best reconstruct the
 *    treatment unit's PRE-period series via projected gradient descent, then applies
 *    those weights post-period to build a counterfactual and reads off the lift. This
 *    is the same estimand as the `Synth` / `gsynth` R packages, just implemented as a
 *    small numeric optimizer rather than a heavy library — no MCMC, no external deps.
 *
 * 2. automatedGeoExperimentDesign: builds on selectMatchedMarkets to automatically
 *    lay out MULTIPLE non-overlapping treatment/control geo clusters from current
 *    recommendation data — the "automated geo experiments" piece.
 */
import type { DMA, MatchedMarket, Recommendation } from '../types';
import { selectMatchedMarkets } from './index';

export interface SyntheticControlResult {
  weights: { dma: string; weight: number }[];
  counterfactual: number[];
  lift: number[];
  cumulativeLift: number;
  preRmse: number;
}

/**
 * Synthetic control via projected gradient descent on the simplex.
 *
 * Minimizes  || treatmentPre - W·donorsPre ||^2  subject to  w_i >= 0, sum w_i = 1.
 * After fitting on the pre-period, the same weights reconstruct the post-period
 * counterfactual; lift = observed - counterfactual.
 */
export function syntheticControlEstimate(
  treatmentSeries: number[],
  donorSeries: { dma: string; series: number[] }[],
  treatmentStartIndex: number,
): SyntheticControlResult {
  const donors = donorSeries.filter((d) => d.series.length === treatmentSeries.length);
  const k = donors.length;
  const T = treatmentSeries.length;
  const t0 = Math.max(1, Math.min(treatmentStartIndex, T - 1));

  if (k === 0) {
    return {
      weights: [],
      counterfactual: treatmentSeries.slice(),
      lift: new Array(T).fill(0),
      cumulativeLift: 0,
      preRmse: 0,
    };
  }

  // Initialize at the uniform simplex point.
  let w = new Array(k).fill(1 / k);

  const preLen = t0;
  const lr = 0.5;
  const iters = 4000;

  // Normalize scale to keep gradients well-conditioned.
  const scale =
    Math.max(
      1,
      treatmentSeries.slice(0, preLen).reduce((s, x) => s + Math.abs(x), 0) / preLen,
    );

  for (let it = 0; it < iters; it++) {
    const grad = new Array(k).fill(0);
    for (let t = 0; t < preLen; t++) {
      let pred = 0;
      for (let j = 0; j < k; j++) pred += w[j] * donors[j].series[t];
      const resid = (pred - treatmentSeries[t]) / scale;
      for (let j = 0; j < k; j++) {
        grad[j] += (2 * resid * donors[j].series[t]) / scale / preLen;
      }
    }
    for (let j = 0; j < k; j++) w[j] -= lr * grad[j];
    w = projectToSimplex(w);
  }

  const counterfactual = new Array(T).fill(0);
  for (let t = 0; t < T; t++) {
    let pred = 0;
    for (let j = 0; j < k; j++) pred += w[j] * donors[j].series[t];
    counterfactual[t] = pred;
  }

  const lift = treatmentSeries.map((y, t) => y - counterfactual[t]);
  const cumulativeLift = lift.slice(t0).reduce((s, x) => s + x, 0);

  let sse = 0;
  for (let t = 0; t < preLen; t++) sse += (treatmentSeries[t] - counterfactual[t]) ** 2;
  const preRmse = Math.sqrt(sse / preLen);

  return {
    weights: donors.map((d, j) => ({ dma: d.dma, weight: Math.round(w[j] * 1000) / 1000 })),
    counterfactual,
    lift,
    cumulativeLift,
    preRmse,
  };
}

/** Euclidean projection of a vector onto the probability simplex {w>=0, sum w=1}. */
export function projectToSimplex(v: number[]): number[] {
  const n = v.length;
  if (n === 0) return v;
  const u = [...v].sort((a, b) => b - a);
  const cssv = [];
  let cum = 0;
  for (let i = 0; i < n; i++) {
    cum += u[i];
    cssv.push(cum);
  }
  let rho = 0;
  for (let i = 0; i < n; i++) {
    if (u[i] + (1 - cssv[i]) / (i + 1) > 0) rho = i;
  }
  const theta = (cssv[rho] - 1) / (rho + 1);
  return v.map((x) => Math.max(x - theta, 0));
}

// ---------------------------------------------------------------------------
// Automated multi-cluster geo experiment design
// ---------------------------------------------------------------------------

export interface GeoExperimentDesign {
  id: string;
  treatmentDmas: string[];
  controlDmas: string[];
  expectedPower: number; // 0-1
  designRationale: string;
}

export interface AutoDesignConstraints {
  controlsPerTreatment?: number;
  minSimilarity?: number;
  durationDays?: number;
}

/**
 * Greedily lay out multiple non-overlapping treatment/control clusters.
 *
 * Treatment DMAs are picked in descending order of "investability" (opportunity
 * score x marginal ROAS x confidence from current recommendations). For each, the
 * best matched controls are drawn from the remaining unused DMAs via
 * selectMatchedMarkets. No DMA is ever reused across clusters. Expected power is a
 * monotone function of control similarity and treatment opportunity strength.
 */
export function automatedGeoExperimentDesign(
  allDmas: DMA[],
  recommendations: Recommendation[],
  candidateTreatmentCount: number,
  recentDemand: Record<string, number>,
  constraints: AutoDesignConstraints = {},
): GeoExperimentDesign[] {
  const controlsPer = constraints.controlsPerTreatment ?? 3;
  const minSim = constraints.minSimilarity ?? 0;

  const recByDma = new Map(recommendations.map((r) => [r.dma, r]));
  const dmaById = new Map(allDmas.map((d) => [d.id, d]));

  const investability = (dmaId: string): number => {
    const r = recByDma.get(dmaId);
    if (!r) return 0;
    return (r.opportunityScore / 100) * Math.max(0, r.marginalRoas) * r.confidence;
  };

  const ranked = [...allDmas]
    .map((d) => ({ d, score: investability(d.id) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  const used = new Set<string>();
  const designs: GeoExperimentDesign[] = [];

  for (const { d: treatment, score } of ranked) {
    if (designs.length >= candidateTreatmentCount) break;
    if (used.has(treatment.id)) continue;

    const available = allDmas.filter((x) => x.id !== treatment.id && !used.has(x.id));
    if (available.length === 0) continue;

    const matches: MatchedMarket[] = selectMatchedMarkets(treatment, available, {
      recentDemand,
    });
    const controls = matches
      .filter((m) => m.similarity >= minSim)
      .slice(0, controlsPer);
    if (controls.length === 0) continue;

    used.add(treatment.id);
    controls.forEach((c) => used.add(c.dma));

    const avgSim =
      controls.reduce((s, c) => s + c.similarity, 0) / controls.length;
    // expected power: more similar controls + stronger treatment signal -> more power.
    const expectedPower =
      Math.round(
        Math.min(0.98, 0.35 + avgSim * 0.45 + Math.min(score, 2) * 0.12) * 100,
      ) / 100;

    const r = recByDma.get(treatment.id);
    designs.push({
      id: `EXP-${treatment.id}`,
      treatmentDmas: [treatment.id],
      controlDmas: controls.map((c) => c.dma),
      expectedPower,
      designRationale: `${treatment.name} is high-investability (opportunity ${r?.opportunityScore ?? 0}, mROAS ${(r?.marginalRoas ?? 0).toFixed(2)}, conf ${(r?.confidence ?? 0).toFixed(2)}). Matched to ${controls.length} controls (${controls
        .map((c) => dmaById.get(c.dma)?.name ?? c.dma)
        .join(', ')}) at avg similarity ${avgSim.toFixed(2)}. Run ${constraints.durationDays ?? 21}-day geo holdout; expected power ${(expectedPower * 100).toFixed(0)}%.`,
    });
  }

  return designs;
}
