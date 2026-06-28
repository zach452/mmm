import { generateDMAs } from '@/lib/mockData';
import { getRecentDemandByDMA } from '@/lib/derive';
import Experiments from '@/components/Experiments';

export default function ExperimentsPage() {
  const dmas = generateDMAs();
  const recentDemand = getRecentDemandByDMA();
  return <Experiments dmas={dmas} recentDemand={recentDemand} />;
}
