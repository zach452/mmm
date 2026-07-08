import { getDMASnapshots } from '@/lib/derive';
import { channelHalfSaturation, estimateWeatherMediaInteraction, OptimizerOpportunity } from '@/lib/modeling';
import { calibrateHillCurve } from '@/lib/modeling/calibration';
import { generateDMAs, generateMedia } from '@/lib/mockData';
import Optimizer, { ChannelCalibration } from '@/components/Optimizer';
import { Channel } from '@/lib/types';

const OPT_CHANNELS: Channel[] = ['Google Search', 'Meta', 'CTV', 'Direct Mail', 'Email/CRM'];

// Calibrate a Hill curve per channel from the historical media spend → conversions
// (the mock media observations). Runs server-side; results are shown in the UI and
// can be applied to the optimizer instead of the hardcoded defaults.
function calibrateChannels(): Record<string, ChannelCalibration> {
  const media = generateMedia(generateDMAs());
  const byChannel = new Map<Channel, { spend: number; conversions: number }[]>();
  for (const m of media) {
    const arr = byChannel.get(m.channel) ?? [];
    arr.push({ spend: m.spend, conversions: m.bookings });
    byChannel.set(m.channel, arr);
  }
  const out: Record<string, ChannelCalibration> = {};
  for (const channel of OPT_CHANNELS) {
    const obs = byChannel.get(channel) ?? [];
    const fit = calibrateHillCurve(obs);
    out[channel] = {
      channel,
      halfSaturation: fit.halfSaturation,
      slope: fit.slope,
      r2: fit.r2,
      n: fit.n,
    };
  }
  return out;
}

export default function OptimizerPage() {
  const snaps = getDMASnapshots();
  const calibration = calibrateChannels();
  // Build opportunities: take top ~30 DMAs by opportunity, expand across channels.
  const top = [...snaps].sort((a, b) => b.recommendation.opportunityScore - a.recommendation.opportunityScore).slice(0, 30);
  const opportunities: OptimizerOpportunity[] = [];
  for (const s of top) {
    const baseSpend = Math.round((s.dma.population / 2_000_000) * 4000);
    const baseline = s.decomposition.baseline;
    for (const channel of OPT_CHANNELS) {
      const interaction = estimateWeatherMediaInteraction({ regime: s.latestWeather.regime, channel, funnel: 'MOF', triggerIndex: s.triggerIndex });
      opportunities.push({
        dma: s.dma.id,
        dmaName: s.dma.name,
        region: s.dma.region,
        channel,
        currentSpend: baseSpend,
        halfSaturation: channelHalfSaturation(channel, baseSpend),
        maxResponse: baseline * 0.4,
        slope: 1.3,
        interactionMultiplier: interaction,
        minSpend: baseSpend * 0.6,
        maxSpend: baseSpend * 1.5,
      });
    }
  }
  return <Optimizer opportunities={opportunities} calibration={calibration} />;
}
