import { describe, it, expect } from 'vitest';
import {
  syntheticControlEstimate,
  projectToSimplex,
  automatedGeoExperimentDesign,
} from './v4-causal';
import { evaluateActivationGuardrails } from './v4-guardrails';
import type { DMA, Recommendation } from '../types';

describe('syntheticControlEstimate', () => {
  it('produces non-negative weights that sum to ~1', () => {
    const treatment = Array.from({ length: 40 }, (_, t) => 100 + t + Math.sin(t));
    const donors = [
      { dma: 'A', series: Array.from({ length: 40 }, (_, t) => 90 + t) },
      { dma: 'B', series: Array.from({ length: 40 }, (_, t) => 110 + t + Math.cos(t)) },
      { dma: 'C', series: Array.from({ length: 40 }, (_, t) => 50 + 0.5 * t) },
    ];
    const res = syntheticControlEstimate(treatment, donors, 30);
    const sum = res.weights.reduce((s, w) => s + w.weight, 0);
    expect(sum).toBeGreaterThan(0.95);
    expect(sum).toBeLessThan(1.05);
    for (const w of res.weights) expect(w.weight).toBeGreaterThanOrEqual(0);
  });

  it('reconstructs a known weighted combination of donors with low pre-RMSE', () => {
    const A = Array.from({ length: 50 }, (_, t) => 80 + t + Math.sin(t / 2) * 5);
    const B = Array.from({ length: 50 }, (_, t) => 120 - t * 0.3 + Math.cos(t / 3) * 4);
    const C = Array.from({ length: 50 }, (_, t) => 60 + Math.sin(t) * 8);
    // true treatment (pre) = 0.5 A + 0.3 B + 0.2 C
    const treatment = A.map((a, t) => 0.5 * a + 0.3 * B[t] + 0.2 * C[t]);
    const res = syntheticControlEstimate(treatment, [
      { dma: 'A', series: A },
      { dma: 'B', series: B },
      { dma: 'C', series: C },
    ], 40);
    const preMean = treatment.slice(0, 40).reduce((s, x) => s + x, 0) / 40;
    expect(res.preRmse / preMean).toBeLessThan(0.05); // <5% relative RMSE
    const wa = res.weights.find((w) => w.dma === 'A')!.weight;
    expect(wa).toBeGreaterThan(0.3); // recovers a dominant A weight
  });
});

describe('projectToSimplex', () => {
  it('projects onto the simplex (non-negative, sums to 1)', () => {
    const p = projectToSimplex([3, -1, 0.5, 2]);
    const sum = p.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 6);
    for (const x of p) expect(x).toBeGreaterThanOrEqual(0);
  });
});

describe('automatedGeoExperimentDesign', () => {
  function mkDma(id: string, region: DMA['region'], pop: number): DMA {
    return {
      id, name: id, region, population: pop, baselineIndex: 100, lat: 40, lon: -100,
      climate: { baseTempC: 15, seasonalAmplitude: 10, basePrecip: 2, snowProne: false, uvProne: true, airQualityRisk: 0.3 },
    };
  }
  function mkRec(dma: string, opp: number, mroas: number): Recommendation {
    return {
      id: dma, dma, dmaName: dma, region: 'West', product_category: 'Hydration', regime: 'Heat Wave',
      action: 'Test', confidence: 0.7, opportunityScore: opp, expectedRevenueLift: 1000,
      expectedMarginImpact: 400, recommendedBudgetShift: 100, marginalRoas: mroas, weatherShare: 0.3,
      riskFlags: [], rationale: '', topChannel: 'Meta', funnelFocus: 'MOF', urgency: 50,
    };
  }

  it('never reuses a DMA across clusters', () => {
    const dmas = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8'].map((id, i) =>
      mkDma(id, 'West', 1_000_000 + i * 100_000),
    );
    const recs = dmas.map((d, i) => mkRec(d.id, 90 - i, 2 - i * 0.1));
    const designs = automatedGeoExperimentDesign(dmas, recs, 3, {}, { controlsPerTreatment: 2 });
    const seen = new Set<string>();
    for (const d of designs) {
      for (const id of [...d.treatmentDmas, ...d.controlDmas]) {
        expect(seen.has(id)).toBe(false);
        seen.add(id);
      }
    }
    expect(designs.length).toBeGreaterThan(0);
  });
});

describe('evaluateActivationGuardrails', () => {
  const baseAction = { dma: 'D1', channel: 'Meta' as const, proposedSpendChange: 500, currentSpend: 1000 };

  it('blocks on out-of-stock + increasing spend', () => {
    const res = evaluateActivationGuardrails(baseAction, {
      inventoryStatus: 'Out of Stock', creativeReadiness: true,
      marginalRoasCI: { point: 2, lower: 1.5, upper: 2.5 }, riskTolerance: 'Balanced',
    });
    expect(res.approved).toBe(false);
    expect(res.blockedReasons.join(' ')).toMatch(/Out of Stock/);
  });

  it('blocks when CI lower bound is below breakeven', () => {
    const res = evaluateActivationGuardrails(baseAction, {
      inventoryStatus: 'Healthy', creativeReadiness: true,
      marginalRoasCI: { point: 1.1, lower: 0.7, upper: 1.5 }, riskTolerance: 'Balanced',
    });
    expect(res.approved).toBe(false);
    expect(res.blockedReasons.join(' ')).toMatch(/breakeven/);
  });

  it('approves a clean case', () => {
    const res = evaluateActivationGuardrails(
      { dma: 'D1', channel: 'Meta', proposedSpendChange: 200, currentSpend: 2000 },
      {
        inventoryStatus: 'Healthy', creativeReadiness: true,
        marginalRoasCI: { point: 2.5, lower: 1.8, upper: 3.2 }, riskTolerance: 'Balanced',
      },
    );
    expect(res.approved).toBe(true);
    expect(res.blockedReasons).toHaveLength(0);
  });
});
