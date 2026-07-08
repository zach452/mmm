/**
 * Market Windows feed for the Executive Command Center.
 *
 * Scans each DMA's forecast for the next auto-service demand window (an upcoming
 * urgency regime, or an ongoing one right now) and produces real event-timing
 * language: which service lines the window opens, the pre/during/post timing
 * stance, and the recommended channels.
 */
import type { DMASnapshot } from './derive';
import type { ServiceLine, WeatherForecast, WeatherRegime } from './types';

export interface MarketWindow {
  dma: string;
  dmaName: string;
  regime: WeatherRegime;
  timing: 'ongoing' | 'approaching';
  horizonDays: number; // 0 = ongoing/now
  serviceLines: ServiceLine[];
  channels: string;
  headline: string;
  urgency: number;
}

const URGENCY_REGIMES: WeatherRegime[] = [
  'First Cold Snap',
  'Cold Snap',
  'Heat Wave',
  'Snow Event',
  'Severe Storm',
  'Rainy Weekend',
  'First Warm Weekend',
  'Poor Air Quality',
];

const SERVICE_LINES_BY_REGIME: Record<WeatherRegime, ServiceLine[]> = {
  'First Cold Snap': ['Battery/Electrical', 'Synthetic Oil Change', 'Wiper Blades'],
  'Cold Snap': ['Synthetic Oil Change', 'Battery/Electrical', 'Wiper Blades'],
  'Heat Wave': ['Cooling System', 'Battery/Electrical'],
  'Snow Event': ['Wiper Blades', 'Battery/Electrical', 'Synthetic Oil Change'],
  'Severe Storm': ['Standard Oil Change', 'Synthetic Oil Change'],
  'Rainy Weekend': ['Wiper Blades'],
  'First Warm Weekend': ['Tire Services', 'Standard Oil Change', 'Synthetic Oil Change'],
  'High UV': ['Cooling System', 'Air Filtration'],
  'Poor Air Quality': ['Air Filtration'],
  Normal: ['Standard Oil Change'],
};

const CHANNELS_BY_REGIME: Record<WeatherRegime, string> = {
  'First Cold Snap': 'pre-event paid Search + CTV, then Email/Direct Mail offer',
  'Cold Snap': 'paid Search + CTV, Email reactivation',
  'Heat Wave': 'Search + Meta in market',
  'Snow Event': 'Search on, pause Display, Email scheduling reminders',
  'Severe Storm': 'hold paid; Email post-storm scheduling',
  'Rainy Weekend': 'Search + Meta wiper offers',
  'First Warm Weekend': 'Search + Meta retargeting + Email win-back',
  'High UV': 'Search + Programmatic road-trip creative',
  'Poor Air Quality': 'Search + Email cabin-filter reminder',
  Normal: 'Direct Mail / Email loyalty reactivation',
};

export function buildMarketWindows(
  snapshots: DMASnapshot[],
  forecasts: WeatherForecast[],
): MarketWindow[] {
  const forecastByDma = new Map<string, WeatherForecast[]>();
  for (const f of forecasts) {
    const arr = forecastByDma.get(f.dma) ?? [];
    arr.push(f);
    forecastByDma.set(f.dma, arr);
  }

  const windows: MarketWindow[] = [];
  for (const s of snapshots) {
    const current = s.latestWeather.regime;
    let regime: WeatherRegime | null = null;
    let timing: MarketWindow['timing'] = 'ongoing';
    let horizonDays = 0;

    if (URGENCY_REGIMES.includes(current)) {
      regime = current;
      timing = 'ongoing';
      horizonDays = 0;
    } else {
      const fc = (forecastByDma.get(s.dma.id) ?? []).sort((a, b) => a.horizonDays - b.horizonDays);
      const next = fc.find((f) => URGENCY_REGIMES.includes(f.regime));
      if (next) {
        regime = next.regime;
        timing = 'approaching';
        horizonDays = next.horizonDays;
      }
    }
    if (!regime) continue;

    const serviceLines = SERVICE_LINES_BY_REGIME[regime] ?? SERVICE_LINES_BY_REGIME.Normal;
    const channels = CHANNELS_BY_REGIME[regime] ?? CHANNELS_BY_REGIME.Normal;
    const slLabel = serviceLines.slice(0, 2).map(shortName).join('/');
    const whenLabel =
      timing === 'ongoing'
        ? `${regime} ongoing`
        : `${regime} in ${horizonDays} day${horizonDays === 1 ? '' : 's'}`;
    const headline = `${s.dma.name} DMA — ${whenLabel} — ${slLabel} window ${timing === 'ongoing' ? 'live' : 'opens'} — ${channels}`;

    windows.push({
      dma: s.dma.id,
      dmaName: s.dma.name,
      regime,
      timing,
      horizonDays,
      serviceLines,
      channels,
      headline,
      urgency: s.recommendation.urgency + (timing === 'approaching' ? Math.max(0, 10 - horizonDays) : 12),
    });
  }

  return windows.sort((a, b) => b.urgency - a.urgency);
}

function shortName(sl: ServiceLine): string {
  switch (sl) {
    case 'Synthetic Oil Change':
      return 'Synthetic';
    case 'Standard Oil Change':
      return 'Oil Change';
    case 'Battery/Electrical':
      return 'Battery';
    case 'Cooling System':
      return 'Cooling';
    case 'Wiper Blades':
      return 'Wipers';
    case 'Tire Services':
      return 'Tires';
    case 'Air Filtration':
      return 'Air Filter';
    default:
      return sl;
  }
}
