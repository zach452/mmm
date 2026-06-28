/**
 * Geo Demand Engine — modeling core.
 *
 * SIMPLIFICATION NOTE: These are deterministic, interpretable heuristic models that
 * stand in for a future true Bayesian/hierarchical MMM. Every function here is a
 * transparent approximation chosen so the demo behaves sensibly and is fully
 * inspectable. Where a real causal/Bayesian model would live, this is flagged.
 */
import {
  Action,
  Channel,
  DecompositionResult,
  DMA,
  FunnelStage,
  MatchedMarket,
  ProductCategory,
  Recommendation,
  WeatherRegime,
} from '../types';
import { categoryWeatherMultiplier } from '../mockData';

// ---------------------------------------------------------------------------
// 1. Weather anomaly
// ---------------------------------------------------------------------------
export function calculateWeatherAnomaly(
  current: { temperature: number; precipitation: number },
  marketNorm: { temperature: number; precipitation: number },
): { tempAnomaly: number; precipAnomaly: number; severity: number } {
  const tempAnomaly = current.temperature - marketNorm.temperature;
  const precipAnomaly = current.precipitation - marketNorm.precipitation;
  // severity 0-100 combining magnitude of both anomalies
  const severity = Math.min(
    100,
    Math.round(Math.abs(tempAnomaly) * 5 + Math.abs(precipAnomaly) * 3),
  );
  return { tempAnomaly: round1(tempAnomaly), precipAnomaly: round1(precipAnomaly), severity };
}

// ---------------------------------------------------------------------------
// 2. Indoor Behavior Index (0-100): how much weather pushes people indoors
// ---------------------------------------------------------------------------
export function calculateIndoorBehaviorIndex(inputs: {
  temperature: number;
  precipitation: number;
  snow: number;
  uv_index: number;
  air_quality: number;
  severe: boolean;
}): number {
  let score = 20;
  if (inputs.temperature < 2) score += 25;
  else if (inputs.temperature < 8) score += 12;
  if (inputs.temperature > 33) score += 22;
  score += Math.min(25, inputs.precipitation * 2);
  score += Math.min(20, inputs.snow * 3);
  if (inputs.air_quality > 120) score += 20;
  if (inputs.uv_index >= 9) score += 8;
  if (inputs.severe) score += 25;
  return clamp(Math.round(score), 0, 100);
}

// ---------------------------------------------------------------------------
// 3. Category Trigger Index (0-100): weather-driven category relevance
// ---------------------------------------------------------------------------
export function calculateCategoryTriggerIndex(
  category: ProductCategory,
  regime: WeatherRegime,
  anomaly: { tempAnomaly: number },
): number {
  const mult = categoryWeatherMultiplier(category, regime, anomaly.tempAnomaly);
  // map multiplier (~0.5-1.9) to 0-100, where 1.0 -> 50
  return clamp(Math.round((mult - 0.5) * (100 / 1.4)), 0, 100);
}

// ---------------------------------------------------------------------------
// 4. Weather Friction Index (0-100): friction to purchase / fulfillment
// ---------------------------------------------------------------------------
export function calculateWeatherFrictionIndex(inputs: {
  precipitation: number;
  snow: number;
  severe: boolean;
  inventoryHealthy: boolean;
}): number {
  let score = 5;
  score += Math.min(35, inputs.precipitation * 2.5);
  score += Math.min(40, inputs.snow * 5);
  if (inputs.severe) score += 30;
  if (!inputs.inventoryHealthy) score += 25;
  return clamp(Math.round(score), 0, 100);
}

// ---------------------------------------------------------------------------
// 5. Adstock (geometric decay, channel-specific)
// ---------------------------------------------------------------------------
const CHANNEL_DECAY: Record<Channel, number> = {
  Meta: 0.5,
  'Google Search': 0.2,
  TikTok: 0.45,
  YouTube: 0.6,
  CTV: 0.7,
  Pinterest: 0.5,
  'Amazon/RMN': 0.3,
};

export function calculateAdstock(
  seriesOrValue: number | number[],
  channel: Channel,
  lagDays = 7,
): number {
  const decay = CHANNEL_DECAY[channel] ?? 0.5;
  if (typeof seriesOrValue === 'number') {
    // steady-state adstock of a constant spend: x / (1 - decay)
    return seriesOrValue / (1 - decay);
  }
  let stock = 0;
  const series = seriesOrValue;
  const start = Math.max(0, series.length - lagDays - 1);
  for (let i = start; i < series.length; i++) {
    stock = series[i] + decay * stock;
  }
  return stock;
}

// ---------------------------------------------------------------------------
// 6. Hill saturation transform
// ---------------------------------------------------------------------------
export function hillSaturation(spend: number, halfSaturation: number, slope: number): number {
  if (spend <= 0) return 0;
  const xs = Math.pow(spend, slope);
  return xs / (xs + Math.pow(halfSaturation, slope));
}

// ---------------------------------------------------------------------------
// 7. Baseline demand
// ---------------------------------------------------------------------------
export function estimateBaselineDemand(inputs: {
  baselineIndex: number;
  population: number;
  categoryBase: number;
}): number {
  const popFactor = inputs.population / 2_000_000;
  return Math.round(inputs.categoryBase * popFactor * (inputs.baselineIndex / 100));
}

// ---------------------------------------------------------------------------
// 8. Media incrementality (adstock + saturation)
// ---------------------------------------------------------------------------
export function estimateMediaIncrementality(inputs: {
  spend: number;
  channel: Channel;
  halfSaturation: number;
  slope?: number;
  maxResponse: number;
}): number {
  const adstocked = calculateAdstock(inputs.spend, inputs.channel);
  const sat = hillSaturation(adstocked, inputs.halfSaturation, inputs.slope ?? 1.3);
  return inputs.maxResponse * sat;
}

// ---------------------------------------------------------------------------
// 9. Weather x media interaction multiplier (~0.7 - 1.6)
// ---------------------------------------------------------------------------
const REGIME_MEDIA_BIAS: Partial<Record<WeatherRegime, number>> = {
  'Heat Wave': 0.15,
  'Cold Snap': 0.18,
  'First Cold Snap': 0.22,
  'First Warm Weekend': 0.2,
  'Rainy Weekend': 0.12,
  'Snow Event': 0.1,
  'Poor Air Quality': 0.14,
  'Severe Storm': -0.25,
  'High UV': 0.08,
  Normal: 0,
};

export function estimateWeatherMediaInteraction(inputs: {
  regime: WeatherRegime;
  channel: Channel;
  funnel: FunnelStage;
  triggerIndex: number; // 0-100
}): number {
  let m = 1 + (REGIME_MEDIA_BIAS[inputs.regime] ?? 0);
  // higher category relevance amplifies media efficiency
  m += ((inputs.triggerIndex - 50) / 100) * 0.4;
  // funnel timing: during high-relevance windows, BOF/Search converts better
  if (inputs.funnel === 'BOF') m += 0.08;
  if (inputs.funnel === 'TOF' && inputs.triggerIndex > 65) m += 0.05;
  // severe storm suppresses paid efficiency regardless of channel
  return clamp(round2(m), 0.7, 1.6);
}

// ---------------------------------------------------------------------------
// 10. Revenue decomposition
// ---------------------------------------------------------------------------
export function decomposeRevenue(inputs: {
  baseline: number;
  triggerIndex: number; // 0-100
  mediaIncrementality: number;
  interactionMultiplier: number;
  promoActive: boolean;
  promoDiscount: number;
  inventoryHealthy: boolean;
  seed?: number;
}): DecompositionResult {
  const baseline = inputs.baseline;
  // weather lift: trigger index above/below neutral scales baseline
  const weatherLift = Math.round(baseline * ((inputs.triggerIndex - 50) / 100) * 0.6);
  const mediaLift = Math.round(inputs.mediaIncrementality);
  const interactionLift = Math.round(mediaLift * (inputs.interactionMultiplier - 1));
  const promoLift = inputs.promoActive ? Math.round(baseline * inputs.promoDiscount * 0.8) : 0;
  const inventoryEffect = inputs.inventoryHealthy ? 0 : -Math.round(baseline * 0.12);
  const seasonality = Math.round(baseline * 0.05);
  const noiseRng = (Math.sin((inputs.seed ?? 1) * 12.9898) * 43758.5453) % 1;
  const noise = Math.round(baseline * 0.03 * (noiseRng - 0.5) * 2);
  const observed =
    baseline + weatherLift + mediaLift + interactionLift + promoLift + inventoryEffect + seasonality + noise;
  return {
    baseline,
    weatherLift,
    mediaLift,
    interactionLift,
    promoLift,
    inventoryEffect,
    seasonality,
    noise,
    observed,
  };
}

// ---------------------------------------------------------------------------
// 11. Marginal ROAS (derivative of Hill curve at current spend)
// ---------------------------------------------------------------------------
export function calculateMarginalROAS(inputs: {
  spend: number;
  channel: Channel;
  halfSaturation: number;
  slope?: number;
  maxResponse: number;
  interactionMultiplier?: number;
}): { marginalRoas: number; confidence: number } {
  const slope = inputs.slope ?? 1.3;
  const interaction = inputs.interactionMultiplier ?? 1;
  const x = Math.max(1, calculateAdstock(inputs.spend, inputs.channel));
  const h = inputs.halfSaturation;
  // d/dx of Hill: slope * h^slope * x^(slope-1) / (x^slope + h^slope)^2
  const hs = Math.pow(h, slope);
  const xs = Math.pow(x, slope);
  const dResponse = (slope * hs * Math.pow(x, slope - 1)) / Math.pow(xs + hs, 2);
  // marginal revenue per $ = maxResponse * dResponse * interaction
  const marginalRoas = round2(inputs.maxResponse * dResponse * interaction);
  // confidence falls as we move deep into saturation
  const satLevel = hillSaturation(x, h, slope);
  const confidence = round2(clamp(1 - Math.abs(satLevel - 0.5) * 0.8, 0.4, 0.95));
  return { marginalRoas, confidence };
}

// ---------------------------------------------------------------------------
// 12. Recommendation engine (can say don't act)
// ---------------------------------------------------------------------------
export function generateRecommendation(inputs: {
  dma: DMA;
  category: ProductCategory;
  regime: WeatherRegime;
  decomposition: DecompositionResult;
  marginalRoas: number;
  confidence: number;
  inventoryHealthy: boolean;
  creativeReady: boolean;
  topChannel: Channel;
  funnelFocus: FunnelStage;
}): Recommendation {
  const { decomposition: d } = inputs;
  const totalLift = d.weatherLift + d.mediaLift + d.interactionLift;
  const weatherShare = totalLift > 0 ? clamp(d.weatherLift / totalLift, 0, 1) : 0;
  const riskFlags: string[] = [];
  if (!inputs.inventoryHealthy) riskFlags.push('Inventory constrained');
  if (!inputs.creativeReady) riskFlags.push('Creative not ready');
  if (inputs.confidence < 0.55) riskFlags.push('Low model confidence');
  if (weatherShare > 0.65) riskFlags.push('Lift mostly weather-driven (low media causality)');
  if (inputs.regime === 'Severe Storm') riskFlags.push('Severe weather suppresses fulfillment');

  const opportunityScore = clamp(
    Math.round(
      (totalLift / Math.max(1, d.baseline)) * 120 +
        inputs.marginalRoas * 8 +
        (1 - weatherShare) * 20,
    ),
    0,
    100,
  );

  // Action logic — deliberately not always "Act"
  let action: Action = 'Monitor';
  if (inputs.regime === 'Severe Storm' || !inputs.inventoryHealthy) {
    action = 'Suppress';
  } else if (weatherShare > 0.7 && inputs.marginalRoas < 1.2) {
    // demand would happen anyway; don't waste incremental media
    action = 'Ignore';
  } else if (inputs.marginalRoas >= 1.8 && inputs.confidence >= 0.6 && opportunityScore >= 55) {
    action = inputs.creativeReady ? 'Act' : 'Test';
  } else if (inputs.marginalRoas >= 1.2 && opportunityScore >= 35) {
    action = inputs.confidence >= 0.6 ? 'Test' : 'Monitor';
  } else {
    action = 'Monitor';
  }

  const recommendedBudgetShift =
    action === 'Act' ? Math.round(d.mediaLift * 0.25) : action === 'Test' ? Math.round(d.mediaLift * 0.1) : 0;

  const urgency = clamp(
    Math.round(
      opportunityScore * 0.6 +
        (inputs.regime.includes('First') ? 25 : 0) +
        (inputs.regime === 'Heat Wave' || inputs.regime === 'Cold Snap' ? 15 : 0),
    ),
    0,
    100,
  );

  const rationale = buildRationale(action, weatherShare, inputs.marginalRoas, inputs.regime, inputs.category);

  return {
    id: `${inputs.dma.id}-${inputs.category}`,
    dma: inputs.dma.id,
    dmaName: inputs.dma.name,
    region: inputs.dma.region,
    product_category: inputs.category,
    regime: inputs.regime,
    action,
    confidence: inputs.confidence,
    opportunityScore,
    expectedRevenueLift: totalLift,
    expectedMarginImpact: Math.round(totalLift * 0.42),
    recommendedBudgetShift,
    marginalRoas: inputs.marginalRoas,
    weatherShare: round2(weatherShare),
    riskFlags,
    rationale,
    topChannel: inputs.topChannel,
    funnelFocus: inputs.funnelFocus,
    urgency,
  };
}

function buildRationale(
  action: Action,
  weatherShare: number,
  mroas: number,
  regime: WeatherRegime,
  category: ProductCategory,
): string {
  const ws = Math.round(weatherShare * 100);
  switch (action) {
    case 'Act':
      return `${regime} is driving strong, media-responsive ${category} demand (mROAS ${mroas.toFixed(2)}). Weather explains ${ws}% of lift, leaving real incremental headroom for paid. Lean in now.`;
    case 'Test':
      return `Promising ${category} signal under ${regime}, but confidence or creative readiness warrants a controlled geo lift test before scaling spend.`;
    case 'Ignore':
      return `${ws}% of the ${category} lift is weather-driven demand that would convert regardless of media (mROAS ${mroas.toFixed(2)}). Adding spend mostly subsidizes organic demand — hold paid.`;
    case 'Suppress':
      return `${regime} / fulfillment constraints make this a poor window for paid acquisition. Pull back spend to protect efficiency and CX.`;
    default:
      return `Weak or uncertain ${category} signal under ${regime}. Keep monitoring; no action yet.`;
  }
}

// ---------------------------------------------------------------------------
// 13. Budget optimizer (greedy marginal allocation)
// ---------------------------------------------------------------------------
export interface OptimizerOpportunity {
  dma: string;
  dmaName: string;
  region: DMA['region'];
  channel: Channel;
  currentSpend: number;
  halfSaturation: number;
  maxResponse: number;
  slope: number;
  interactionMultiplier: number;
  minSpend: number;
  maxSpend: number;
}

export function optimizeBudget(
  pool: number,
  opportunities: OptimizerOpportunity[],
  constraints: { stepSize?: number },
): import('../types').AllocationRow[] {
  const step = constraints.stepSize ?? Math.max(250, Math.round(pool / 200));
  // Start every opportunity at its current spend (clamped to min).
  const alloc = opportunities.map((o) => ({
    o,
    spend: Math.max(o.minSpend, o.currentSpend),
  }));

  // Pool of marginal dollars to (re)allocate.
  let remaining = pool;
  let guard = 0;
  while (remaining >= step && guard < 100000) {
    guard++;
    let best = -1;
    let bestM = -Infinity;
    for (let i = 0; i < alloc.length; i++) {
      const a = alloc[i];
      if (a.spend + step > a.o.maxSpend) continue;
      const m = marginalAt(a.o, a.spend);
      if (m > bestM) {
        bestM = m;
        best = i;
      }
    }
    if (best < 0 || bestM <= 0) break;
    alloc[best].spend += step;
    remaining -= step;
  }

  return alloc.map((a) => {
    const sat = hillSaturation(
      calculateAdstock(a.spend, a.o.channel),
      a.o.halfSaturation,
      a.o.slope,
    );
    const mroas = marginalAt(a.o, a.spend);
    const expectedRevenue = Math.round(
      a.o.maxResponse * sat * a.o.interactionMultiplier,
    );
    const delta = a.spend - a.o.currentSpend;
    let action: Action = 'Monitor';
    if (delta > step) action = 'Act';
    else if (delta < -step) action = 'Suppress';
    else if (mroas > 1.5) action = 'Test';
    return {
      dma: a.o.dma,
      dmaName: a.o.dmaName,
      channel: a.o.channel,
      region: a.o.region,
      currentSpend: Math.round(a.o.currentSpend),
      recommendedSpend: Math.round(a.spend),
      delta: Math.round(delta),
      marginalRoas: mroas,
      expectedRevenue,
      saturationFlag: sat > 0.75,
      action,
    };
  });
}

function marginalAt(o: OptimizerOpportunity, spend: number): number {
  return calculateMarginalROAS({
    spend,
    channel: o.channel,
    halfSaturation: o.halfSaturation,
    slope: o.slope,
    maxResponse: o.maxResponse,
    interactionMultiplier: o.interactionMultiplier,
  }).marginalRoas;
}

// ---------------------------------------------------------------------------
// 14. Creative brief generator
// ---------------------------------------------------------------------------
const ANGLE_BY_REGIME: Record<WeatherRegime, string> = {
  'Cold Snap': 'Cold snap urgency',
  'First Cold Snap': 'Seasonal transition',
  'Heat Wave': 'Heat relief',
  'Rainy Weekend': 'Rainy-day comfort',
  'Snow Event': 'Indoor day / stay-home',
  'High UV': 'UV protection',
  'Poor Air Quality': 'Family-at-home',
  'Severe Storm': 'Retail availability',
  'First Warm Weekend': 'Seasonal transition',
  Normal: 'Product education',
};

export function generateCreativeBrief(inputs: {
  dma: DMA;
  regime: WeatherRegime;
  category: ProductCategory;
  indoorIndex: number;
}): import('../types').CreativeBrief {
  const angle = ANGLE_BY_REGIME[inputs.regime] ?? 'Product education';
  const indoor = inputs.indoorIndex > 55;
  const hooks = [
    `${inputs.regime} just hit ${inputs.dma.name} — here's what people are reaching for`,
    `When the weather turns, ${inputs.category} sells itself`,
    indoor ? `Stuck inside? Make it count.` : `Get ahead of the forecast`,
  ];
  return {
    id: `BRIEF-${inputs.dma.id}-${inputs.category}`,
    dma: inputs.dma.id,
    dmaName: inputs.dma.name,
    region: inputs.dma.region,
    regime: inputs.regime,
    product_category: inputs.category,
    weatherContext: `${inputs.regime} conditions in ${inputs.dma.name} (${inputs.dma.region}). Indoor Behavior Index ${inputs.indoorIndex}.`,
    consumerMindset: indoor
      ? 'Home-bound, browsing on mobile, receptive to comfort and convenience messaging.'
      : 'Active and forward-planning; receptive to urgency and preparedness messaging.',
    messageAngle: angle,
    hooks,
    cta: indoor ? 'Shop from the couch' : 'Beat the forecast',
    landingPageRec: `${inputs.category} weather-collection PDP with local availability badge`,
    channelGuidance: [
      { channel: 'Meta', funnel: 'MOF', note: 'Dynamic product ads with weather-themed creative' },
      { channel: 'Google Search', funnel: 'BOF', note: 'Bid up category + "near me" terms during the window' },
      { channel: 'TikTok', funnel: 'TOF', note: indoor ? 'UGC indoor-use content' : 'Trend-led seasonal content' },
    ],
    measurementPlan: 'Geo holdout vs matched control; read incremental revenue and new-customer rate over the weather window + 7-day tail.',
    format: indoor ? 'UGC' : 'Video',
  };
}

// ---------------------------------------------------------------------------
// 15. Matched market selection (weighted Euclidean similarity)
// ---------------------------------------------------------------------------
export function selectMatchedMarkets(
  treatmentDma: DMA,
  allDmas: DMA[],
  features: { recentDemand: Record<string, number> },
): MatchedMarket[] {
  const regionCode = (r: DMA['region']) =>
    ['Northeast', 'Midwest', 'South', 'West', 'Pacific Northwest', 'Southwest'].indexOf(r);
  const tPop = Math.log10(treatmentDma.population);
  const tDemand = features.recentDemand[treatmentDma.id] ?? 1;

  const candidates = allDmas
    .filter((d) => d.id !== treatmentDma.id)
    .map((d) => {
      const dPop = Math.log10(d.population);
      const dDemand = features.recentDemand[d.id] ?? 1;
      const distance = Math.sqrt(
        Math.pow((dPop - tPop) * 1.0, 2) +
          Math.pow((d.baselineIndex - treatmentDma.baselineIndex) / 20, 2) +
          Math.pow((regionCode(d.region) - regionCode(treatmentDma.region)) * 0.6, 2) +
          Math.pow((d.climate.baseTempC - treatmentDma.climate.baseTempC) / 10, 2) +
          Math.pow((dDemand - tDemand) / Math.max(1, tDemand), 2) * 2,
      );
      return {
        dma: d.id,
        dmaName: d.name,
        region: d.region,
        distance: round2(distance),
        similarity: round2(1 / (1 + distance)),
      };
    })
    .sort((a, b) => a.distance - b.distance);
  return candidates;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
