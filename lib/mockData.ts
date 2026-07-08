/**
 * Deterministic mock data generators for Geo Demand Engine.
 *
 * All randomness is seeded (see lib/rng.ts) so server and client produce identical
 * output -> no hydration mismatch. Heavy series are generated lazily per-DMA and
 * cached in module-level singletons so repeated imports don't recompute.
 *
 * NOTE on volume: the spec calls for >=365 days of history. The generators below
 * are capable of 365 days, but to keep client payloads sane we default history to
 * a rolling recent window (HISTORY_DAYS) and aggregate before shipping to clients.
 */
import {
  CapacityObservation,
  CapacityStatus,
  Channel,
  CreativeFormat,
  CreativeObservation,
  DistributionMethod,
  DMA,
  FunnelStage,
  MediaObservation,
  PromoObservation,
  PromoType,
  Region,
  ServiceLine,
  ServiceObservation,
  WeatherForecast,
  WeatherObservation,
  WeatherRegime,
} from './types';
import { gaussian, hashSeed, mulberry32, pick } from './rng';

export const REGIONS: Region[] = [
  'Northeast',
  'Midwest',
  'South',
  'West',
  'Pacific Northwest',
  'Southwest',
];

export const SERVICE_LINES: ServiceLine[] = [
  'Standard Oil Change',
  'Synthetic Oil Change',
  'Tire Services',
  'Wiper Blades',
  'Battery/Electrical',
  'Cooling System',
  'Air Filtration',
];

export const CHANNELS: Channel[] = [
  'Google Search',
  'Meta',
  'YouTube',
  'CTV',
  'Direct Mail',
  'Email/CRM',
  'Programmatic Display',
];

export const FUNNEL_STAGES: FunnelStage[] = ['TOF', 'MOF', 'BOF', 'Retention'];

export const WEATHER_REGIMES: WeatherRegime[] = [
  'Normal',
  'Cold Snap',
  'Heat Wave',
  'Rainy Weekend',
  'Snow Event',
  'High UV',
  'Poor Air Quality',
  'Severe Storm',
  'First Warm Weekend',
  'First Cold Snap',
];

export const HISTORY_DAYS = 180;
export const FORECAST_DAYS = 14;

// Fixed "today" so the demo is deterministic regardless of wall clock.
export const DEMO_TODAY = new Date('2026-06-28T00:00:00Z');

function dateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

// City names per region for flavor (DMAs)
const CITY_POOL: Record<Region, string[]> = {
  Northeast: ['New York', 'Boston', 'Philadelphia', 'Hartford', 'Providence', 'Albany', 'Buffalo', 'Pittsburgh', 'Portland ME'],
  Midwest: ['Chicago', 'Detroit', 'Minneapolis', 'Cleveland', 'Columbus', 'Indianapolis', 'Milwaukee', 'Kansas City', 'St. Louis', 'Cincinnati'],
  South: ['Atlanta', 'Miami', 'Dallas', 'Houston', 'Orlando', 'Tampa', 'Charlotte', 'Nashville', 'New Orleans', 'Memphis'],
  West: ['Los Angeles', 'San Francisco', 'San Diego', 'Sacramento', 'Las Vegas', 'Salt Lake City', 'Denver', 'Fresno'],
  'Pacific Northwest': ['Seattle', 'Portland OR', 'Spokane', 'Boise', 'Eugene'],
  Southwest: ['Phoenix', 'Tucson', 'Albuquerque', 'El Paso', 'San Antonio', 'Austin', 'Oklahoma City'],
};

// Approximate lat/lon for each metro in CITY_POOL — used by the live weather
// provider (Open-Meteo) to fetch real forecasts. Approximate is fine; these are
// downtown-ish coordinates for the metro. Any city not listed falls back to a
// region centroid (see REGION_CENTROID).
const CITY_LATLON: Record<string, [number, number]> = {
  'New York': [40.71, -74.01], Boston: [42.36, -71.06], Philadelphia: [39.95, -75.17],
  Hartford: [41.76, -72.69], Providence: [41.82, -71.41], Albany: [42.65, -73.76],
  Buffalo: [42.89, -78.88], Pittsburgh: [40.44, -79.99], 'Portland ME': [43.66, -70.26],
  Chicago: [41.88, -87.63], Detroit: [42.33, -83.05], Minneapolis: [44.98, -93.27],
  Cleveland: [41.5, -81.69], Columbus: [39.96, -82.99], Indianapolis: [39.77, -86.16],
  Milwaukee: [43.04, -87.91], 'Kansas City': [39.1, -94.58], 'St. Louis': [38.63, -90.2],
  Cincinnati: [39.1, -84.51], Atlanta: [33.75, -84.39], Miami: [25.76, -80.19],
  Dallas: [32.78, -96.8], Houston: [29.76, -95.37], Orlando: [28.54, -81.38],
  Tampa: [27.95, -82.46], Charlotte: [35.23, -80.84], Nashville: [36.16, -86.78],
  'New Orleans': [29.95, -90.07], Memphis: [35.15, -90.05], 'Los Angeles': [34.05, -118.24],
  'San Francisco': [37.77, -122.42], 'San Diego': [32.72, -117.16], Sacramento: [38.58, -121.49],
  'Las Vegas': [36.17, -115.14], 'Salt Lake City': [40.76, -111.89], Denver: [39.74, -104.99],
  Fresno: [36.74, -119.79], Seattle: [47.61, -122.33], 'Portland OR': [45.52, -122.68],
  Spokane: [47.66, -117.43], Boise: [43.62, -116.21], Eugene: [44.05, -123.09],
  Phoenix: [33.45, -112.07], Tucson: [32.22, -110.97], Albuquerque: [35.08, -106.65],
  'El Paso': [31.76, -106.49], 'San Antonio': [29.42, -98.49], Austin: [30.27, -97.74],
  'Oklahoma City': [35.47, -97.52],
};

const REGION_CENTROID: Record<Region, [number, number]> = {
  Northeast: [42.0, -73.0],
  Midwest: [41.5, -87.0],
  South: [33.0, -86.0],
  West: [37.0, -119.0],
  'Pacific Northwest': [46.0, -122.0],
  Southwest: [33.5, -106.0],
};

const CLIMATE_BY_REGION: Record<Region, { baseTempC: number; amp: number; precip: number; snow: boolean; uv: boolean; aq: number }> = {
  Northeast: { baseTempC: 11, amp: 14, precip: 3.2, snow: true, uv: false, aq: 0.25 },
  Midwest: { baseTempC: 10, amp: 16, precip: 2.8, snow: true, uv: false, aq: 0.3 },
  South: { baseTempC: 21, amp: 9, precip: 3.8, snow: false, uv: true, aq: 0.2 },
  West: { baseTempC: 17, amp: 8, precip: 1.6, snow: false, uv: true, aq: 0.4 },
  'Pacific Northwest': { baseTempC: 12, amp: 9, precip: 4.5, snow: false, uv: false, aq: 0.15 },
  Southwest: { baseTempC: 23, amp: 12, precip: 0.9, snow: false, uv: true, aq: 0.35 },
};

let _dmas: DMA[] | null = null;

export function generateDMAs(): DMA[] {
  if (_dmas) return _dmas;
  const dmas: DMA[] = [];
  let counter = 0;
  for (const region of REGIONS) {
    const cities = CITY_POOL[region];
    for (const city of cities) {
      const seed = hashSeed(`dma-${city}-${region}`);
      const rand = mulberry32(seed);
      const c = CLIMATE_BY_REGION[region];
      counter++;
      const [lat, lon] = CITY_LATLON[city] ?? REGION_CENTROID[region];
      const population = Math.round((300_000 + rand() * 8_000_000) / 1000) * 1000;
      // Service-location count scales with market size: large metros run big
      // networks, small markets a handful of stores. A hard capacity ceiling.
      let locationCount: number;
      if (population > 4_500_000) locationCount = 20 + Math.round(rand() * 30); // 20-50
      else if (population > 1_500_000) locationCount = 5 + Math.round(rand() * 15); // 5-20
      else locationCount = 1 + Math.round(rand() * 4); // 1-5
      // Density = service locations per million residents.
      const perMillion = locationCount / (population / 1_000_000);
      const locationDensity: DMA['locationDensity'] =
        perMillion >= 7 ? 'High' : perMillion >= 3.5 ? 'Medium' : 'Low';
      dmas.push({
        id: `DMA-${String(counter).padStart(3, '0')}`,
        name: city,
        region,
        population,
        baselineIndex: Math.round((85 + rand() * 35) * 10) / 10,
        lat,
        lon,
        locationCount,
        locationDensity,
        climate: {
          baseTempC: c.baseTempC + gaussian(rand, 0, 1.5),
          seasonalAmplitude: c.amp + gaussian(rand, 0, 1.5),
          basePrecip: c.precip * (0.8 + rand() * 0.5),
          snowProne: c.snow,
          uvProne: c.uv,
          airQualityRisk: Math.min(1, Math.max(0, c.aq + gaussian(rand, 0, 0.08))),
        },
      });
    }
  }
  _dmas = dmas;
  return dmas;
}

// Seasonal temperature model: peak summer near day 200 of year.
export function seasonalTemp(dma: DMA, date: Date): number {
  const dayOfYear = Math.floor(
    (date.getTime() - new Date(Date.UTC(date.getUTCFullYear(), 0, 0)).getTime()) / 86400000,
  );
  const phase = ((dayOfYear - 200) / 365) * 2 * Math.PI;
  return dma.climate.baseTempC + dma.climate.seasonalAmplitude * Math.cos(phase);
}

export function deriveRegime(
  obs: Omit<WeatherObservation, 'regime'>,
  dma: DMA,
  prevWarm: boolean,
): WeatherRegime {
  if (obs.severe_weather_flag) return 'Severe Storm';
  if (obs.snow > 4) return 'Snow Event';
  if (obs.air_quality > 130) return 'Poor Air Quality';
  if (obs.temp_anomaly <= -7) return prevWarm ? 'First Cold Snap' : 'Cold Snap';
  if (obs.temp_anomaly >= 7 && obs.temperature > 27) return 'Heat Wave';
  if (obs.uv_index >= 9) return 'High UV';
  if (obs.precipitation > 12) return 'Rainy Weekend';
  if (obs.temp_anomaly >= 5 && prevWarm === false && obs.temperature > 16) return 'First Warm Weekend';
  return 'Normal';
}

const _weatherCache = new Map<string, WeatherObservation[]>();

export function generateWeatherForDMA(dma: DMA, days = HISTORY_DAYS): WeatherObservation[] {
  const key = `${dma.id}-${days}`;
  const cached = _weatherCache.get(key);
  if (cached) return cached;
  const rand = mulberry32(hashSeed(`weather-${dma.id}`));
  const out: WeatherObservation[] = [];
  let prevWarmDays = 0;
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(DEMO_TODAY, -i);
    const norm = seasonalTemp(dma, date);
    const anomaly = gaussian(rand, 0, 4.2);
    const temperature = Math.round((norm + anomaly) * 10) / 10;
    const precipitation =
      rand() < 0.32 ? Math.round(rand() * dma.climate.basePrecip * 6 * 10) / 10 : 0;
    const snow =
      dma.climate.snowProne && temperature < 1 && precipitation > 0
        ? Math.round(precipitation * (1 + rand()) * 10) / 10
        : 0;
    const uv_index = Math.max(
      0,
      Math.round((dma.climate.uvProne ? 6 : 3) + (temperature - 15) * 0.25 + gaussian(rand, 0, 1.5)),
    );
    const air_quality = Math.round(
      30 + dma.climate.airQualityRisk * 90 + (rand() < 0.06 ? rand() * 80 : 0) + gaussian(rand, 0, 8),
    );
    const severe_weather_flag = rand() < 0.02;
    const base = {
      date: dateStr(date),
      dma: dma.id,
      temperature,
      temp_anomaly: Math.round(anomaly * 10) / 10,
      precipitation,
      snow,
      humidity: Math.min(100, Math.max(20, Math.round(55 + precipitation * 2 + gaussian(rand, 0, 10)))),
      uv_index,
      air_quality,
      severe_weather_flag,
    };
    const prevWarm = prevWarmDays >= 2;
    const regime = deriveRegime(base, dma, prevWarm);
    if (temperature > dma.climate.baseTempC) prevWarmDays++;
    else prevWarmDays = 0;
    out.push({ ...base, regime });
  }
  _weatherCache.set(key, out);
  return out;
}

export function generateWeatherHistory(dmas: DMA[], days = HISTORY_DAYS): WeatherObservation[] {
  return dmas.flatMap((d) => generateWeatherForDMA(d, days));
}

export function generateWeatherForecast(dmas: DMA[], days = FORECAST_DAYS): WeatherForecast[] {
  const out: WeatherForecast[] = [];
  for (const dma of dmas) {
    const rand = mulberry32(hashSeed(`forecast-${dma.id}`));
    let prevWarmDays = 0;
    for (let i = 1; i <= days; i++) {
      const date = addDays(DEMO_TODAY, i);
      const norm = seasonalTemp(dma, date);
      const anomaly = gaussian(rand, 0, 3.8);
      const temperature = Math.round((norm + anomaly) * 10) / 10;
      const precipitation = rand() < 0.3 ? Math.round(rand() * dma.climate.basePrecip * 6 * 10) / 10 : 0;
      const snow = dma.climate.snowProne && temperature < 1 && precipitation > 0 ? Math.round(precipitation * 10) / 10 : 0;
      const uv_index = Math.max(0, Math.round((dma.climate.uvProne ? 6 : 3) + (temperature - 15) * 0.25 + gaussian(rand, 0, 1.2)));
      const air_quality = Math.round(30 + dma.climate.airQualityRisk * 90 + gaussian(rand, 0, 8));
      const severe_weather_flag = rand() < 0.015;
      const base = {
        date: dateStr(date),
        dma: dma.id,
        temperature,
        temp_anomaly: Math.round(anomaly * 10) / 10,
        precipitation,
        snow,
        humidity: Math.min(100, Math.max(20, Math.round(55 + precipitation * 2 + gaussian(rand, 0, 10)))),
        uv_index,
        air_quality,
        severe_weather_flag,
      };
      const regime = deriveRegime(base, dma, prevWarmDays >= 2);
      if (temperature > dma.climate.baseTempC) prevWarmDays++;
      else prevWarmDays = 0;
      out.push({
        ...base,
        regime,
        horizonDays: i,
        confidence: Math.round((0.95 - i * 0.035) * 100) / 100,
      });
    }
  }
  return out;
}

// Per-service-line daily base revenue (for a ~2M-pop DMA at baseline index 100)
// and the realistic average ticket for a quick-lube chain.
export const SERVICE_LINE_BASE_REVENUE: Record<ServiceLine, number> = {
  'Standard Oil Change': 30000,
  'Synthetic Oil Change': 26000,
  'Tire Services': 22000,
  'Wiper Blades': 6000,
  'Battery/Electrical': 14000,
  'Cooling System': 11000,
  'Air Filtration': 7000,
};

const SERVICE_LINE_AVG_TICKET: Record<ServiceLine, number> = {
  'Standard Oil Change': 55, // $45-65
  'Synthetic Oil Change': 88, // $75-100
  'Tire Services': 130, // $80-180 rotation up to $400-800 full set (blended)
  'Wiper Blades': 35, // $25-45 pair
  'Battery/Electrical': 200, // $150-250 replacement
  'Cooling System': 140, // $100-180
  'Air Filtration': 45, // $30-60
};

/** More locations = more addressable service capacity in the DMA. */
function locationVolumeFactor(locationCount: number): number {
  return 0.6 + Math.sqrt(Math.max(1, locationCount)) * 0.11;
}

let _sales: ServiceObservation[] | null = null;

export function generateServiceObservations(
  dmas: DMA[],
  days = HISTORY_DAYS,
): ServiceObservation[] {
  if (_sales) return _sales;
  const out: ServiceObservation[] = [];
  for (const dma of dmas) {
    const weather = generateWeatherForDMA(dma, days);
    const popFactor = dma.population / 2_000_000;
    const locFactor = locationVolumeFactor(dma.locationCount);
    for (const w of weather) {
      for (const sl of SERVICE_LINES) {
        const catSeed = mulberry32(hashSeed(`svc-${dma.id}-${sl}-${w.date}`));
        const trigger = categoryWeatherMultiplier(sl, w.regime, w.temp_anomaly);
        const seasonMult = maintenanceSeason(w.date);
        const baseRev =
          SERVICE_LINE_BASE_REVENUE[sl] * popFactor * locFactor * (dma.baselineIndex / 100);
        const revenue = Math.round(baseRev * trigger * seasonMult * (0.85 + catSeed() * 0.3));
        const avgTicket = Math.round(SERVICE_LINE_AVG_TICKET[sl] * (0.9 + catSeed() * 0.2));
        const transactions = Math.max(0, Math.round(revenue / avgTicket));
        const newShare = 0.3 + catSeed() * 0.25;
        // Coupon redemption runs high during direct-mail promo periods; a
        // deterministic subset of days act as "drop" days with elevated redemption.
        const isDropDay = catSeed() < 0.18;
        const couponRedemption = isDropDay
          ? Math.round((0.15 + catSeed() * 0.25) * 100) / 100 // 15-40% on mail drops
          : Math.round((0.05 + catSeed() * 0.1) * 100) / 100; // 5-15% baseline digital
        out.push({
          date: w.date,
          dma: dma.id,
          service_line: sl,
          revenue,
          transactions,
          new_customers: Math.round(transactions * newShare),
          returning_customers: Math.round(transactions * (1 - newShare)),
          margin: Math.round((0.4 + catSeed() * 0.2) * 100) / 100,
          avg_ticket: avgTicket,
          coupon_redemption_rate: couponRedemption,
        });
      }
    }
  }
  _sales = out;
  return out;
}

/** Maintenance-season multiplier used by the mock generator (mirrors modeling). */
function maintenanceSeason(dateStr: string): number {
  const month = Number(dateStr.slice(5, 7));
  if (month === 10 || month === 11) return 1.18;
  if (month === 3 || month === 4) return 1.15;
  if (month === 1 || month === 2) return 0.88;
  return 1;
}

/**
 * Weather multiplier on auto-service demand (~0.5 - 1.9). This is the heart of the
 * quick-lube signal model: cold kills batteries and stresses oil, heat overwhelms
 * cooling systems, rain drives wiper demand, storms suppress-then-defer visits, and
 * the first cold snap / first warm weekend are the two biggest demand shocks.
 */
export function categoryWeatherMultiplier(
  sl: ServiceLine,
  regime: WeatherRegime,
  tempAnomaly: number,
): number {
  const VH = 1.8; // very high
  const H = 1.5; // high
  const M = 1.15; // medium
  const L = 0.78; // low (deferral / friction)
  const SUP = 0.55; // suppressed during event
  let m = 1;
  switch (regime) {
    case 'First Cold Snap':
      // BIGGEST signal for this vertical — the "oh no, my car isn't ready" moment.
      if (sl === 'Synthetic Oil Change' || sl === 'Battery/Electrical') m = VH;
      else if (sl === 'Wiper Blades' || sl === 'Cooling System' || sl === 'Standard Oil Change') m = H;
      else m = M;
      break;
    case 'Cold Snap':
      if (sl === 'Synthetic Oil Change') m = VH;
      else if (sl === 'Battery/Electrical' || sl === 'Wiper Blades') m = H;
      else if (sl === 'Cooling System' || sl === 'Standard Oil Change') m = M;
      else m = 0.9;
      break;
    case 'Heat Wave':
      if (sl === 'Cooling System') m = VH;
      else if (sl === 'Battery/Electrical') m = H;
      else if (sl === 'Air Filtration' || sl === 'Standard Oil Change' || sl === 'Synthetic Oil Change') m = M;
      else m = 0.9;
      break;
    case 'First Warm Weekend':
      // Post-winter deferred-maintenance surge — all services run hot.
      if (sl === 'Tire Services' || sl === 'Standard Oil Change' || sl === 'Synthetic Oil Change') m = H;
      else m = 1.4;
      break;
    case 'Rainy Weekend':
      if (sl === 'Wiper Blades') m = VH;
      else if (sl === 'Standard Oil Change') m = L; // friction dominant — people defer
      else m = 0.82;
      break;
    case 'Snow Event':
      // Blend of pre-event "get ready" and during-event suppression.
      if (sl === 'Wiper Blades') m = VH;
      else if (sl === 'Battery/Electrical' || sl === 'Synthetic Oil Change') m = H;
      else if (sl === 'Standard Oil Change') m = M; // deferred pent-up demand
      else m = SUP;
      break;
    case 'Severe Storm':
      m = SUP; // during: suppress all (post-event deferred capture handled downstream)
      break;
    case 'High UV':
      // Road-trip season checkups.
      if (sl === 'Cooling System' || sl === 'Air Filtration' || sl === 'Standard Oil Change' || sl === 'Synthetic Oil Change') m = M;
      else m = 1;
      break;
    case 'Poor Air Quality':
      if (sl === 'Air Filtration') m = VH; // cabin + engine air filter
      else m = 0.98;
      break;
    case 'Normal':
    default:
      if (sl === 'Standard Oil Change') m = M; // baseline maintenance rhythm
      else m = 1 + tempAnomaly * 0.008;
      break;
  }
  return Math.max(0.5, Math.min(1.9, m));
}

// Channel spend mix for auto services (share of digital/media budget). Google
// Search dominates; Email/CRM is cheap and high-ROI; Direct Mail runs DMA-specific
// coupon drops.
const CHANNEL_BASE_SPEND: Record<Channel, number> = {
  'Google Search': 5600, // 35-45% — dominant
  Meta: 2600, // 15-20%
  CTV: 2500, // 15-20%
  YouTube: 1200, // 5-10%
  'Direct Mail': 1800, // 10-15%, DMA-specific coupon drops
  'Email/CRM': 600, // 3-5%, low cost / high ROI
  'Programmatic Display': 950, // 5-8%
};

const CHANNEL_FUNNEL: Record<Channel, FunnelStage> = {
  'Google Search': 'BOF', // dominant BOF for this vertical
  Meta: 'MOF',
  YouTube: 'TOF',
  CTV: 'TOF',
  'Direct Mail': 'Retention', // reactivation / coupon drops
  'Email/CRM': 'Retention',
  'Programmatic Display': 'MOF',
};

export const CHANNEL_FUNNEL_MAP = CHANNEL_FUNNEL;

let _media: MediaObservation[] | null = null;

export function generateMedia(dmas: DMA[], days = HISTORY_DAYS): MediaObservation[] {
  if (_media) return _media;
  const out: MediaObservation[] = [];
  for (const dma of dmas) {
    const weather = generateWeatherForDMA(dma, days);
    const popFactor = dma.population / 2_000_000;
    for (const w of weather) {
      for (const channel of CHANNELS) {
        const r = mulberry32(hashSeed(`media-${dma.id}-${channel}-${w.date}`));
        const spend = Math.round(CHANNEL_BASE_SPEND[channel] * popFactor * (0.8 + r() * 0.5));
        const cpm = 6 + r() * 14;
        const impressions = Math.round((spend / cpm) * 1000);
        const ctr = 0.008 + r() * 0.02;
        const clicks = Math.round(impressions * ctr);
        const cvr = 0.02 + r() * 0.05;
        // Direct Mail and Email carry coupon/offer creative on most impressions.
        const couponShare =
          channel === 'Direct Mail' ? 1 : channel === 'Email/CRM' ? 0.8 : 0.15 + r() * 0.2;
        out.push({
          date: w.date,
          dma: dma.id,
          channel,
          funnel_stage: CHANNEL_FUNNEL[channel],
          spend,
          impressions,
          clicks,
          bookings: Math.round(clicks * cvr),
          coupon_impressions: Math.round(impressions * couponShare),
        });
      }
    }
  }
  _media = out;
  return out;
}

const PROMO_NAMES = [
  'Winter-Prep Coupon Drop',
  'Spring Maintenance Mailer',
  'Synthetic Upgrade Offer',
  'Loyalty Reactivation',
  'Cooling System Check Bundle',
  'Storm-Ready Reminder',
];
const PROMO_TYPES: PromoType[] = ['Coupon', 'Digital Offer', 'Loyalty Bonus', 'Bundle'];
const DISTRIBUTION_METHODS: DistributionMethod[] = ['Direct Mail', 'Digital', 'In-Store'];

export function generatePromo(dmas: DMA[], days = HISTORY_DAYS): PromoObservation[] {
  const out: PromoObservation[] = [];
  const rand = mulberry32(hashSeed('promo'));
  for (const dma of dmas) {
    const weather = generateWeatherForDMA(dma, days);
    for (const w of weather) {
      if (rand() < 0.06) {
        // Direct-mail coupons are core to auto-services marketing — weight toward mail.
        const promoType: PromoType = rand() < 0.55 ? 'Coupon' : pick(rand, PROMO_TYPES);
        const distribution: DistributionMethod =
          promoType === 'Coupon' && rand() < 0.7 ? 'Direct Mail' : pick(rand, DISTRIBUTION_METHODS);
        out.push({
          date: w.date,
          dma: dma.id,
          promo_name: pick(rand, PROMO_NAMES),
          promo_type: promoType,
          discount_level: Math.round((0.1 + rand() * 0.3) * 100) / 100,
          service_line: pick(rand, SERVICE_LINES),
          distribution_method: distribution,
        });
      }
    }
  }
  return out;
}

/** Service-network capacity per DMA — the operational constraint on demand capture. */
export function generateCapacity(dmas: DMA[], days = HISTORY_DAYS): CapacityObservation[] {
  const out: CapacityObservation[] = [];
  for (const dma of dmas) {
    const weather = generateWeatherForDMA(dma, days);
    const bays = dma.locationCount * 3; // ~3 service bays per location
    for (const w of weather) {
      const r = mulberry32(hashSeed(`cap-${dma.id}-${w.date}`));
      // High-relevance weather + strong demand pushes utilization up.
      const demandPressure = categoryWeatherMultiplier('Standard Oil Change', w.regime, w.temp_anomaly);
      const utilization = Math.min(1, 0.45 + (demandPressure - 1) * 0.6 + r() * 0.25);
      let status: CapacityStatus = 'Healthy';
      if (utilization > 0.92) status = 'Maxed';
      else if (utilization > 0.78) status = 'Constrained';
      const wait = Math.round(utilization * utilization * 60 + r() * 8);
      out.push({
        date: w.date,
        dma: dma.id,
        service_bays_available: Math.max(0, Math.round(bays * (1 - utilization))),
        avg_wait_time_minutes: wait,
        capacity_status: status,
        utilization: Math.round(utilization * 100) / 100,
      });
    }
  }
  return out;
}

const MESSAGE_ANGLES = [
  'Pre-winter prep urgency',
  'Cold start protection',
  'Heat check — protect your engine',
  'Wiper blade urgency',
  'Get storm-ready now',
  'Cabin air filter refresh',
  'Spring maintenance season is here',
  'Road trip ready',
  'Schedule before the storm',
  'Stay on schedule',
];
const FORMATS: CreativeFormat[] = ['Static', 'Video', 'Carousel', 'UGC', 'Story'];

export function generateCreative(): CreativeObservation[] {
  const out: CreativeObservation[] = [];
  const rand = mulberry32(hashSeed('creative'));
  for (let i = 0; i < 60; i++) {
    const channel = pick(rand, CHANNELS);
    out.push({
      creative_id: `CR-${String(i + 1).padStart(3, '0')}`,
      channel,
      funnel_stage: CHANNEL_FUNNEL[channel],
      message_angle: pick(rand, MESSAGE_ANGLES),
      service_line: pick(rand, SERVICE_LINES),
      format: pick(rand, FORMATS),
      launch_date: dateStr(addDays(DEMO_TODAY, -Math.floor(rand() * HISTORY_DAYS))),
    });
  }
  return out;
}
