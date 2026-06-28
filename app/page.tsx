import { getAllRecommendations, getDMASnapshots } from '@/lib/derive';
import { MetricCard, SectionCard, fmtCurrency } from '@/components/ui';
import { RecommendationFeed, FunnelTimingCard } from '@/components/cards';
import { Action } from '@/lib/types';

export default function CommandCenter() {
  const recs = getAllRecommendations();
  const snaps = getDMASnapshots();

  const totalOpportunity = recs.reduce((s, r) => s + Math.max(0, r.expectedRevenueLift), 0);
  const reallocation = recs.reduce((s, r) => s + r.recommendedBudgetShift, 0);
  const highOpp = recs.filter((r) => r.opportunityScore >= 60).length;
  const suppressHold = recs.filter((r) => r.action === 'Suppress' || r.action === 'Ignore').length;
  const marginImpact = recs.reduce((s, r) => s + r.expectedMarginImpact, 0);
  const avgConfidence = recs.reduce((s, r) => s + r.confidence, 0) / recs.length;

  const actionCounts = (['Act', 'Test', 'Monitor', 'Ignore', 'Suppress'] as Action[]).map((a) => ({
    action: a,
    count: recs.filter((r) => r.action === a).length,
  }));

  const topActions = recs.filter((r) => r.action === 'Act' || r.action === 'Test').slice(0, 5);
  const topWeatherWindows = [...snaps].sort((a, b) => b.triggerIndex - a.triggerIndex).slice(0, 5);

  const channelMix: Record<string, number> = {};
  for (const r of recs) {
    if (r.action === 'Act' || r.action === 'Test') {
      channelMix[r.topChannel] = (channelMix[r.topChannel] ?? 0) + r.recommendedBudgetShift;
    }
  }
  const channelMixSorted = Object.entries(channelMix).sort((a, b) => b[1] - a[1]);
  const channelTotal = channelMixSorted.reduce((s, [, v]) => s + v, 0) || 1;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Forecast Incremental Opportunity" value={fmtCurrency(totalOpportunity)} sub="Next 14-day window" accent />
        <MetricCard label="Recommended Reallocation" value={fmtCurrency(reallocation)} sub="Marginal budget shift" trend="up" />
        <MetricCard label="High-Opportunity DMAs" value={String(highOpp)} sub={`of ${recs.length} markets`} />
        <MetricCard label="Suppress / Hold DMAs" value={String(suppressHold)} sub="Protect efficiency" trend="down" />
        <MetricCard label="Expected Revenue Lift" value={`${fmtCurrency(totalOpportunity * 0.85)}–${fmtCurrency(totalOpportunity * 1.15)}`} sub="Confidence band" />
        <MetricCard label="Contribution Margin Impact" value={fmtCurrency(marginImpact)} sub="At ~42% blended margin" trend="up" />
        <MetricCard label="Overall Confidence" value={`${Math.round(avgConfidence * 100)}%`} sub="Model-weighted" />
        <MetricCard label="Active Weather Regimes" value={String(new Set(snaps.map((s) => s.latestWeather.regime)).size)} sub="Across portfolio" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <SectionCard title="Top Recommended Actions" subtitle="Ranked by opportunity — only Act/Test surfaced">
          <RecommendationFeed recs={topActions} />
        </SectionCard>

        <SectionCard title="Top Weather-Driven Demand Windows" subtitle="Highest category trigger right now">
          <div className="space-y-2.5">
            {topWeatherWindows.map((s) => (
              <div key={s.dma.id} className="flex items-center justify-between gap-3 border-b py-2 last:border-0">
                <div>
                  <div className="text-sm font-medium">{s.dma.name}</div>
                  <div className="text-xs text-muted">{s.latestWeather.regime} · {s.primaryCategory}</div>
                </div>
                <div className="text-right">
                  <div className="tabular text-sm font-semibold text-[var(--accent)]">{s.triggerIndex}</div>
                  <div className="text-[10px] uppercase tracking-wide text-muted">trigger</div>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Action Classification" subtitle="Portfolio decision breakdown">
          <div className="space-y-3">
            {actionCounts.map((a) => {
              const pct = Math.round((a.count / recs.length) * 100);
              const color =
                a.action === 'Act' ? 'var(--positive)' : a.action === 'Test' ? 'var(--accent)' : a.action === 'Monitor' ? 'var(--warning)' : a.action === 'Suppress' ? 'var(--negative)' : 'var(--muted)';
              return (
                <div key={a.action}>
                  <div className="flex justify-between text-xs">
                    <span>{a.action}</span>
                    <span className="tabular text-muted">{a.count} ({pct}%)</span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Channel Mix Recommendation" subtitle="Where the recommended marginal budget should flow">
        <div className="space-y-2.5">
          {channelMixSorted.map(([ch, val]) => {
            const pct = Math.round((val / channelTotal) * 100);
            return (
              <div key={ch} className="flex items-center gap-3">
                <div className="w-32 shrink-0 text-sm">{ch}</div>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-2)]">
                  <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${pct}%` }} />
                </div>
                <div className="w-24 shrink-0 text-right tabular text-sm text-muted">{fmtCurrency(val)}</div>
              </div>
            );
          })}
        </div>
      </SectionCard>

      <div>
        <h2 className="mb-3 text-sm font-semibold">Full-Funnel Timing Plan</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <FunnelTimingCard phase="pre" stages={['TOF', 'MOF']} channels={['TikTok', 'YouTube', 'CTV', 'Meta']} guidance="Ahead of a forecasted weather event, build awareness and consideration so demand converts when the regime hits. Prime audiences 3–5 days out." />
          <FunnelTimingCard phase="during" stages={['BOF']} channels={['Google Search', 'Amazon/RMN', 'Meta']} guidance="During the event, harvest intent: bid up category + 'near me' search, push RMN and retargeting. This is where weather-driven demand actually converts." />
          <FunnelTimingCard phase="post" stages={['Retention']} channels={['Email/CRM', 'Meta']} guidance="After the window, convert new buyers into repeat customers with lifecycle flows and replenishment messaging to extend the weather-driven cohort's value." />
        </div>
      </div>
    </div>
  );
}
