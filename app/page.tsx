import { getAllRecommendations, getDMASnapshots } from '@/lib/derive';
import { generateDMAs, generateWeatherForecast } from '@/lib/mockData';
import { MetricCard, SectionCard, fmtCurrency, Pill } from '@/components/ui';
import { RecommendationFeed, FunnelTimingCard } from '@/components/cards';
import { Action } from '@/lib/types';
import { buildMarketWindows, type MarketWindow } from '@/lib/marketWindows';

export default function CommandCenter() {
  const recs = getAllRecommendations();
  const snaps = getDMASnapshots();
  const forecasts = generateWeatherForecast(generateDMAs());
  const marketWindows = buildMarketWindows(snaps, forecasts).slice(0, 6);

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

  const winParts = summarizeWindows(marketWindows);

  return (
    <div className="space-y-6">
      {marketWindows.length > 0 && (
        <div className="rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-4 py-3 text-sm">
          <strong className="text-foreground">{winParts.count} DMAs entering a service-demand window</strong>
          {winParts.leadNote}
        </div>
      )}

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

        <SectionCard title="Top Weather-Driven Demand Windows" subtitle="Highest service trigger right now">
          <div className="space-y-2.5">
            {topWeatherWindows.map((s) => (
              <div key={s.dma.id} className="flex items-center justify-between gap-3 border-b py-2 last:border-0">
                <div>
                  <div className="text-sm font-medium">{s.dma.name}</div>
                  <div className="text-xs text-muted">{s.latestWeather.regime} · {s.primaryServiceLine}</div>
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

      <SectionCard title="Market Windows" subtitle="Upcoming and ongoing weather-driven service-demand windows, with pre/during/post timing and channel plays">
        <div className="space-y-2">
          {marketWindows.map((w) => (
            <div key={w.dma} className="flex items-start justify-between gap-3 border-b py-2.5 last:border-0">
              <div className="min-w-0">
                <div className="text-sm leading-relaxed">{w.headline}</div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <Pill>{w.regime}</Pill>
                  {w.serviceLines.slice(0, 3).map((sl) => (
                    <span key={sl} className="rounded-md bg-[var(--surface-2)] px-2 py-0.5 text-[11px]">{sl}</span>
                  ))}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="tabular text-sm font-semibold text-[var(--accent)]">
                  {w.timing === 'ongoing' ? 'now' : `${w.horizonDays}d`}
                </div>
                <div className="text-[10px] uppercase tracking-wide text-muted">{w.timing === 'ongoing' ? 'in market' : 'pre-event'}</div>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

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
          <FunnelTimingCard phase="pre" stages={['TOF', 'MOF']} channels={['CTV', 'YouTube', 'Meta']} guidance="Ahead of a forecasted cold snap or storm, run 'is your car ready?' awareness spots during local weather-forecast slots and prime audiences 3–5 days out. Bid up Search and send the Email/Direct Mail coupon." />
          <FunnelTimingCard phase="during" stages={['BOF']} channels={['Google Search', 'Meta', 'Programmatic Display']} guidance="During the event, harvest intent: bid up 'oil change near me' + '[city]' search. Keep Search on, reduce CTV/Display, and let Email work post-event scheduling. Search is always the dominant BOF channel for this vertical." />
          <FunnelTimingCard phase="post" stages={['Retention']} channels={['Email/CRM', 'Direct Mail', 'Meta']} guidance="After the window is the LARGEST surge: deferred + pent-up maintenance. Fire Meta retargeting, Email loyalty win-back, and Search for the deferred visits people put off during the storm." />
        </div>
      </div>
    </div>
  );
}

function summarizeWindows(windows: MarketWindow[]): { count: number; leadNote: string } {
  const count = windows.length;
  const approaching = windows
    .filter((w) => w.timing === 'approaching')
    .sort((a, b) => a.horizonDays - b.horizonDays)[0];
  if (approaching) {
    return {
      count,
      leadNote: ` — pre-event urgency window in ${approaching.dmaName} opens in ${approaching.horizonDays} day${approaching.horizonDays === 1 ? '' : 's'} (${approaching.regime}). Prime Search + CTV and stage the coupon drop now.`,
    };
  }
  const ongoing = windows[0];
  return {
    count,
    leadNote: ongoing
      ? ` — ${ongoing.dmaName} is in an active ${ongoing.regime} window. Search + Meta in market now.`
      : '.',
  };
}
