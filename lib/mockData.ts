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
  Channel,
  CreativeFormat,
  CreativeObservation,
  DMA,
  FunnelStage,
  InventoryObservation,
  InventoryStatus,
  MediaObservation,
  ProductCategory,
  PromoObservation,
  Region,
  SalesObservation,
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

export const PRODUCT_CATEGORIES: ProductCategory[] = [
  'At-Home Beauty',
  'Outerwear',
  'Footwear',
  'Hydration',
  'Baby Care',
  'Wellness',
];

export const CHANNELS: Channel[] = [
  'Meta',
  'Google Search',
  'TikTok',
  'YouTube',
  'CTV',
  'Pinterest',
  'Amazon/RMN',
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
      dmas.push({
        id: `DMA-${String(counter).padStart(3, '0')}`,
        name: city,
        region,
        population: Math.round((300_000 + rand() * 8_000_000) / 1000) * 1000,
        baselineIndex: Math.round((85 + rand() * 35) * 10) / 10,
        lat,
        lon,
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

// Category baseline demand weights and weather sensitivity used by sales generator.
const CATEGORY_BASE_REVENUE: Record<ProductCategory, number> = {
  'At-Home Beauty': 42000,
  Outerwear: 38000,
  Footwear: 35000,
  Hydration: 28000,
  'Baby Care': 30000,
  Wellness: 33000,
};

let _sales: SalesObservation[] | null = null;

export function generateSales(dmas: DMA[], days = HISTORY_DAYS): SalesObservation[] {
  if (_sales) return _sales;
  const out: SalesObservation[] = [];
  for (const dma of dmas) {
    const weather = generateWeatherForDMA(dma, days);
    const rand = mulberry32(hashSeed(`sales-${dma.id}`));
    const popFactor = dma.population / 2_000_000;
    for (const w of weather) {
      for (const cat of PRODUCT_CATEGORIES) {
        const catSeed = mulberry32(hashSeed(`sales-${dma.id}-${cat}-${w.date}`));
        const trigger = categoryWeatherMultiplier(cat, w.regime, w.temp_anomaly);
        const baseRev = CATEGORY_BASE_REVENUE[cat] * popFactor * (dma.baselineIndex / 100);
        const revenue = Math.round(baseRev * trigger * (0.85 + catSeed() * 0.3));
        const aov = 55 + catSeed() * 40;
        const orders = Math.max(0, Math.round(revenue / aov));
        const newShare = 0.35 + catSeed() * 0.25;
        out.push({
          date: w.date,
          dma: dma.id,
          product_category: cat,
          revenue,
          orders,
          new_customers: Math.round(orders * newShare),
          returning_customers: Math.round(orders * (1 - newShare)),
          margin: Math.round((0.35 + catSeed() * 0.2) * 100) / 100,
        });
      }
    }
    void rand;
  }
  _sales = out;
  return out;
}

/** Weather multiplier on category demand (~0.6 - 1.8). Mirrors modeling triggerIndex intent. */
export function categoryWeatherMultiplier(
  cat: ProductCategory,
  regime: WeatherRegime,
  tempAnomaly: number,
): number {
  let m = 1;
  switch (cat) {
    case 'Outerwear':
      if (regime === 'Cold Snap' || regime === 'First Cold Snap') m = 1.7;
      else if (regime === 'Snow Event') m = 1.6;
      else if (regime === 'Heat Wave') m = 0.6;
      else m = 1 - tempAnomaly * 0.02;
      break;
    case 'Hydration':
      if (regime === 'Heat Wave') m = 1.8;
      else if (regime === 'High UV') m = 1.4;
      else if (regime === 'Cold Snap') m = 0.7;
      else m = 1 + tempAnomaly * 0.02;
      break;
    case 'At-Home Beauty':
      if (regime === 'Rainy Weekend' || regime === 'Snow Event') m = 1.5;
      else if (regime === 'Severe Storm') m = 1.45;
      else m = 1.05;
      break;
    case 'Wellness':
      if (regime === 'Poor Air Quality') m = 1.6;
      else if (regime === 'Cold Snap' || regime === 'First Cold Snap') m = 1.35;
      else m = 1.05;
      break;
    case 'Footwear':
      if (regime === 'First Warm Weekend') m = 1.4;
      else if (regime === 'Rainy Weekend') m = 1.2;
      else if (regime === 'Heat Wave') m = 0.9;
      else m = 1 + tempAnomaly * 0.01;
      break;
    case 'Baby Care':
      // weather-insensitive
      m = 1 + tempAnomaly * 0.004;
      break;
  }
  return Math.max(0.5, Math.min(1.9, m));
}

const CHANNEL_BASE_SPEND: Record<Channel, number> = {
  Meta: 4200,
  'Google Search': 3800,
  TikTok: 2400,
  YouTube: 1900,
  CTV: 2200,
  Pinterest: 1100,
  'Amazon/RMN': 2600,
};

const CHANNEL_FUNNEL: Record<Channel, FunnelStage> = {
  Meta: 'MOF',
  'Google Search': 'BOF',
  TikTok: 'TOF',
  YouTube: 'TOF',
  CTV: 'TOF',
  Pinterest: 'MOF',
  'Amazon/RMN': 'BOF',
};

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
        out.push({
          date: w.date,
          dma: dma.id,
          channel,
          funnel_stage: CHANNEL_FUNNEL[channel],
          spend,
          impressions,
          clicks,
          conversions: Math.round(clicks * cvr),
        });
      }
    }
  }
  _media = out;
  return out;
}

const PROMO_NAMES = ['Spring Refresh', 'Summer Kickoff', 'Flash Sale', 'Loyalty Bonus', 'Clearance Event', 'Bundle Deal'];

export function generatePromo(dmas: DMA[], days = HISTORY_DAYS): PromoObservation[] {
  const out: PromoObservation[] = [];
  const rand = mulberry32(hashSeed('promo'));
  for (const dma of dmas) {
    const weather = generateWeatherForDMA(dma, days);
    for (const w of weather) {
      if (rand() < 0.06) {
        out.push({
          date: w.date,
          dma: dma.id,
          promo_name: pick(rand, PROMO_NAMES),
          discount_level: Math.round((0.1 + rand() * 0.3) * 100) / 100,
          product_category: pick(rand, PRODUCT_CATEGORIES),
        });
      }
    }
  }
  return out;
}

export function generateInventory(dmas: DMA[], days = HISTORY_DAYS): InventoryObservation[] {
  const out: InventoryObservation[] = [];
  for (const dma of dmas) {
    const weather = generateWeatherForDMA(dma, days);
    for (const w of weather) {
      for (const cat of PRODUCT_CATEGORIES) {
        const r = mulberry32(hashSeed(`inv-${dma.id}-${cat}-${w.date}`));
        const roll = r();
        let status: InventoryStatus = 'Healthy';
        let stock = 0.7 + r() * 0.3;
        if (roll < 0.05) {
          status = 'Out of Stock';
          stock = 0;
        } else if (roll < 0.15) {
          status = 'Constrained';
          stock = 0.2 + r() * 0.2;
        }
        out.push({
          date: w.date,
          dma: dma.id,
          product_category: cat,
          inventory_status: status,
          stock_level: Math.round(stock * 100) / 100,
        });
      }
    }
  }
  return out;
}

const MESSAGE_ANGLES = [
  'Cold snap urgency',
  'Heat relief',
  'Rainy-day comfort',
  'UV protection',
  'Indoor day / stay-home',
  'Family-at-home',
  'Seasonal transition',
  'Product education',
  'Retail availability',
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
      product_category: pick(rand, PRODUCT_CATEGORIES),
      format: pick(rand, FORMATS),
      launch_date: dateStr(addDays(DEMO_TODAY, -Math.floor(rand() * HISTORY_DAYS))),
    });
  }
  return out;
}
