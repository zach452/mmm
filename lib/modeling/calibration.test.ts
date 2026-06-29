import { describe, it, expect } from 'vitest';
import { calibrateHillCurve, HillObservation } from './calibration';
import { hillSaturation } from './index';
import { mulberry32 } from '../rng';

/** Generate synthetic observations from a known Hill curve + multiplicative noise. */
function synth(
  trueH: number,
  trueS: number,
  trueScale: number,
  n: number,
  noise: number,
  seed = 42,
): HillObservation[] {
  const rand = mulberry32(seed);
  const out: HillObservation[] = [];
  for (let i = 0; i < n; i++) {
    // spend spread across a range that brackets the half-saturation point
    const spend = trueH * (0.1 + (i / n) * 3.5) * (0.85 + rand() * 0.3);
    const clean = trueScale * hillSaturation(spend, trueH, trueS);
    const noisy = clean * (1 + (rand() - 0.5) * 2 * noise);
    out.push({ spend, conversions: Math.max(0, noisy) });
  }
  return out;
}

describe('calibrateHillCurve', () => {
  it('recovers parameters from a clean known Hill curve', () => {
    const obs = synth(2000, 1.6, 500, 60, 0, 7);
    const fit = calibrateHillCurve(obs);
    expect(fit.r2).toBeGreaterThan(0.98);
    // half-saturation recovered within ~25%
    expect(fit.halfSaturation).toBeGreaterThan(2000 * 0.75);
    expect(fit.halfSaturation).toBeLessThan(2000 * 1.25);
    // slope in a sensible neighborhood of the truth
    expect(fit.slope).toBeGreaterThan(1.0);
    expect(fit.slope).toBeLessThan(2.4);
    // scale (asymptote) recovered within ~30%
    expect(fit.scale).toBeGreaterThan(500 * 0.7);
    expect(fit.scale).toBeLessThan(500 * 1.3);
  });

  it('fits reasonably under moderate noise', () => {
    const obs = synth(1500, 1.2, 800, 80, 0.15, 11);
    const fit = calibrateHillCurve(obs);
    expect(fit.r2).toBeGreaterThan(0.7);
    expect(fit.halfSaturation).toBeGreaterThan(1500 * 0.5);
    expect(fit.halfSaturation).toBeLessThan(1500 * 1.8);
  });

  it('actually fits — different data yields different parameters', () => {
    const a = calibrateHillCurve(synth(800, 1.1, 300, 50, 0, 1));
    const b = calibrateHillCurve(synth(4000, 2.2, 900, 50, 0, 1));
    expect(b.halfSaturation).toBeGreaterThan(a.halfSaturation);
    expect(b.slope).toBeGreaterThan(a.slope);
  });

  it('degrades gracefully with too few points', () => {
    const fit = calibrateHillCurve([{ spend: 100, conversions: 10 }]);
    expect(fit.n).toBe(1);
    expect(fit.slope).toBeGreaterThan(0);
  });
});
