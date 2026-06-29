/**
 * V3 — Bayesian hierarchical MMM (empirical-Bayes approximation) + credible intervals.
 *
 * IMPORTANT LABELING: The functions here are GENUINE statistical computations
 * (empirical-Bayes partial pooling / James-Stein shrinkage, and a real nonparametric
 * percentile bootstrap). They are an *empirical Bayes approximation* to a full
 * hierarchical Bayesian MMM (e.g. Stan / PyMC with NUTS sampling). A production V4+
 * would replace the closed-form shrinkage and bootstrap below with full posterior
 * sampling (MCMC). The math here is real — it is not a placeholder — but it trades
 * full posterior inference for a fast, deterministic, inspectable approximation.
 */
import { mulberry32 } from '../rng';
import type { MediaObservation } from '../types';
import { calculateMarginalROAS } from './index';

export interface GroupEstimate {
  group: string;
  estimate: number;
  n: number;
  /** sampling variance of this group's estimate (within-group noise). */
  varianceWithinGroup: number;
}

export interface ShrunkEstimate {
  group: string;
  rawEstimate: number;
  shrunkEstimate: number;
  /** 0 = fully pooled to grand mean, 1 = no shrinkage (trust own estimate). */
  shrinkageWeight: number;
  grandMean: number;
}

/**
 * Empirical-Bayes / James-Stein-style partial pooling.
 *
 * Computes a grand mean across groups, estimates the between-group variance
 * (tau^2) by method-of-moments, and shrinks each group toward the grand mean by a
 * reliability weight   w_i = tau^2 / (tau^2 + sigma_i^2 / n_i),  i.e. a group is
 * trusted in proportion to its sample size and the between-group signal, and pulled
 * toward the pool when its own estimate is noisy or its n is small.
 *
 *   shrunk_i = w_i * raw_i + (1 - w_i) * grandMean
 */
export function hierarchicalShrinkage(groupEstimates: GroupEstimate[]): ShrunkEstimate[] {
  const k = groupEstimates.length;
  if (k === 0) return [];
  if (k === 1) {
    const g = groupEstimates[0];
    return [
      {
        group: g.group,
        rawEstimate: g.estimate,
        shrunkEstimate: g.estimate,
        shrinkageWeight: 1,
        grandMean: g.estimate,
      },
    ];
  }

  // Precision-weighted grand mean (groups with more data / less variance count more).
  const precision = (g: GroupEstimate) => g.n / Math.max(g.varianceWithinGroup, 1e-9);
  const totalPrec = groupEstimates.reduce((s, g) => s + precision(g), 0);
  const grandMean =
    totalPrec > 0
      ? groupEstimates.reduce((s, g) => s + precision(g) * g.estimate, 0) / totalPrec
      : groupEstimates.reduce((s, g) => s + g.estimate, 0) / k;

  // Between-group variance (tau^2) via method of moments: observed spread minus the
  // mean within-group sampling variance. Floored at 0.
  const observedSpread =
    groupEstimates.reduce((s, g) => s + (g.estimate - grandMean) ** 2, 0) / (k - 1);
  const meanWithinVar =
    groupEstimates.reduce((s, g) => s + g.varianceWithinGroup / Math.max(g.n, 1), 0) / k;
  const tau2 = Math.max(observedSpread - meanWithinVar, 1e-9);

  return groupEstimates.map((g) => {
    const sampelingVar = g.varianceWithinGroup / Math.max(g.n, 1); // sigma_i^2 / n_i
    const w = tau2 / (tau2 + sampelingVar);
    const shrunk = w * g.estimate + (1 - w) * grandMean;
    return {
      group: g.group,
      rawEstimate: g.estimate,
      shrunkEstimate: shrunk,
      shrinkageWeight: w,
      grandMean,
    };
  });
}

export interface CredibleInterval {
  point: number;
  lower: number;
  upper: number;
  level: number;
}

/**
 * Real nonparametric percentile bootstrap.
 *
 * Resamples `data` with replacement `iterations` times; for each resample the caller's
 * `estimateFn(resample)` recomputes the statistic. Returns the median-of-bootstrap-aware
 * point (the estimate on the full data) plus the empirical [alpha/2, 1-alpha/2] percentile
 * bounds — a genuine bootstrap credible/confidence interval, not a parametric guess.
 *
 * Deterministic: uses the seeded mulberry32 RNG so server/client renders match.
 */
export function bootstrapCredibleInterval(
  estimateFn: (sample: number[]) => number,
  data: number[],
  iterations = 1000,
  level = 0.9,
  seed = 1234,
): CredibleInterval {
  const point = estimateFn(data);
  const n = data.length;
  if (n === 0) return { point, lower: point, upper: point, level };

  const rand = mulberry32(seed);
  const stats: number[] = [];
  for (let b = 0; b < iterations; b++) {
    const resample = new Array<number>(n);
    for (let i = 0; i < n; i++) {
      resample[i] = data[Math.floor(rand() * n)];
    }
    const s = estimateFn(resample);
    if (Number.isFinite(s)) stats.push(s);
  }
  stats.sort((a, b) => a - b);
  const alpha = (1 - level) / 2;
  const lo = percentile(stats, alpha);
  const hi = percentile(stats, 1 - alpha);
  return { point, lower: lo, upper: hi, level };
}

function percentile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const idx = q * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const frac = idx - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

export const mean = (xs: number[]): number =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;

// ---------------------------------------------------------------------------
// Applied: hierarchical shrinkage of per-DMA media-incrementality estimates.
// ---------------------------------------------------------------------------

export interface DmaIncrementalityResult {
  dma: string;
  region: string;
  n: number;
  rawEstimate: number;
  shrunkEstimate: number;
  shrinkageWeight: number;
  grandMean: number;
  credibleInterval: CredibleInterval;
}

/**
 * Per-DMA media-incrementality estimate, partially pooled across DMAs.
 *
 * For each DMA we estimate a daily incremental-revenue-per-dollar signal from its
 * mock media history (conversions-based proxy via per-observation marginal ROAS),
 * forming a noisy point estimate per DMA. Small / noisy DMAs get partially pooled
 * toward the (precision-weighted) grand mean via `hierarchicalShrinkage`, and each
 * DMA's estimate is wrapped in a real bootstrap credible interval over its daily
 * per-observation samples. Small-n DMAs visibly shrink MORE toward the pool.
 */
export function shrinkDmaIncrementality(
  dmas: { id: string; region: string }[],
  media: MediaObservation[],
  opts: { halfSaturation?: number; maxResponse?: number } = {},
): DmaIncrementalityResult[] {
  const halfSaturation = opts.halfSaturation ?? 3000;
  const maxResponse = opts.maxResponse ?? 40000;

  // Per-DMA daily incrementality samples (marginal value per $ of spend).
  const samplesByDma = new Map<string, number[]>();
  for (const m of media) {
    if (m.spend <= 0) continue;
    const { marginalRoas } = calculateMarginalROAS({
      spend: m.spend,
      channel: m.channel,
      halfSaturation,
      maxResponse,
    });
    // weight the structural marginal ROAS by the observed conversion intensity so
    // DMAs with stronger realized response read as more incremental.
    const observedIntensity = m.clicks > 0 ? m.conversions / m.clicks : 0;
    const sample = marginalRoas * (0.6 + observedIntensity * 4);
    const arr = samplesByDma.get(m.dma);
    if (arr) arr.push(sample);
    else samplesByDma.set(m.dma, [sample]);
  }

  const regionByDma = new Map(dmas.map((d) => [d.id, d.region]));

  const groupEstimates: GroupEstimate[] = [];
  const samplesOrdered: { dma: string; samples: number[] }[] = [];
  for (const d of dmas) {
    const samples = samplesByDma.get(d.id) ?? [];
    if (samples.length === 0) continue;
    const m = mean(samples);
    const variance =
      samples.length > 1
        ? samples.reduce((s, x) => s + (x - m) ** 2, 0) / (samples.length - 1)
        : Math.max(m * m, 1e-6);
    groupEstimates.push({
      group: d.id,
      estimate: m,
      n: samples.length,
      varianceWithinGroup: Math.max(variance, 1e-6),
    });
    samplesOrdered.push({ dma: d.id, samples });
  }

  const shrunk = hierarchicalShrinkage(groupEstimates);
  const shrunkByGroup = new Map(shrunk.map((s) => [s.group, s]));

  return samplesOrdered.map(({ dma, samples }, i) => {
    const s = shrunkByGroup.get(dma)!;
    const ci = bootstrapCredibleInterval(
      (sample) => mean(sample),
      samples,
      500,
      0.9,
      1000 + i,
    );
    return {
      dma,
      region: regionByDma.get(dma) ?? 'Unknown',
      n: samples.length,
      rawEstimate: s.rawEstimate,
      shrunkEstimate: s.shrunkEstimate,
      shrinkageWeight: s.shrinkageWeight,
      grandMean: s.grandMean,
      credibleInterval: ci,
    };
  });
}
