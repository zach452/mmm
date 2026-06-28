/**
 * Derivation layer: turns raw mock data + modeling functions into the aggregated,
 * client-ready datasets the pages render. Heavy work runs server-side; pages import
 * these and pass small derived objects to client components.
 */
import {
  generateDMAs,
  generateWeatherForDMA,
  generateWeatherForecast,
  HISTORY_DAYS,
  PRODUCT_CATEGORIES,
} from './mockData';
import {
  calculateCategoryTriggerIndex,
  calculateIndoorBehaviorIndex,
  calculateMarginalROAS,
  calculateWeatherAnomaly,
  decomposeRevenue,
  estimateBaselineDemand,
  estimateMediaIncrementality,
  estimateWeatherMediaInteraction,
  generateRecommendation,
} from './modeling';
import {
  Channel,
  DMA,
  DecompositionResult,
  ProductCategory,
  Recommendation,
  WeatherObservation,
} from './types';

const CATEGORY_BASE: Record<ProductCategory, number> = {
  'At-Home Beauty': 42000,
  Outerwear: 38000,
  Footwear: 35000,
  Hydration: 28000,
  'Baby Care': 30000,
  Wellness: 33000,
};

const CHANNEL_FUNNEL: Record<Channel, import('./types').FunnelStage> = {
  Meta: 'MOF',
  'Google Search': 'BOF',
  TikTok: 'TOF',
  YouTube: 'TOF',
  CTV: 'TOF',
  Pinterest: 'MOF',
  'Amazon/RMN': 'BOF',
};

export interface DMASnapshot {
  dma: DMA;
  latestWeather: WeatherObservation;
  marketNorm: { temperature: number; precipitation: number };
  indoorIndex: number;
  // primary (highest-opportunity) category for this DMA right now
  primaryCategory: ProductCategory;
  triggerIndex: number;
  recommendation: Recommendation;
  decomposition: DecompositionResult;
  recommendations: Recommendation[]; // across categories
}

function marketNorm(weather: WeatherObservation[]): { temperature: number; precipitation: number } {
  const n = weather.length;
  const t = weather.reduce((s, w) => s + w.temperature, 0) / n;
  const p = weather.reduce((s, w) => s + w.precipitation, 0) / n;
  return { temperature: Math.round(t * 10) / 10, precipitation: Math.round(p * 10) / 10 };
}

function buildRecommendation(
  dma: DMA,
  latest: WeatherObservation,
  norm: { temperature: number; precipitation: number },
  category: ProductCategory,
): { rec: Recommendation; decomp: DecompositionResult; trigger: number } {
  const anomaly = calculateWeatherAnomaly(
    { temperature: latest.temperature, precipitation: latest.precipitation },
    norm,
  );
  const trigger = calculateCategoryTriggerIndex(category, latest.regime, anomaly);
  const indoor = calculateIndoorBehaviorIndex({
    temperature: latest.temperature,
    precipitation: latest.precipitation,
    snow: latest.snow,
    uv_index: latest.uv_index,
    air_quality: latest.air_quality,
    severe: latest.severe_weather_flag,
  });
  const baseline = estimateBaselineDemand({
    baselineIndex: dma.baselineIndex,
    population: dma.population,
    categoryBase: CATEGORY_BASE[category],
  });
  // choose a representative channel for this category window
  const topChannel: Channel = trigger > 60 ? 'Google Search' : 'Meta';
  const funnelFocus = CHANNEL_FUNNEL[topChannel];
  const interaction = estimateWeatherMediaInteraction({
    regime: latest.regime,
    channel: topChannel,
    funnel: funnelFocus,
    triggerIndex: trigger,
  });
  const spend = Math.round((dma.population / 2_000_000) * 4000);
  const halfSat = spend * 1.1;
  const mediaInc = estimateMediaIncrementality({
    spend,
    channel: topChannel,
    halfSaturation: halfSat,
    maxResponse: baseline * 0.4,
  });
  const decomp = decomposeRevenue({
    baseline,
    triggerIndex: trigger,
    mediaIncrementality: mediaInc,
    interactionMultiplier: interaction,
    promoActive: false,
    promoDiscount: 0,
    inventoryHealthy: true,
    seed: dma.population + trigger,
  });
  const { marginalRoas, confidence } = calculateMarginalROAS({
    spend,
    channel: topChannel,
    halfSaturation: halfSat,
    maxResponse: baseline * 0.4,
    interactionMultiplier: interaction,
  });
  // inject some variety in readiness based on deterministic features
  const inventoryHealthy = (dma.population + trigger) % 11 !== 0;
  const creativeReady = trigger > 40 && dma.baselineIndex > 95;
  const rec = generateRecommendation({
    dma,
    category,
    regime: latest.regime,
    decomposition: decomp,
    marginalRoas,
    confidence,
    inventoryHealthy,
    creativeReady,
    topChannel,
    funnelFocus,
  });
  void indoor;
  return { rec, decomp, trigger };
}

let _snapshots: DMASnapshot[] | null = null;

export function getDMASnapshots(): DMASnapshot[] {
  if (_snapshots) return _snapshots;
  const dmas = generateDMAs();
  const snapshots: DMASnapshot[] = dmas.map((dma) => {
    const weather = generateWeatherForDMA(dma, HISTORY_DAYS);
    const latest = weather[weather.length - 1];
    const norm = marketNorm(weather);
    const indoor = calculateIndoorBehaviorIndex({
      temperature: latest.temperature,
      precipitation: latest.precipitation,
      snow: latest.snow,
      uv_index: latest.uv_index,
      air_quality: latest.air_quality,
      severe: latest.severe_weather_flag,
    });
    const perCat = PRODUCT_CATEGORIES.map((cat) => buildRecommendation(dma, latest, norm, cat));
    perCat.sort((a, b) => b.rec.opportunityScore - a.rec.opportunityScore);
    const top = perCat[0];
    return {
      dma,
      latestWeather: latest,
      marketNorm: norm,
      indoorIndex: indoor,
      primaryCategory: top.rec.product_category,
      triggerIndex: top.trigger,
      recommendation: top.rec,
      decomposition: top.decomp,
      recommendations: perCat.map((p) => p.rec),
    };
  });
  _snapshots = snapshots;
  return snapshots;
}

export function getAllRecommendations(): Recommendation[] {
  return getDMASnapshots()
    .map((s) => s.recommendation)
    .sort((a, b) => b.opportunityScore - a.opportunityScore);
}

/** Recent revenue level per DMA (for matched-market features). */
export function getRecentDemandByDMA(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of getDMASnapshots()) {
    out[s.dma.id] = s.decomposition.observed;
  }
  return out;
}

/** Build a time series of decomposition over the recent window for a DMA+category. */
export function getDecompositionSeries(
  dma: DMA,
  category: ProductCategory,
  days = 60,
): (DecompositionResult & { date: string })[] {
  const weather = generateWeatherForDMA(dma, HISTORY_DAYS).slice(-days);
  const norm = marketNorm(generateWeatherForDMA(dma, HISTORY_DAYS));
  return weather.map((w) => {
    const { decomp } = buildRecommendation(dma, w, norm, category);
    return { ...decomp, date: w.date };
  });
}

export { generateWeatherForecast };
