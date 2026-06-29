/**
 * Hill-curve calibration from historical spend → response.
 *
 * Fits the saturation curve  response ≈ A · hill(spend, halfSaturation, slope)
 * where hill(x, h, s) = x^s / (x^s + h^s), to observed (spend, conversions) pairs.
 *
 * Approach: grid-search / coordinate-descent over (halfSaturation, slope). For
 * each candidate (h, s), the scale A is solved in closed form by least squares
 * (A* = Σ(y·f) / Σ(f²), where f = hill(x,h,s)), then we score by R². We coarse
 * grid-search, then locally refine around the best point. This actually fits the
 * data rather than returning constants — verified against synthetic data in
 * calibration.test.ts.
 *
 * NOTE: this calibrates the static (per-observation) Hill response. The optimizer
 * additionally adstocks spend; calibrating on already-adstocked spend would be a
 * straightforward extension and is noted where it's wired in.
 */
import { hillSaturation } from './index';

export interface HillObservation {
  spend: number;
  conversions: number;
}

export interface HillCalibration {
  halfSaturation: number;
  slope: number;
  scale: number; // A: max response asymptote (conversions as spend → ∞)
  r2: number;
  n: number;
}

function fitScaleAndR2(
  obs: HillObservation[],
  h: number,
  s: number,
): { scale: number; r2: number; sse: number } {
  let sumFY = 0;
  let sumFF = 0;
  for (const o of obs) {
    const f = hillSaturation(o.spend, h, s);
    sumFY += f * o.conversions;
    sumFF += f * f;
  }
  const scale = sumFF > 0 ? sumFY / sumFF : 0;

  const meanY = obs.reduce((acc, o) => acc + o.conversions, 0) / obs.length;
  let sse = 0;
  let sst = 0;
  for (const o of obs) {
    const pred = scale * hillSaturation(o.spend, h, s);
    sse += (o.conversions - pred) ** 2;
    sst += (o.conversions - meanY) ** 2;
  }
  const r2 = sst > 0 ? 1 - sse / sst : 0;
  return { scale, r2, sse };
}

export function calibrateHillCurve(observations: HillObservation[]): HillCalibration {
  const obs = observations.filter(
    (o) => Number.isFinite(o.spend) && o.spend > 0 && Number.isFinite(o.conversions),
  );
  if (obs.length < 3) {
    // Not enough signal to fit — fall back to neutral defaults.
    const meanSpend = obs.length ? obs.reduce((a, o) => a + o.spend, 0) / obs.length : 1000;
    return { halfSaturation: meanSpend || 1000, slope: 1.3, scale: 0, r2: 0, n: obs.length };
  }

  const spends = obs.map((o) => o.spend);
  const minSpend = Math.min(...spends);
  const maxSpend = Math.max(...spends);

  // --- coarse grid search ---------------------------------------------------
  // halfSaturation spans roughly [0.2·min, 3·max]; slope spans [0.5, 4].
  const hLo = Math.max(1, minSpend * 0.2);
  const hHi = Math.max(hLo * 2, maxSpend * 3);
  const hGrid = logspace(hLo, hHi, 24);
  const sGrid = linspace(0.5, 4, 24);

  let best = { h: hGrid[0], s: sGrid[0], scale: 0, r2: -Infinity };
  for (const h of hGrid) {
    for (const s of sGrid) {
      const { scale, r2 } = fitScaleAndR2(obs, h, s);
      if (r2 > best.r2) best = { h, s, scale, r2 };
    }
  }

  // --- local refinement (coordinate descent around the coarse optimum) ------
  let { h, s } = best;
  let { scale, r2 } = best;
  let hStep = h * 0.25;
  let sStep = 0.25;
  for (let iter = 0; iter < 60; iter++) {
    let improved = false;
    for (const dh of [-hStep, hStep]) {
      const hc = Math.max(1, h + dh);
      const cand = fitScaleAndR2(obs, hc, s);
      if (cand.r2 > r2) {
        h = hc;
        scale = cand.scale;
        r2 = cand.r2;
        improved = true;
      }
    }
    for (const ds of [-sStep, sStep]) {
      const sc = Math.min(6, Math.max(0.2, s + ds));
      const cand = fitScaleAndR2(obs, h, sc);
      if (cand.r2 > r2) {
        s = sc;
        scale = cand.scale;
        r2 = cand.r2;
        improved = true;
      }
    }
    if (!improved) {
      hStep *= 0.5;
      sStep *= 0.5;
      if (hStep < h * 1e-3 && sStep < 1e-3) break;
    }
  }

  return {
    halfSaturation: Math.round(h * 100) / 100,
    slope: Math.round(s * 1000) / 1000,
    scale: Math.round(scale * 100) / 100,
    r2: Math.round(r2 * 10000) / 10000,
    n: obs.length,
  };
}

function linspace(lo: number, hi: number, n: number): number[] {
  const out: number[] = [];
  const step = (hi - lo) / (n - 1);
  for (let i = 0; i < n; i++) out.push(lo + step * i);
  return out;
}

function logspace(lo: number, hi: number, n: number): number[] {
  const a = Math.log(lo);
  const b = Math.log(hi);
  return linspace(a, b, n).map((x) => Math.exp(x));
}
