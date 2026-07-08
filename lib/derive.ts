/**
 * Derivation layer: turns raw mock data + modeling functions into the aggregated,
 * client-ready datasets the pages render. Heavy work runs server-side; pages import
 * these and pass small derived objects to client components.
 */
import {
  generateDMAs,
  generateMedia,
  generateServiceObservations,
  generateWeatherForDMA,
  generateWeatherForecast,
  HISTORY_DAYS,
  SERVICE_LINES,
  SERVICE_LINE_BASE_REVENUE,
  CHANNEL_FUNNEL_MAP,
} from './mockData';
import {
  shrinkDmaIncrementality,
  type DmaIncrementalityResult,
} from './modeling/v3-bayesian';
import {
  syntheticControlEstimate,
  type SyntheticControlResult,
} from './modeling/v4-causal';
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
  CapacityStatus,
  Channel,
  DMA,
  DecompositionResult,
  Recommendation,
  ServiceLine,
  WeatherObservation,
} from './types';

const CATEGORY_BASE = SERVICE_LINE_BASE_REVENUE;

const CHANNEL_FUNNEL = CHANNEL_FUNNEL_MAP;

export interface DMASnapshot {
  dma: DMA;
  latestWeather: WeatherObservation;
  marketNorm: { temperature: number; precipitation: number };
  indoorIndex: number;
  // primary (highest-opportunity) service line for this DMA right now
  primaryServiceLine: ServiceLine;
  triggerIndex: number;
  capacityStatus: CapacityStatus; // service-network capacity headroom
  recommendation: Recommendation;
  decomposition: DecompositionResult;
  recommendations: Recommendation[]; // across service lines
}

/** Deterministic capacity status for a DMA given its density and current demand pressure. */
export function deriveCapacityStatus(dma: DMA, triggerIndex: number): CapacityStatus {
  const healthy = dma.locationDensity !== 'Low' && (dma.population + triggerIndex) % 11 !== 0;
  if (!healthy) return dma.locationDensity === 'Low' ? 'Maxed' : 'Constrained';
  if (triggerIndex > 75 && dma.locationDensity !== 'High') return 'Constrained';
  return 'Healthy';
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
  serviceLine: ServiceLine,
): { rec: Recommendation; decomp: DecompositionResult; trigger: number } {
  const anomaly = calculateWeatherAnomaly(
    { temperature: latest.temperature, precipitation: latest.precipitation },
    norm,
  );
  const trigger = calculateCategoryTriggerIndex(serviceLine, latest.regime, anomaly);
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
    categoryBase: CATEGORY_BASE[serviceLine],
    date: latest.date,
    locationCount: dma.locationCount,
  });
  // choose a representative channel for this service window — Search dominates BOF.
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
  // Capacity is a hard ceiling: DMAs with few locations relative to demand are more
  // likely to be constrained; a deterministic feature drives some variety too.
  const capacityHealthy = dma.locationDensity !== 'Low' && (dma.population + trigger) % 11 !== 0;
  const decomp = decomposeRevenue({
    baseline,
    triggerIndex: trigger,
    mediaIncrementality: mediaInc,
    interactionMultiplier: interaction,
    promoActive: false,
    promoDiscount: 0,
    capacityHealthy,
    seed: dma.population + trigger,
  });
  const { marginalRoas, confidence } = calculateMarginalROAS({
    spend,
    channel: topChannel,
    halfSaturation: halfSat,
    maxResponse: baseline * 0.4,
    interactionMultiplier: interaction,
  });
  const creativeReady = trigger > 40 && dma.baselineIndex > 95;
  const rec = generateRecommendation({
    dma,
    serviceLine,
    regime: latest.regime,
    decomposition: decomp,
    marginalRoas,
    confidence,
    capacityHealthy,
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
    const perCat = SERVICE_LINES.map((sl) => buildRecommendation(dma, latest, norm, sl));
    perCat.sort((a, b) => b.rec.opportunityScore - a.rec.opportunityScore);
    const top = perCat[0];
    return {
      dma,
      latestWeather: latest,
      marketNorm: norm,
      indoorIndex: indoor,
      primaryServiceLine: top.rec.service_line,
      triggerIndex: top.trigger,
      capacityStatus: deriveCapacityStatus(dma, top.trigger),
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

/** Build a time series of decomposition over the recent window for a DMA+service line. */
export function getDecompositionSeries(
  dma: DMA,
  serviceLine: ServiceLine,
  days = 60,
): (DecompositionResult & { date: string })[] {
  const weather = generateWeatherForDMA(dma, HISTORY_DAYS).slice(-days);
  const norm = marketNorm(generateWeatherForDMA(dma, HISTORY_DAYS));
  return weather.map((w) => {
    const { decomp } = buildRecommendation(dma, w, norm, serviceLine);
    return { ...decomp, date: w.date };
  });
}

export { generateWeatherForecast };

// ---------------------------------------------------------------------------
// V3: hierarchical (partially-pooled) per-DMA media incrementality + CIs.
// ---------------------------------------------------------------------------
let _shrunk: Map<string, DmaIncrementalityResult> | null = null;

export function getHierarchicalIncrementality(): Map<string, DmaIncrementalityResult> {
  if (_shrunk) return _shrunk;
  const dmas = generateDMAs();
  const media = generateMedia(dmas, HISTORY_DAYS);
  const results = shrinkDmaIncrementality(
    dmas.map((d) => ({ id: d.id, region: d.region })),
    media,
  );
  _shrunk = new Map(results.map((r) => [r.dma, r]));
  return _shrunk;
}

// ---------------------------------------------------------------------------
// V4: synthetic control for one DMA using same-region donors (real sales series).
// ---------------------------------------------------------------------------
export interface SyntheticControlView extends SyntheticControlResult {
  treatmentDma: string;
  treatmentName: string;
  serviceLine: ServiceLine;
  observed: number[];
  dates: string[];
  treatmentStartIndex: number;
}

/** Daily total-revenue series for a DMA (summed across service lines) over recent window. */
function dmaRevenueSeries(dmaId: string, days: number): { dates: string[]; series: number[] } {
  const sales = generateServiceObservations(generateDMAs(), HISTORY_DAYS).filter((s) => s.dma === dmaId);
  const byDate = new Map<string, number>();
  for (const s of sales) byDate.set(s.date, (byDate.get(s.date) ?? 0) + s.revenue);
  const dates = Array.from(byDate.keys()).sort().slice(-days);
  return { dates, series: dates.map((d) => byDate.get(d) ?? 0) };
}

export function getSyntheticControl(
  treatmentDmaId: string,
  serviceLine: ServiceLine = 'Standard Oil Change',
  days = 60,
): SyntheticControlView {
  const dmas = generateDMAs();
  const treatment = dmas.find((d) => d.id === treatmentDmaId) ?? dmas[0];
  const donorsDmas = dmas.filter((d) => d.region === treatment.region && d.id !== treatment.id);

  const t = dmaRevenueSeries(treatment.id, days);
  const donorSeries = donorsDmas
    .map((d) => ({ dma: d.id, name: d.name, series: dmaRevenueSeries(d.id, days).series }))
    .filter((d) => d.series.length === t.series.length);

  const treatmentStartIndex = Math.round(t.series.length * 0.7);
  const res = syntheticControlEstimate(
    t.series,
    donorSeries.map((d) => ({ dma: d.dma, series: d.series })),
    treatmentStartIndex,
  );

  // map donor names into weights for display
  const nameByDma = new Map(donorSeries.map((d) => [d.dma, d.name]));
  return {
    ...res,
    weights: res.weights.map((w) => ({ dma: nameByDma.get(w.dma) ?? w.dma, weight: w.weight })),
    treatmentDma: treatment.id,
    treatmentName: treatment.name,
    serviceLine,
    observed: t.series,
    dates: t.dates,
    treatmentStartIndex,
  };
}
