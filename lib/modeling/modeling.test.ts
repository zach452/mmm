import { describe, it, expect } from 'vitest';
import {
  calculateWeatherAnomaly,
  calculateIndoorBehaviorIndex,
  calculateCategoryTriggerIndex,
  calculateWeatherFrictionIndex,
  calculateAdstock,
  hillSaturation,
  estimateMediaIncrementality,
  estimateWeatherMediaInteraction,
  decomposeRevenue,
  calculateMarginalROAS,
  generateRecommendation,
  optimizeBudget,
  selectMatchedMarkets,
} from './index';
import { DMA } from '../types';

describe('weather indices', () => {
  it('anomaly computes signed deltas and bounded severity', () => {
    const a = calculateWeatherAnomaly({ temperature: 30, precipitation: 0 }, { temperature: 20, precipitation: 2 });
    expect(a.tempAnomaly).toBeCloseTo(10);
    expect(a.severity).toBeGreaterThan(0);
    expect(a.severity).toBeLessThanOrEqual(100);
  });

  it('indoor index rises with bad weather and stays 0-100', () => {
    const mild = calculateIndoorBehaviorIndex({ temperature: 20, precipitation: 0, snow: 0, uv_index: 4, air_quality: 40, severe: false });
    const harsh = calculateIndoorBehaviorIndex({ temperature: -5, precipitation: 20, snow: 10, uv_index: 1, air_quality: 160, severe: true });
    expect(harsh).toBeGreaterThan(mild);
    expect(mild).toBeGreaterThanOrEqual(0);
    expect(harsh).toBeLessThanOrEqual(100);
  });

  it('service trigger reflects regime relevance', () => {
    const synthCold = calculateCategoryTriggerIndex('Synthetic Oil Change', 'Cold Snap', { tempAnomaly: -10 });
    const synthHeat = calculateCategoryTriggerIndex('Synthetic Oil Change', 'Heat Wave', { tempAnomaly: 10 });
    expect(synthCold).toBeGreaterThan(synthHeat);
  });

  it('friction index increases with snow/severe', () => {
    const f = calculateWeatherFrictionIndex({ precipitation: 0, snow: 8, severe: true, capacityHealthy: false });
    expect(f).toBeGreaterThan(50);
    expect(f).toBeLessThanOrEqual(100);
  });
});

describe('media response', () => {
  it('hill saturation is monotonic and bounded 0-1', () => {
    const lo = hillSaturation(100, 500, 1.3);
    const hi = hillSaturation(2000, 500, 1.3);
    expect(hi).toBeGreaterThan(lo);
    expect(hi).toBeLessThan(1);
    expect(lo).toBeGreaterThan(0);
  });

  it('adstock of constant spend exceeds the instantaneous value', () => {
    const v = calculateAdstock(1000, 'CTV');
    expect(v).toBeGreaterThan(1000);
  });

  it('incrementality grows with spend but saturates', () => {
    const a = estimateMediaIncrementality({ spend: 1000, channel: 'Meta', halfSaturation: 2000, maxResponse: 50000 });
    const b = estimateMediaIncrementality({ spend: 8000, channel: 'Meta', halfSaturation: 2000, maxResponse: 50000 });
    expect(b).toBeGreaterThan(a);
    expect(b).toBeLessThanOrEqual(50000);
  });

  it('weather-media interaction stays in 0.7-1.6 band', () => {
    const m = estimateWeatherMediaInteraction({ regime: 'Heat Wave', channel: 'Google Search', funnel: 'BOF', triggerIndex: 85 });
    expect(m).toBeGreaterThanOrEqual(0.7);
    expect(m).toBeLessThanOrEqual(1.6);
  });

  it('marginal ROAS is positive and declines with spend', () => {
    const low = calculateMarginalROAS({ spend: 500, channel: 'Meta', halfSaturation: 2000, maxResponse: 50000 });
    const high = calculateMarginalROAS({ spend: 9000, channel: 'Meta', halfSaturation: 2000, maxResponse: 50000 });
    expect(low.marginalRoas).toBeGreaterThan(high.marginalRoas);
    expect(high.confidence).toBeGreaterThan(0);
  });
});

describe('decomposition and recommendation', () => {
  it('decomposition components sum to observed', () => {
    const d = decomposeRevenue({ baseline: 10000, triggerIndex: 70, mediaIncrementality: 3000, interactionMultiplier: 1.2, promoActive: true, promoDiscount: 0.2, capacityHealthy: true, seed: 5 });
    const sum = d.baseline + d.weatherLift + d.mediaLift + d.interactionLift + d.promoLift + d.capacityEffect + d.seasonality + d.noise;
    expect(sum).toBe(d.observed);
  });

  it('recommendation returns Ignore when lift is mostly weather and mROAS low', () => {
    const dma: DMA = makeDma();
    const d = decomposeRevenue({ baseline: 10000, triggerIndex: 95, mediaIncrementality: 200, interactionMultiplier: 1.0, promoActive: false, promoDiscount: 0, capacityHealthy: true, seed: 1 });
    const rec = generateRecommendation({ dma, serviceLine: 'Cooling System', regime: 'Heat Wave', decomposition: d, marginalRoas: 0.8, confidence: 0.7, capacityHealthy: true, creativeReady: true, topChannel: 'Meta', funnelFocus: 'MOF' });
    expect(['Ignore', 'Monitor']).toContain(rec.action);
    expect(rec.weatherShare).toBeGreaterThan(0.5);
  });

  it('recommendation returns Suppress when capacity is maxed', () => {
    const dma = makeDma();
    const d = decomposeRevenue({ baseline: 10000, triggerIndex: 60, mediaIncrementality: 3000, interactionMultiplier: 1.2, promoActive: false, promoDiscount: 0, capacityHealthy: false, seed: 2 });
    const rec = generateRecommendation({ dma, serviceLine: 'Synthetic Oil Change', regime: 'Cold Snap', decomposition: d, marginalRoas: 2.5, confidence: 0.8, capacityHealthy: false, creativeReady: true, topChannel: 'Google Search', funnelFocus: 'BOF' });
    expect(rec.action).toBe('Suppress');
  });
});

describe('optimizer and matching', () => {
  it('optimizer allocates the pool without breaching max spend', () => {
    const opps = [1, 2].map((i) => ({
      dma: `DMA-00${i}`, dmaName: `City ${i}`, region: 'West' as const, channel: 'Meta' as const,
      currentSpend: 1000, halfSaturation: 1500, maxResponse: 40000, slope: 1.3, interactionMultiplier: 1.1,
      minSpend: 800, maxSpend: 3000,
    }));
    const rows = optimizeBudget(2000, opps, {});
    for (const r of rows) {
      expect(r.recommendedSpend).toBeLessThanOrEqual(3000 + 1);
      expect(r.recommendedSpend).toBeGreaterThanOrEqual(800 - 1);
    }
  });

  it('matched markets rank an identical-ish DMA highest', () => {
    const treatment = makeDma('DMA-001', 'West', 2_000_000, 100, 17);
    const twin = makeDma('DMA-002', 'West', 2_050_000, 101, 17.2);
    const far = makeDma('DMA-003', 'Northeast', 300_000, 80, 5);
    const matches = selectMatchedMarkets(treatment, [treatment, twin, far], { recentDemand: {} });
    expect(matches[0].dma).toBe('DMA-002');
    expect(matches[0].similarity).toBeGreaterThan(matches[1].similarity);
  });
});

function makeDma(id = 'DMA-001', region: DMA['region'] = 'West', population = 2_000_000, baselineIndex = 100, baseTempC = 17): DMA {
  return {
    id, name: id, region, population, baselineIndex, lat: 40, lon: -100,
    locationCount: 12, locationDensity: 'Medium',
    climate: { baseTempC, seasonalAmplitude: 10, basePrecip: 2, snowProne: false, uvProne: true, airQualityRisk: 0.3 },
  };
}
