/**
 * OpenMeteoWeatherProvider — REAL weather via the free Open-Meteo API.
 *
 * Open-Meteo requires no API key, so this is safe to call with no secrets.
 * Endpoint:
 *   https://api.open-meteo.com/v1/forecast
 *     ?latitude=..&longitude=..
 *     &daily=temperature_2m_max,temperature_2m_min,precipitation_sum,snowfall_sum,uv_index_max,relative_humidity_2m_mean
 *     &timezone=auto
 *
 * Mapping to the app's WeatherObservation/WeatherForecast shape:
 *  - temperature      = mean of daily max/min (°C)
 *  - temp_anomaly     = temperature − seasonal norm (reuses seasonalTemp/calculateWeatherAnomaly)
 *  - precipitation    = precipitation_sum (mm)
 *  - snow             = snowfall_sum (cm)  [Open-Meteo returns cm]
 *  - humidity         = relative_humidity_2m_mean
 *  - uv_index         = uv_index_max
 *  - air_quality      = SYNTHETIC PROXY. The free Open-Meteo daily forecast endpoint
 *                       does NOT return AQI. A real implementation would call an air
 *                       quality API (Open-Meteo Air Quality API, OpenWeather AQ, or
 *                       AirNow — most require a key). We fall back to a deterministic
 *                       proxy derived from the DMA's climate.airQualityRisk so the
 *                       downstream Wellness/"Poor Air Quality" logic still functions.
 *  - severe_weather_flag = derived proxy from heavy precip / heavy snow thresholds,
 *                          since the daily endpoint has no severe-weather field.
 *  - regime           = deriveRegime(...) — the SAME function the mock provider uses.
 */
import { DMA, WeatherForecast, WeatherObservation, WeatherRegime } from '../types';
import { seasonalTemp, deriveRegime } from '../mockData';
import { calculateWeatherAnomaly } from '../modeling';
import { WeatherProvider } from './provider';

const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';
const DAILY_VARS =
  'temperature_2m_max,temperature_2m_min,precipitation_sum,snowfall_sum,uv_index_max,relative_humidity_2m_mean';

interface OpenMeteoDaily {
  time: string[];
  temperature_2m_max: number[];
  temperature_2m_min: number[];
  precipitation_sum: number[];
  snowfall_sum: number[];
  uv_index_max: number[];
  relative_humidity_2m_mean: number[];
}

interface OpenMeteoResponse {
  daily?: OpenMeteoDaily;
}

/**
 * Deterministic air-quality proxy. SYNTHETIC: see file header — a production
 * build would call a real AQ API (which requires a key). Scales the DMA's
 * climate risk into a plausible AQI, nudged by precipitation (rain clears air).
 */
function airQualityProxy(dma: DMA, precipitation: number): number {
  const base = 30 + dma.climate.airQualityRisk * 90;
  const rainCleanse = Math.min(20, precipitation * 1.5);
  return Math.round(Math.max(15, base - rainCleanse));
}

/** Severe-weather proxy from precipitation/snow thresholds (no severe field in daily endpoint). */
function severeProxy(precipitation: number, snow: number): boolean {
  return precipitation >= 30 || snow >= 10;
}

export class OpenMeteoWeatherProvider implements WeatherProvider {
  constructor(private fetchImpl: typeof fetch = fetch) {}

  private async fetchDaily(dma: DMA, forecastDays: number): Promise<OpenMeteoDaily> {
    const params = new URLSearchParams({
      latitude: String(dma.lat),
      longitude: String(dma.lon),
      daily: DAILY_VARS,
      timezone: 'auto',
      forecast_days: String(Math.max(1, Math.min(16, forecastDays))),
    });
    const res = await this.fetchImpl(`${OPEN_METEO_URL}?${params.toString()}`, {
      // Cache live data briefly so repeated index recomputes don't hammer the API.
      next: { revalidate: 1800 },
    });
    if (!res.ok) {
      throw new Error(`Open-Meteo request failed: ${res.status} ${res.statusText}`);
    }
    const json = (await res.json()) as OpenMeteoResponse;
    if (!json.daily || !json.daily.time?.length) {
      throw new Error('Open-Meteo response missing daily data');
    }
    return json.daily;
  }

  private mapDay(
    dma: DMA,
    daily: OpenMeteoDaily,
    i: number,
    prevWarm: boolean,
  ): WeatherObservation {
    const date = daily.time[i];
    const temperature =
      Math.round(((daily.temperature_2m_max[i] + daily.temperature_2m_min[i]) / 2) * 10) / 10;
    const precipitation = Math.round((daily.precipitation_sum[i] ?? 0) * 10) / 10;
    const snow = Math.round((daily.snowfall_sum[i] ?? 0) * 10) / 10;
    const humidity = Math.round(daily.relative_humidity_2m_mean[i] ?? 55);
    const uv_index = Math.round(daily.uv_index_max[i] ?? 0);
    const air_quality = airQualityProxy(dma, precipitation);
    const severe_weather_flag = severeProxy(precipitation, snow);

    // Anomaly vs the seasonal norm — same norm model the mock data uses, so
    // downstream indices are comparable across providers.
    const norm = seasonalTemp(dma, new Date(`${date}T00:00:00Z`));
    const anomaly = calculateWeatherAnomaly(
      { temperature, precipitation },
      { temperature: norm, precipitation: dma.climate.basePrecip },
    );

    const base = {
      date,
      dma: dma.id,
      temperature,
      temp_anomaly: anomaly.tempAnomaly,
      precipitation,
      snow,
      humidity: Math.min(100, Math.max(0, humidity)),
      uv_index: Math.max(0, uv_index),
      air_quality,
      severe_weather_flag,
    };
    const regime: WeatherRegime = deriveRegime(base, dma, prevWarm);
    return { ...base, regime };
  }

  async getCurrentConditions(dma: DMA): Promise<WeatherObservation> {
    const daily = await this.fetchDaily(dma, 1);
    return this.mapDay(dma, daily, 0, false);
  }

  async getForecast(dma: DMA, days: number): Promise<WeatherForecast[]> {
    const daily = await this.fetchDaily(dma, days + 1);
    const out: WeatherForecast[] = [];
    let prevWarmDays = 0;
    // index 0 is "today"; forecast horizon starts at day 1.
    for (let i = 1; i < daily.time.length && out.length < days; i++) {
      const obs = this.mapDay(dma, daily, i, prevWarmDays >= 2);
      if (obs.temperature > dma.climate.baseTempC) prevWarmDays++;
      else prevWarmDays = 0;
      const horizonDays = i;
      out.push({
        ...obs,
        horizonDays,
        // Real forecasts lose confidence with horizon; mirror the mock decay curve.
        confidence: Math.round((0.95 - horizonDays * 0.035) * 100) / 100,
      });
    }
    return out;
  }
}
