import { getDMASnapshots } from '@/lib/derive';
import Simulator, { SimDMA } from '@/components/Simulator';

export default function SimulatorPage() {
  const snaps = getDMASnapshots();
  const dmas: SimDMA[] = snaps.map((s) => ({
    id: s.dma.id,
    name: s.dma.name,
    region: s.dma.region,
    baseline: s.decomposition.baseline,
  }));
  return <Simulator dmas={dmas} />;
}
