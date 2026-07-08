import { describe, it, expect } from 'vitest';
import {
  hierarchicalShrinkage,
  bootstrapCredibleInterval,
  shrinkDmaIncrementality,
  mean,
} from './v3-bayesian';
import { applyExperimentReadout } from './v3-feedback';
import type { MediaObservation, Recommendation } from '../types';

describe('hierarchicalShrinkage (empirical Bayes partial pooling)', () => {
  it('shrinks small-n / noisy groups toward the grand mean more than large-n ones', () => {
    const groups = [
      { group: 'big', estimate: 10, n: 500, varianceWithinGroup: 1 },
      { group: 'small', estimate: 10, n: 3, varianceWithinGroup: 20 },
      { group: 'anchor', estimate: 2, n: 500, varianceWithinGroup: 1 },
    ];
    const out = hierarchicalShrinkage(groups);
    const big = out.find((o) => o.group === 'big')!;
    const small = out.find((o) => o.group === 'small')!;
    // small group should have lower shrinkageWeight (pulled more toward pool)
    expect(small.shrinkageWeight).toBeLessThan(big.shrinkageWeight);
    // small group's shrunk estimate should move further from its raw value
    const smallMove = Math.abs(small.shrunkEstimate - small.rawEstimate);
    const bigMove = Math.abs(big.shrunkEstimate - big.rawEstimate);
    expect(smallMove).toBeGreaterThan(bigMove);
    // shrunk estimate lies between raw and grand mean
    expect(small.shrunkEstimate).toBeLessThan(small.rawEstimate);
    expect(small.shrunkEstimate).toBeGreaterThan(small.grandMean);
  });

  it('handles single group without shrinking', () => {
    const out = hierarchicalShrinkage([{ group: 'a', estimate: 5, n: 10, varianceWithinGroup: 1 }]);
    expect(out[0].shrunkEstimate).toBe(5);
    expect(out[0].shrinkageWeight).toBe(1);
  });
});

describe('bootstrapCredibleInterval (nonparametric bootstrap)', () => {
  it('brackets the point estimate', () => {
    const data = [10, 11, 9, 12, 8, 10, 11, 9, 10, 10];
    const ci = bootstrapCredibleInterval((s) => mean(s), data, 1000, 0.9);
    expect(ci.lower).toBeLessThanOrEqual(ci.point);
    expect(ci.upper).toBeGreaterThanOrEqual(ci.point);
  });

  it('widens with more variance', () => {
    const tight = bootstrapCredibleInterval((s) => mean(s), [10, 10, 10, 11, 9, 10, 10, 11], 1000, 0.9);
    const wide = bootstrapCredibleInterval((s) => mean(s), [2, 20, 1, 18, 3, 22, 0, 19], 1000, 0.9);
    const tightWidth = tight.upper - tight.lower;
    const wideWidth = wide.upper - wide.lower;
    expect(wideWidth).toBeGreaterThan(tightWidth);
  });
});

describe('shrinkDmaIncrementality', () => {
  it('shrinks a small-sample DMA more than a large-sample DMA', () => {
    const dmas = [
      { id: 'BIG', region: 'West' },
      { id: 'SMALL', region: 'West' },
      { id: 'MID', region: 'West' },
    ];
    const media: MediaObservation[] = [];
    const mk = (dma: string, i: number, spend: number, conv: number, clicks: number): MediaObservation => ({
      date: `2026-06-${(i % 28) + 1}`,
      dma,
      channel: 'Meta',
      funnel_stage: 'MOF',
      spend,
      impressions: 10000,
      clicks,
      bookings: conv,
      coupon_impressions: 1500,
    });
    for (let i = 0; i < 120; i++) media.push(mk('BIG', i, 2000, 50, 200));
    for (let i = 0; i < 120; i++) media.push(mk('MID', i, 2000, 50, 200));
    // SMALL: very few, noisy, high observations
    media.push(mk('SMALL', 0, 2000, 180, 200));
    media.push(mk('SMALL', 1, 2000, 190, 200));
    const out = shrinkDmaIncrementality(dmas, media);
    const big = out.find((o) => o.dma === 'BIG')!;
    const small = out.find((o) => o.dma === 'SMALL')!;
    expect(small.shrinkageWeight).toBeLessThan(big.shrinkageWeight);
    expect(small.n).toBeLessThan(big.n);
    expect(small.credibleInterval.lower).toBeLessThanOrEqual(small.credibleInterval.point);
    expect(small.credibleInterval.upper).toBeGreaterThanOrEqual(small.credibleInterval.point);
  });
});

describe('applyExperimentReadout (feedback loop)', () => {
  const base: Recommendation = {
    id: 'r1', dma: 'D1', dmaName: 'City', region: 'West', service_line: 'Standard Oil Change',
    regime: 'Heat Wave', action: 'Test', confidence: 0.6, opportunityScore: 60,
    expectedRevenueLift: 5000, expectedMarginImpact: 2000, recommendedBudgetShift: 500,
    marginalRoas: 1.9, weatherShare: 0.4, riskFlags: [], rationale: '', topChannel: 'Meta',
    funnelFocus: 'MOF', urgency: 50,
  };

  it('increases confidence and upgrades action on a confirming significant result', () => {
    const out = applyExperimentReadout(base, { observedLift: 0.09, ciLower: 0.03, ciUpper: 0.15, isSignificant: true });
    expect(out.feedbackVerdict).toBe('confirmed');
    expect(out.confidence).toBeGreaterThan(base.confidence);
    expect(out.action).toBe('Act');
  });

  it('flips toward Suppress on a significant contradicting (negative) result', () => {
    const out = applyExperimentReadout(base, { observedLift: -0.08, ciLower: -0.14, ciUpper: -0.02, isSignificant: true });
    expect(out.feedbackVerdict).toBe('contradicted');
    expect(out.action).toBe('Suppress');
    expect(out.riskFlags).toContain('Model overridden by experiment evidence');
  });

  it('lowers confidence and stays cautious when inconclusive', () => {
    const actBase = { ...base, action: 'Act' as const, confidence: 0.7 };
    const out = applyExperimentReadout(actBase, { observedLift: 0.02, ciLower: -0.03, ciUpper: 0.07, isSignificant: false });
    expect(out.feedbackVerdict).toBe('inconclusive');
    expect(out.confidence).toBeLessThan(actBase.confidence);
    expect(out.action).toBe('Test');
  });
});
