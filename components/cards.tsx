import { CreativeBrief, FunnelStage, Recommendation } from '@/lib/types';
import { ActionBadge, ConfidenceBadge, fmtCurrency, Pill } from './ui';

export function WeatherSignalCard({
  label,
  value,
  description,
  max = 100,
}: {
  label: string;
  value: number;
  description: string;
  max?: number;
}) {
  const pct = Math.round((value / max) * 100);
  const tone = pct >= 66 ? 'var(--positive)' : pct >= 40 ? 'var(--warning)' : 'var(--muted)';
  return (
    <div className="card p-4">
      <div className="flex items-baseline justify-between">
        <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
        <div className="tabular text-xl font-semibold" style={{ color: tone }}>
          {Math.round(value)}
        </div>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: tone }} />
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted">{description}</p>
    </div>
  );
}

const FUNNEL_LABEL: Record<string, string> = {
  pre: 'Pre-Event',
  during: 'During-Event',
  post: 'Post-Event',
};

export function FunnelTimingCard({
  phase,
  stages,
  channels,
  guidance,
}: {
  phase: 'pre' | 'during' | 'post';
  stages: FunnelStage[];
  channels: string[];
  guidance: string;
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{FUNNEL_LABEL[phase]}</h3>
        <div className="flex gap-1">
          {stages.map((s) => (
            <Pill key={s}>{s}</Pill>
          ))}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {channels.map((c) => (
          <span key={c} className="rounded-md bg-[var(--surface-2)] px-2 py-0.5 text-xs">
            {c}
          </span>
        ))}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted">{guidance}</p>
    </div>
  );
}

export function RecommendationRow({ rec }: { rec: Recommendation }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b py-3 last:border-0">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <ActionBadge action={rec.action} />
          <span className="truncate text-sm font-medium">
            {rec.dmaName} · {rec.service_line}
          </span>
        </div>
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">{rec.rationale}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <Pill>{rec.regime}</Pill>
          <Pill>mROAS {rec.marginalRoas.toFixed(2)}</Pill>
          <Pill>weather {Math.round(rec.weatherShare * 100)}%</Pill>
          <ConfidenceBadge value={rec.confidence} />
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="tabular text-sm font-semibold text-[var(--positive)]">
          {fmtCurrency(rec.expectedRevenueLift)}
        </div>
        <div className="text-[10px] uppercase tracking-wide text-muted">opp {rec.opportunityScore}</div>
      </div>
    </div>
  );
}

export function RecommendationFeed({ recs }: { recs: Recommendation[] }) {
  return (
    <div>
      {recs.map((r) => (
        <RecommendationRow key={r.id} rec={r} />
      ))}
    </div>
  );
}

export function CreativeBriefCard({ brief }: { brief: CreativeBrief }) {
  return (
    <div className="card flex flex-col p-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">{brief.dmaName}</div>
          <div className="text-xs text-muted">{brief.region}</div>
        </div>
        <Pill>{brief.regime}</Pill>
      </div>
      <div className="mt-3 rounded-lg bg-[var(--surface-2)] p-3">
        <div className="text-[10px] uppercase tracking-wide text-muted">Message angle</div>
        <div className="text-sm font-medium text-[var(--accent)]">{brief.messageAngle}</div>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted">{brief.weatherContext}</p>
      <p className="mt-2 text-xs leading-relaxed">
        <span className="text-muted">Mindset: </span>
        {brief.consumerMindset}
      </p>
      <div className="mt-3">
        <div className="text-[10px] uppercase tracking-wide text-muted">Hooks</div>
        <ul className="mt-1 space-y-1">
          {brief.hooks.map((h, i) => (
            <li key={i} className="text-xs leading-relaxed">
              · {h}
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted">CTA</div>
          {brief.cta}
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted">Format</div>
          {brief.format}
        </div>
      </div>
      <div className="mt-3 rounded-lg border border-dashed border-[var(--accent)]/40 p-3 text-xs">
        <div className="text-[10px] uppercase tracking-wide text-muted">Suggested direct-mail coupon offer</div>
        <div className="mt-0.5 font-medium text-[var(--accent)]">{brief.couponOffer}</div>
      </div>
      <div className="mt-3 text-xs">
        <div className="text-[10px] uppercase tracking-wide text-muted">Channel guidance</div>
        {brief.channelGuidance.map((g, i) => (
          <div key={i} className="mt-1 leading-relaxed">
            <span className="font-medium">{g.channel}</span> <Pill>{g.funnel}</Pill> — {g.note}
          </div>
        ))}
      </div>
      <div className="mt-3 border-t pt-3 text-xs leading-relaxed text-muted">
        <span className="font-medium text-foreground">Measurement: </span>
        {brief.measurementPlan}
      </div>
    </div>
  );
}
