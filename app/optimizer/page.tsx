import { getDMASnapshots } from '@/lib/derive';
import { estimateWeatherMediaInteraction, OptimizerOpportunity } from '@/lib/modeling';
import Optimizer from '@/components/Optimizer';
import { Channel } from '@/lib/types';

const OPT_CHANNELS: Channel[] = ['Meta', 'Google Search', 'TikTok', 'Amazon/RMN', 'CTV'];

export default function OptimizerPage() {
  const snaps = getDMASnapshots();
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
        halfSaturation: baseSpend * 1.1,
        maxResponse: baseline * 0.4,
        slope: 1.3,
        interactionMultiplier: interaction,
        minSpend: baseSpend * 0.6,
        maxSpend: baseSpend * 1.5,
      });
    }
  }
  return <Optimizer opportunities={opportunities} />;
}
