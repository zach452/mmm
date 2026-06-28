import { getDecompositionSeries, getDMASnapshots } from '@/lib/derive';
import { estimateWeatherMediaInteraction } from '@/lib/modeling';
import GeoClient, { GeoRow } from '@/components/GeoClient';
import { Channel } from '@/lib/types';

const CURVE_CHANNELS: Channel[] = ['Meta', 'Google Search', 'TikTok', 'Amazon/RMN'];

export default function GeoPage() {
  const snaps = getDMASnapshots();
  const rows: GeoRow[] = snaps.map((s) => {
    const baseSpend = Math.round((s.dma.population / 2_000_000) * 4000);
    const baseline = s.decomposition.baseline;
    const channelCurves = CURVE_CHANNELS.map((channel) => {
      const interaction = estimateWeatherMediaInteraction({
        regime: s.latestWeather.regime,
        channel,
        funnel: 'MOF',
        triggerIndex: s.triggerIndex,
      });
      return {
        channel,
        halfSaturation: baseSpend * 1.1,
        maxResponse: baseline * 0.4,
        currentSpend: baseSpend,
        interactionMultiplier: interaction,
      };
    });
    return {
      rec: s.recommendation,
      temperature: s.latestWeather.temperature,
      tempAnomaly: s.latestWeather.temp_anomaly,
      indoorIndex: s.indoorIndex,
      triggerIndex: s.triggerIndex,
      decomposition: s.decomposition,
      decompSeries: getDecompositionSeries(s.dma, s.primaryCategory, 45),
      channelCurves,
      population: s.dma.population,
    };
  });

  return <GeoClient rows={rows} />;
}
