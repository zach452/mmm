/**
 * MockWeatherProvider — wraps the existing seeded mock generators so the default
 * demo behavior is unchanged. This is the provider used when WEATHER_PROVIDER is
 * unset or 'mock'.
 */
import { DMA, WeatherForecast, WeatherObservation } from '../types';
import {
  generateWeatherForDMA,
  generateWeatherForecast,
  HISTORY_DAYS,
} from '../mockData';
import { WeatherProvider } from './provider';

export class MockWeatherProvider implements WeatherProvider {
  async getCurrentConditions(dma: DMA): Promise<WeatherObservation> {
    const hist = generateWeatherForDMA(dma, HISTORY_DAYS);
    return hist[hist.length - 1];
  }

  async getForecast(dma: DMA, days: number): Promise<WeatherForecast[]> {
    return generateWeatherForecast([dma], days).filter((f) => f.dma === dma.id);
  }
}
