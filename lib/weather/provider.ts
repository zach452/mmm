/**
 * Weather provider abstraction.
 *
 * The app's modeling layer only consumes WeatherObservation / WeatherForecast
 * (see lib/types.ts). A WeatherProvider is the seam between "where the weather
 * comes from" and "how it's modeled" — swap the implementation (mock vs live
 * API) without touching the modeling functions.
 */
import { DMA, WeatherForecast, WeatherObservation } from '../types';

export interface WeatherProvider {
  /** Latest known/current conditions for a DMA. */
  getCurrentConditions(dma: DMA): Promise<WeatherObservation>;
  /** Forward-looking daily forecast for a DMA. */
  getForecast(dma: DMA, days: number): Promise<WeatherForecast[]>;
}
