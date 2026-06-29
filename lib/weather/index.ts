/**
 * Weather provider selector.
 *
 * Reads WEATHER_PROVIDER from the environment:
 *   - 'live'  -> OpenMeteoWeatherProvider (real Open-Meteo API, no key required)
 *   - 'mock'  -> MockWeatherProvider (seeded deterministic demo data)
 *   - unset   -> defaults to 'mock' so the demo is deterministic out of the box
 *
 * No secrets are needed for either provider. See .env.example / README.
 */
import { MockWeatherProvider } from './mockProvider';
import { OpenMeteoWeatherProvider } from './openMeteoProvider';
import { WeatherProvider } from './provider';

export type WeatherProviderKind = 'mock' | 'live';

export function resolveProviderKind(
  raw = process.env.WEATHER_PROVIDER,
): WeatherProviderKind {
  return raw === 'live' ? 'live' : 'mock';
}

export function getWeatherProvider(
  kind: WeatherProviderKind = resolveProviderKind(),
): WeatherProvider {
  return kind === 'live' ? new OpenMeteoWeatherProvider() : new MockWeatherProvider();
}

export { MockWeatherProvider, OpenMeteoWeatherProvider };
export type { WeatherProvider };
