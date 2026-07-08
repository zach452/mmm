import {
  getDecompositionSeries,
  getDMASnapshots,
  getHierarchicalIncrementality,
  getSyntheticControl,
} from '@/lib/derive';
import { channelHalfSaturation, estimateWeatherMediaInteraction } from '@/lib/modeling';
import GeoClient, { GeoRow } from '@/components/GeoClient';
import { Channel } from '@/lib/types';

const CURVE_CHANNELS: Channel[] = ['Google Search', 'Meta', 'CTV', 'Direct Mail'];

export default function GeoPage() {
  const snaps = getDMASnapshots();
  const shrunk = getHierarchicalIncrementality();
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
        halfSaturation: channelHalfSaturation(channel, baseSpend),
        maxResponse: baseline * 0.4,
        currentSpend: baseSpend,
        interactionMultiplier: interaction,
      };
    });
    const h = shrunk.get(s.dma.id);
    const sc = getSyntheticControl(s.dma.id, s.primaryServiceLine, 60);
    return {
      rec: s.recommendation,
      temperature: s.latestWeather.temperature,
      tempAnomaly: s.latestWeather.temp_anomaly,
      indoorIndex: s.indoorIndex,
      triggerIndex: s.triggerIndex,
      decomposition: s.decomposition,
      decompSeries: getDecompositionSeries(s.dma, s.primaryServiceLine, 45),
      channelCurves,
      population: s.dma.population,
      locationCount: s.dma.locationCount,
      locationDensity: s.dma.locationDensity,
      capacityStatus: s.capacityStatus,
      hierarchical: h
        ? {
            n: h.n,
            raw: h.rawEstimate,
            shrunk: h.shrunkEstimate,
            weight: h.shrinkageWeight,
            grandMean: h.grandMean,
            ciLower: h.credibleInterval.lower,
            ciUpper: h.credibleInterval.upper,
          }
        : null,
      syntheticControl: {
        weights: sc.weights,
        observed: sc.observed,
        counterfactual: sc.counterfactual,
        dates: sc.dates,
        treatmentStartIndex: sc.treatmentStartIndex,
        cumulativeLift: sc.cumulativeLift,
        preRmse: sc.preRmse,
      },
    };
  });

  return <GeoClient rows={rows} />;
}
