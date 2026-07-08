import { getDecompositionSeries, getDMASnapshots } from '@/lib/derive';
import { generateDMAs, SERVICE_LINES, CHANNELS } from '@/lib/mockData';
import { SectionCard, fmtCurrency } from '@/components/ui';
import { DecompositionChart, ObservedVsModeledChart } from '@/components/charts';
import { DecompositionResult, ServiceLine } from '@/lib/types';
import MmmDataSpineSummary from '@/components/MmmDataSpineSummary';

export default function MMMPage() {
  const snaps = getDMASnapshots();
  const dmas = generateDMAs();

  // Portfolio decomposition series: sum the top DMA's series across a few large markets.
  const lead = [...snaps].sort((a, b) => b.dma.population - a.dma.population).slice(0, 6);
  const seriesByDate = new Map<string, DecompositionResult & { date: string }>();
  for (const s of lead) {
    const ser = getDecompositionSeries(s.dma, s.primaryServiceLine, 60);
    for (const row of ser) {
      const cur = seriesByDate.get(row.date);
      if (!cur) {
        seriesByDate.set(row.date, { ...row });
      } else {
        cur.baseline += row.baseline;
        cur.weatherLift += row.weatherLift;
        cur.mediaLift += row.mediaLift;
        cur.interactionLift += row.interactionLift;
        cur.promoLift += row.promoLift;
        cur.capacityEffect += row.capacityEffect;
        cur.seasonality += row.seasonality;
        cur.noise += row.noise;
        cur.observed += row.observed;
      }
    }
  }
  const series = Array.from(seriesByDate.values()).sort((a, b) => a.date.localeCompare(b.date));

  const observedSeries = series.map((s) => {
    const modeled = s.baseline + s.weatherLift + s.mediaLift + s.interactionLift + s.promoLift + s.seasonality + s.capacityEffect;
    return {
      date: s.date,
      observed: s.observed,
      modeled,
      low: Math.round(modeled * 0.92),
      high: Math.round(modeled * 1.08),
    };
  });

  // Aggregate totals for narrative + contribution breakdowns
  const totals = series.reduce(
    (acc, s) => {
      acc.baseline += s.baseline;
      acc.weatherLift += s.weatherLift;
      acc.mediaLift += s.mediaLift;
      acc.interactionLift += s.interactionLift;
      acc.promoLift += s.promoLift;
      acc.seasonality += s.seasonality;
      acc.observed += s.observed;
      return acc;
    },
    { baseline: 0, weatherLift: 0, mediaLift: 0, interactionLift: 0, promoLift: 0, seasonality: 0, observed: 0 },
  );

  const weatherDriven = totals.weatherLift;
  const mediaCaused = totals.mediaLift + totals.interactionLift;
  const incrementalTotal = weatherDriven + mediaCaused || 1;

  // Contribution by channel (from recommendations' media lift, distributed)
  const byChannel = new Map<string, number>();
  for (const s of snaps) {
    byChannel.set(s.recommendation.topChannel, (byChannel.get(s.recommendation.topChannel) ?? 0) + s.decomposition.mediaLift);
  }
  for (const c of CHANNELS) if (!byChannel.has(c)) byChannel.set(c, 0);
  const channelRows = Array.from(byChannel.entries()).sort((a, b) => b[1] - a[1]);
  const channelTotal = channelRows.reduce((s, [, v]) => s + v, 0) || 1;

  // Contribution by DMA
  const dmaRows = [...snaps]
    .sort((a, b) => b.decomposition.mediaLift - a.decomposition.mediaLift)
    .slice(0, 8);

  // Contribution by service line
  const byCat = new Map<ServiceLine, number>();
  for (const s of snaps) {
    for (const r of s.recommendations) {
      byCat.set(r.service_line, (byCat.get(r.service_line) ?? 0) + r.expectedRevenueLift);
    }
  }
  const catRows = SERVICE_LINES.map((c) => [c, byCat.get(c) ?? 0] as const).sort((a, b) => b[1] - a[1]);
  const catTotal = catRows.reduce((s, [, v]) => s + v, 0) || 1;

  void dmas;

  const mmmFallback = {
    totalRevenue: totals.observed,
    baseline: totals.baseline,
    weatherDriven,
    mediaCaused,
  };

  return (
    <div className="space-y-6">
      <MmmDataSpineSummary fallback={mmmFallback} />

      <SectionCard title="Revenue Decomposition Over Time" subtitle="Stacked contribution across the modeled portfolio (top markets)">
        <DecompositionChart data={series} />
      </SectionCard>

      <SectionCard title="Observed vs Modeled Revenue" subtitle="Shaded band = ±8% confidence interval">
        <ObservedVsModeledChart data={observedSeries} />
      </SectionCard>

      <SectionCard title="Decomposition Narrative" subtitle="Dynamically generated from the computed mix">
        <div className="space-y-3 text-sm leading-relaxed text-muted">
          <p>
            Over the modeled window, total estimated service revenue was{' '}
            <strong className="text-foreground">{fmtCurrency(totals.observed)}</strong>, of which a baseline of{' '}
            <strong className="text-foreground">{fmtCurrency(totals.baseline)}</strong> (
            {Math.round((totals.baseline / totals.observed) * 100)}%) reflects routine maintenance visits that would have
            occurred regardless of marketing.
          </p>
          <p>
            Of the incremental demand, an estimated{' '}
            <strong className="text-[var(--accent)]">{fmtCurrency(weatherDriven)}</strong> (
            {Math.round((weatherDriven / incrementalTotal) * 100)}%) is{' '}
            <strong className="text-foreground">weather-driven demand that would have converted regardless of media</strong>{' '}
            — primarily First Cold Snap-driven Synthetic Oil Change and Battery/Electrical visits in Midwest markets. Only{' '}
            <strong className="text-[var(--positive)]">{fmtCurrency(mediaCaused)}</strong> (
            {Math.round((mediaCaused / incrementalTotal) * 100)}%) is{' '}
            <strong className="text-foreground">media-driven incrementality</strong>, concentrated in pre-event Search and
            Direct Mail, including {fmtCurrency(totals.interactionLift)} from weather amplifying media efficiency.
          </p>
          <p className="rounded-lg border border-dashed p-3 text-xs">
            Decisioning implication: crediting paid channels with the full lift would overstate media ROI by roughly{' '}
            {Math.round((weatherDriven / Math.max(1, mediaCaused)) * 100)}%. The optimizer and recommendations net out the
            weather baseline — and respect DMA capacity ceilings — before allocating budget.
          </p>
        </div>
      </SectionCard>

      <div className="grid gap-6 lg:grid-cols-3">
        <SectionCard title="Contribution by Channel">
          <ContribBars rows={channelRows} total={channelTotal} />
        </SectionCard>
        <SectionCard title="Contribution by Service Line">
          <ContribBars rows={catRows as [string, number][]} total={catTotal} />
        </SectionCard>
        <SectionCard title="Top DMAs by Media Lift">
          <div className="space-y-2">
            {dmaRows.map((s) => (
              <div key={s.dma.id} className="flex items-center justify-between text-sm">
                <span>{s.dma.name}</span>
                <span className="tabular text-[var(--accent)]">{fmtCurrency(s.decomposition.mediaLift)}</span>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

function ContribBars({ rows, total }: { rows: (readonly [string, number])[]; total: number }) {
  return (
    <div className="space-y-2.5">
      {rows.map(([label, val]) => {
        const pct = Math.round((val / total) * 100);
        return (
          <div key={label}>
            <div className="flex justify-between text-xs">
              <span>{label}</span>
              <span className="tabular text-muted">{pct}%</span>
            </div>
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
              <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
