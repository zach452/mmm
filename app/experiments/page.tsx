import { generateDMAs } from '@/lib/mockData';
import { getAllRecommendations, getRecentDemandByDMA } from '@/lib/derive';
import Experiments from '@/components/Experiments';

export default function ExperimentsPage() {
  const dmas = generateDMAs();
  const recentDemand = getRecentDemandByDMA();
  const recommendations = getAllRecommendations();
  return <Experiments dmas={dmas} recentDemand={recentDemand} recommendations={recommendations} />;
}
