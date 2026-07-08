import { getDMASnapshots } from '@/lib/derive';
import { generateCreativeBrief } from '@/lib/modeling';
import { CreativeBriefCard } from '@/components/cards';
import { SectionCard } from '@/components/ui';

export default function CreativePage() {
  const snaps = getDMASnapshots();
  // Top weather-driven clusters that are actionable (not Suppress/Ignore-only)
  const clusters = [...snaps]
    .filter((s) => s.recommendation.action === 'Act' || s.recommendation.action === 'Test' || s.triggerIndex > 60)
    .sort((a, b) => b.triggerIndex - a.triggerIndex)
    .slice(0, 9);

  const briefs = clusters.map((s) =>
    generateCreativeBrief({
      dma: s.dma,
      regime: s.latestWeather.regime,
      serviceLine: s.primaryServiceLine,
      indoorIndex: s.indoorIndex,
    }),
  );

  return (
    <div className="space-y-6">
      <SectionCard title="Creative Activation Briefs" subtitle="Auto-generated for the highest weather-driven DMA × service-line clusters. Message angles drawn from the auto-services weather taxonomy.">
        <p className="text-sm leading-relaxed text-muted">
          Each brief translates the current weather regime and driver mindset into a ready-to-brief creative direction:
          message angle, hooks, CTA, a suggested direct-mail coupon offer, landing page, per-channel/funnel guidance, and a
          measurement plan. Google Search is always the bottom-of-funnel workhorse; CTV/YouTube prime the window pre-event.
        </p>
      </SectionCard>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {briefs.map((b) => (
          <CreativeBriefCard key={b.id} brief={b} />
        ))}
      </div>
    </div>
  );
}
