/**
 * Geo Demand Engine — modeling core (Quick-Lube Auto Services configuration).
 *
 * SIMPLIFICATION NOTE: These are deterministic, interpretable heuristic models that
 * stand in for a future true Bayesian/hierarchical MMM. Every function here is a
 * transparent approximation chosen so the demo behaves sensibly and is fully
 * inspectable. Where a real causal/Bayesian model would live, this is flagged.
 *
 * The signal model is tuned for a physical auto-services chain (Jiffy Lube-style):
 * weather is a deterministic demand shock on vehicle maintenance (cold kills
 * batteries, heat overwhelms cooling systems, storms defer then release demand),
 * Google Search is the dominant bottom-of-funnel channel, and physical service
 * locations have real capacity ceilings and elevated visit friction.
 */
import {
  Action,
  Channel,
  DecompositionResult,
  DMA,
  FunnelStage,
  MatchedMarket,
  Recommendation,
  ServiceLine,
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
// 2. Indoor Behavior Index (0-100): how much weather pushes people to stay home
//    / defer a service visit and browse/book digitally instead of driving in.
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
// 3. Service Trigger Index (0-100): weather-driven service-line relevance
// ---------------------------------------------------------------------------
export function calculateCategoryTriggerIndex(
  serviceLine: ServiceLine,
  regime: WeatherRegime,
  anomaly: { tempAnomaly: number },
): number {
  const mult = categoryWeatherMultiplier(serviceLine, regime, anomaly.tempAnomaly);
  // map multiplier (~0.5-1.9) to 0-100, where 1.0 -> 50
  return clamp(Math.round((mult - 0.5) * (100 / 1.4)), 0, 100);
}

// ---------------------------------------------------------------------------
// 4. Weather Friction Index (0-100): friction to actually visiting a service bay.
//
//    Physical service businesses carry HIGHER friction than online retail — nobody wants to
//    drive out and sit in a waiting room during snow/rain. High friction during an
//    event suppresses current-period visits but builds "deferred demand" that is
//    released post-event (see calculateDeferredDemandMultiplier).
// ---------------------------------------------------------------------------
export function calculateWeatherFrictionIndex(inputs: {
  precipitation: number;
  snow: number;
  severe: boolean;
  capacityHealthy: boolean;
}): number {
  let score = 10; // physical-visit baseline friction is higher than online
  score += Math.min(40, inputs.precipitation * 3);
  score += Math.min(45, inputs.snow * 6);
  if (inputs.severe) score += 35;
  if (!inputs.capacityHealthy) score += 25; // long waits add friction
  return clamp(Math.round(score), 0, 100);
}

/**
 * Deferred-demand multiplier for the POST-event window. High friction during a
 * weather event does not destroy demand — it defers it. The visits people skipped
 * during the snow/storm return afterward as pent-up + deferred maintenance. This
 * returns a multiplier (>1) applied to post-event baseline demand, scaled by how
 * suppressive the event was.
 */
export function calculateDeferredDemandMultiplier(frictionIndex: number): number {
  // Friction of 100 during an event -> ~1.6x demand release afterward.
  return round2(1 + (clamp(frictionIndex, 0, 100) / 100) * 0.6);
}

// ---------------------------------------------------------------------------
// 5. Adstock (geometric decay, channel-specific)
// ---------------------------------------------------------------------------
const CHANNEL_DECAY: Record<Channel, number> = {
  'Google Search': 0.15, // very fast decay — search intent is immediate
  Meta: 0.45,
  YouTube: 0.55,
  CTV: 0.65, // brand/awareness, slow build
  'Direct Mail': 0.6, // coupons sit on the fridge, long decay tail
  'Email/CRM': 0.3,
  'Programmatic Display': 0.35,
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

/**
 * Channel-specific half-saturation guidance for auto services, expressed as a
 * multiple of the DMA's per-channel base spend:
 *  - Google Search: saturates faster in small DMAs (limited local search volume)
 *  - CTV / Programmatic: broad reach, scales across large DMAs (higher half-sat)
 *  - Direct Mail: step-function-like — below a minimum drop it's near zero, at/above
 *    the drop threshold it steps up. Approximated here with a higher half-sat.
 */
const CHANNEL_HALFSAT_MULT: Record<Channel, number> = {
  'Google Search': 0.8,
  Meta: 1.1,
  YouTube: 1.3,
  CTV: 1.7,
  'Direct Mail': 1.4,
  'Email/CRM': 0.7,
  'Programmatic Display': 1.6,
};

export function channelHalfSaturation(channel: Channel, baseSpend: number): number {
  return Math.max(250, Math.round(baseSpend * (CHANNEL_HALFSAT_MULT[channel] ?? 1.1)));
}

// ---------------------------------------------------------------------------
// 7. Baseline demand
//
//    Auto-service baseline incorporates maintenance seasonality (winter-prep in
//    Oct-Nov and spring-maintenance in Mar-Apr run hot; Jan-Feb run cold),
//    day-of-week (weekends are busier for oil changes), and location count (more
//    locations = more addressable capacity in the DMA).
// ---------------------------------------------------------------------------
export function estimateBaselineDemand(inputs: {
  baselineIndex: number;
  population: number;
  categoryBase: number;
  date?: string;
  locationCount?: number;
}): number {
  const popFactor = inputs.population / 2_000_000;
  const seasonMult = inputs.date ? maintenanceSeasonMultiplier(inputs.date) : 1;
  const dowMult = inputs.date ? dayOfWeekMultiplier(inputs.date) : 1;
  const locMult = inputs.locationCount ? locationCapacityMultiplier(inputs.locationCount) : 1;
  return Math.round(
    inputs.categoryBase * popFactor * (inputs.baselineIndex / 100) * seasonMult * dowMult * locMult,
  );
}

/** Maintenance-season multiplier: winter-prep (Oct-Nov) & spring (Mar-Apr) above baseline. */
export function maintenanceSeasonMultiplier(dateStr: string): number {
  const month = Number(dateStr.slice(5, 7)); // 1-12
  switch (month) {
    case 10:
    case 11:
      return 1.18; // winter-prep season
    case 3:
    case 4:
      return 1.15; // spring maintenance season
    case 1:
    case 2:
      return 0.88; // cold + post-holiday deferral
    default:
      return 1;
  }
}

/** Weekends run higher for oil changes (people have time to come in). */
export function dayOfWeekMultiplier(dateStr: string): number {
  const dow = new Date(`${dateStr}T00:00:00Z`).getUTCDay(); // 0 = Sun
  if (dow === 6) return 1.25; // Saturday
  if (dow === 0) return 1.1; // Sunday
  if (dow === 5) return 1.08; // Friday
  return 0.96;
}

/** More locations = more addressable capacity. Diminishing returns via sqrt. */
export function locationCapacityMultiplier(locationCount: number): number {
  return round2(0.6 + Math.sqrt(Math.max(1, locationCount)) * 0.12);
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
//
//    For auto services, SEARCH gets the biggest interaction boost during
//    pre-event / First Cold Snap urgency windows — people actively search
//    "oil change near me" the moment winter arrives. Brand channels (CTV /
//    Programmatic / YouTube) interact more strongly during Normal conditions,
//    when there is no urgency trigger and brand building is the right play.
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

const URGENCY_REGIMES: WeatherRegime[] = [
  'First Cold Snap',
  'Cold Snap',
  'Heat Wave',
  'Snow Event',
  'Rainy Weekend',
  'First Warm Weekend',
];

export function estimateWeatherMediaInteraction(inputs: {
  regime: WeatherRegime;
  channel: Channel;
  funnel: FunnelStage;
  triggerIndex: number; // 0-100
}): number {
  let m = 1 + (REGIME_MEDIA_BIAS[inputs.regime] ?? 0);
  // higher service relevance amplifies media efficiency
  m += ((inputs.triggerIndex - 50) / 100) * 0.4;

  const isUrgency = URGENCY_REGIMES.includes(inputs.regime);
  // Search dominates urgency windows: "oil change near me" intent spikes.
  if (inputs.channel === 'Google Search' && isUrgency) {
    m += inputs.regime === 'First Cold Snap' ? 0.22 : 0.14;
  }
  // Brand/awareness media works hardest when there's no urgency trigger.
  if (
    (inputs.channel === 'CTV' ||
      inputs.channel === 'Programmatic Display' ||
      inputs.channel === 'YouTube') &&
    inputs.regime === 'Normal'
  ) {
    m += 0.12;
  }
  // Retention channels (Direct Mail / Email) do their best post-event reactivation.
  if ((inputs.channel === 'Direct Mail' || inputs.channel === 'Email/CRM') && isUrgency) {
    m += 0.06;
  }
  // funnel timing: during high-relevance windows, BOF/Search converts better
  if (inputs.funnel === 'BOF') m += 0.08;
  if (inputs.funnel === 'TOF' && inputs.triggerIndex > 65) m += 0.05;
  // severe storm suppresses paid efficiency regardless of channel (handled by bias)
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
  capacityHealthy: boolean;
  seed?: number;
}): DecompositionResult {
  const baseline = inputs.baseline;
  // weather lift: trigger index above/below neutral scales baseline
  const weatherLift = Math.round(baseline * ((inputs.triggerIndex - 50) / 100) * 0.6);
  const mediaLift = Math.round(inputs.mediaIncrementality);
  const interactionLift = Math.round(mediaLift * (inputs.interactionMultiplier - 1));
  const promoLift = inputs.promoActive ? Math.round(baseline * inputs.promoDiscount * 0.8) : 0;
  // Capacity-constrained DMAs turn demand away (waits, full bays).
  const capacityEffect = inputs.capacityHealthy ? 0 : -Math.round(baseline * 0.12);
  const seasonality = Math.round(baseline * 0.05);
  const noiseRng = (Math.sin((inputs.seed ?? 1) * 12.9898) * 43758.5453) % 1;
  const noise = Math.round(baseline * 0.03 * (noiseRng - 0.5) * 2);
  const observed =
    baseline + weatherLift + mediaLift + interactionLift + promoLift + capacityEffect + seasonality + noise;
  return {
    baseline,
    weatherLift,
    mediaLift,
    interactionLift,
    promoLift,
    capacityEffect,
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
  serviceLine: ServiceLine;
  regime: WeatherRegime;
  decomposition: DecompositionResult;
  marginalRoas: number;
  confidence: number;
  capacityHealthy: boolean;
  creativeReady: boolean;
  topChannel: Channel;
  funnelFocus: FunnelStage;
}): Recommendation {
  const { decomposition: d } = inputs;
  const totalLift = d.weatherLift + d.mediaLift + d.interactionLift;
  const weatherShare = totalLift > 0 ? clamp(d.weatherLift / totalLift, 0, 1) : 0;
  const riskFlags: string[] = [];
  if (!inputs.capacityHealthy) riskFlags.push('Capacity constrained (long waits / bays full)');
  if (!inputs.creativeReady) riskFlags.push('Creative not ready');
  if (inputs.confidence < 0.55) riskFlags.push('Low model confidence');
  if (weatherShare > 0.65) riskFlags.push('Lift mostly weather-driven (low media causality)');
  if (inputs.regime === 'Severe Storm') riskFlags.push('Severe weather suppresses store visits');

  const opportunityScore = clamp(
    Math.round(
      (totalLift / Math.max(1, d.baseline)) * 120 +
        inputs.marginalRoas * 8 +
        (1 - weatherShare) * 20,
    ),
    0,
    100,
  );

  // Action logic — deliberately not always "Act". A maxed/constrained DMA is
  // suppressed even if demand is high (can't service more cars).
  let action: Action = 'Monitor';
  if (inputs.regime === 'Severe Storm' || !inputs.capacityHealthy) {
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

  const rationale = buildRationale(action, weatherShare, inputs.marginalRoas, inputs.regime, inputs.serviceLine);

  return {
    id: `${inputs.dma.id}-${inputs.serviceLine}`,
    dma: inputs.dma.id,
    dmaName: inputs.dma.name,
    region: inputs.dma.region,
    service_line: inputs.serviceLine,
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
  serviceLine: ServiceLine,
): string {
  const ws = Math.round(weatherShare * 100);
  switch (action) {
    case 'Act':
      return `${regime} is driving strong, media-responsive ${serviceLine} demand (mROAS ${mroas.toFixed(2)}). Weather explains ${ws}% of the visit lift, leaving real incremental headroom for paid — bid up Search and drop a coupon now.`;
    case 'Test':
      return `Promising ${serviceLine} signal under ${regime}, but confidence or creative readiness warrants a controlled geo lift test before scaling spend.`;
    case 'Ignore':
      return `${ws}% of the ${serviceLine} lift is weather-driven demand that would convert regardless of media (mROAS ${mroas.toFixed(2)}). Adding spend mostly subsidizes walk-in demand — hold paid.`;
    case 'Suppress':
      return `${regime} / capacity constraints make this a poor window for paid acquisition. Pull back spend so bays aren't overwhelmed and wait times stay manageable.`;
    default:
      return `Weak or uncertain ${serviceLine} signal under ${regime}. Keep monitoring; no action yet.`;
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
// 14. Creative brief generator (auto-services taxonomy)
// ---------------------------------------------------------------------------
const ANGLE_BY_REGIME: Record<WeatherRegime, string> = {
  'Cold Snap': 'Cold start protection',
  'First Cold Snap': 'Pre-winter prep urgency',
  'Heat Wave': 'Heat check — protect your engine',
  'Rainy Weekend': 'Wiper blade urgency',
  'Snow Event': 'Get storm-ready now',
  'High UV': 'Road trip ready',
  'Poor Air Quality': 'Cabin air filter refresh',
  'Severe Storm': 'Schedule before the storm',
  'First Warm Weekend': 'Spring maintenance season is here',
  Normal: 'Stay on schedule',
};

const HOOKS_BY_REGIME: Record<WeatherRegime, string[]> = {
  'Cold Snap': [
    'Your engine works harder in the cold. Is your oil ready?',
    "Cold snaps kill batteries. Don't find out the hard way.",
    'Synthetic oil outperforms in cold — upgrade before temps drop.',
  ],
  'First Cold Snap': [
    'Winter just knocked — is your car ready?',
    'First cold snap of the season is the #1 time people regret skipping their oil change.',
    'Pre-winter checklist: wipers, battery, oil — are you covered?',
  ],
  'Heat Wave': [
    "Heat kills engines faster than cold. When'd you last check your coolant?",
    "90°+ days are the #1 battery killer. Don't get stranded.",
    'Your engine oil breaks down faster in heat — protect it.',
  ],
  'Rainy Weekend': [
    'Can your wipers handle this weekend?',
    "Rain's coming. Wiper blades take 5 minutes. Do it before the storm.",
    "Don't wait until you can't see through the windshield.",
  ],
  'Snow Event': [
    'Snow in the forecast — is your car storm-ready?',
    'Wipers, battery, oil: get ready before the first flakes fall.',
    "Beat the storm rush. Book your winter check now.",
  ],
  'High UV': [
    'Headed out on a road trip? Get a pre-trip checkup first.',
    'Long summer drives are hard on oil and coolant — top off before you go.',
    'Road-trip ready in under 15 minutes.',
  ],
  'Poor Air Quality': [
    'Breathing easy in the car starts with a fresh cabin air filter.',
    'Hazy skies? Your cabin air filter is working overtime — refresh it.',
    'A clogged cabin filter means dirtier air inside your car. Swap it today.',
  ],
  'Severe Storm': [
    'Schedule your service for after the storm clears.',
    "Stay off the roads today — book your visit for when it's safe.",
    "Storm's coming. Lock in your appointment for the calm afterward.",
  ],
  'First Warm Weekend': [
    "Post-winter checkup: how'd your car hold up?",
    'Spring means maintenance season. Get ahead of the line.',
    'Your car deferred maintenance all winter. Time to catch up.',
  ],
  Normal: [
    'Overdue for an oil change? Most take under 15 minutes.',
    'Stay on schedule — quick, no appointment needed.',
    "Due for service? We'll get you in and out.",
  ],
};

const CTA_BY_REGIME: Record<WeatherRegime, string> = {
  'Cold Snap': 'Book your cold-weather check before temps drop',
  'First Cold Snap': 'Book your winter-prep visit before the cold hits',
  'Heat Wave': 'Book your heat check — walk-ins welcome',
  'Rainy Weekend': 'Swap your wipers before the rain hits',
  'Snow Event': 'Book before the storm hits',
  'High UV': 'Book your pre-road-trip checkup',
  'Poor Air Quality': 'Refresh your cabin air filter today',
  'Severe Storm': 'Schedule for after the storm clears',
  'First Warm Weekend': 'Get your post-winter checkup — walk-ins welcome',
  Normal: 'Overdue? Most oil changes take under 15 minutes.',
};

const COUPON_BY_REGIME: Record<WeatherRegime, string> = {
  'Cold Snap': 'Synthetic upgrade for $20 off — valid 7 days',
  'First Cold Snap': 'Winter-prep bundle: oil + battery test + wiper check, $25 off',
  'Heat Wave': 'Cooling system flush $30 off — valid 10 days',
  'Rainy Weekend': 'Wiper blade pair installed, $10 off this week',
  'Snow Event': 'Pre-storm winter check $20 off — book by Friday',
  'High UV': 'Road-trip ready package $15 off',
  'Poor Air Quality': 'Cabin + engine air filter combo, $12 off',
  'Severe Storm': 'Post-storm deferred-maintenance check, $20 off — valid 7 days after',
  'First Warm Weekend': 'Spring maintenance package $25 off — valid 14 days',
  Normal: 'Standard oil change $10 off with this coupon',
};

export function generateCreativeBrief(inputs: {
  dma: DMA;
  regime: WeatherRegime;
  serviceLine: ServiceLine;
  indoorIndex: number;
}): import('../types').CreativeBrief {
  const angle = ANGLE_BY_REGIME[inputs.regime] ?? 'Stay on schedule';
  const highFriction = inputs.indoorIndex > 55;
  const hooks = HOOKS_BY_REGIME[inputs.regime] ?? HOOKS_BY_REGIME.Normal;
  return {
    id: `BRIEF-${inputs.dma.id}-${inputs.serviceLine}`,
    dma: inputs.dma.id,
    dmaName: inputs.dma.name,
    region: inputs.dma.region,
    regime: inputs.regime,
    service_line: inputs.serviceLine,
    weatherContext: `${inputs.regime} conditions in ${inputs.dma.name} (${inputs.dma.region}). Indoor/Friction Index ${inputs.indoorIndex} — ${highFriction ? 'high friction to visit right now, lean on pre-booking and post-event scheduling' : 'low friction, drive walk-in traffic now'}.`,
    consumerMindset: highFriction
      ? 'Reluctant to drive out in this weather; receptive to "book now, come in when it clears" and reminders that deferred maintenance is piling up.'
      : 'Reminded that weather is stressing their vehicle; receptive to urgency and "quick, no-appointment" convenience messaging.',
    messageAngle: angle,
    hooks,
    cta: CTA_BY_REGIME[inputs.regime] ?? CTA_BY_REGIME.Normal,
    couponOffer: COUPON_BY_REGIME[inputs.regime] ?? COUPON_BY_REGIME.Normal,
    landingPageRec: `${inputs.serviceLine} booking page with "near me" location finder, live wait times, and the coupon pre-applied`,
    channelGuidance: [
      { channel: 'Google Search', funnel: 'BOF', note: 'Always-on BOF: bid up "oil change near me", "oil change [city]", "wiper blades near me" during the window' },
      { channel: 'CTV', funnel: 'TOF', note: "Run 15s 'is your car ready?' spots during local weather-forecast slots" },
      { channel: 'Meta', funnel: 'MOF', note: highFriction ? 'Retarget recent visitors with "book now, come in when it clears" scheduling offers' : 'Weather-themed offer creative with location + wait-time extension' },
      { channel: 'Direct Mail', funnel: 'Retention', note: 'Drop the DMA coupon with a unique promo code so mail lift can be measured separately from organic' },
    ],
    measurementPlan: 'Geo holdout vs matched control; read incremental service visits, coupon redemption, and new-vs-returning mix over the weather window + a 7-day post-event tail (deferred demand releases after the event).',
    format: highFriction ? 'Video' : 'Static',
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
