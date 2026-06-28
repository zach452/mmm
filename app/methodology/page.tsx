import { SectionCard } from '@/components/ui';

function MethodologySection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-5">
      <h3 className="text-sm font-semibold text-[var(--accent)]">{title}</h3>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-muted">{children}</div>
    </div>
  );
}

export default function MethodologyPage() {
  return (
    <div className="space-y-6">
      <SectionCard title="How the Geo Demand Engine Works" subtitle="A weather-responsive geo MMM and budget-decisioning framework">
        <p className="text-sm leading-relaxed text-muted">
          The Geo Demand Engine separates demand that <strong className="text-foreground">would have happened anyway</strong>{' '}
          (driven by weather and seasonality) from demand that <strong className="text-foreground">media actually caused</strong>,
          then allocates budget to the markets, channels, and moments where incremental dollars do the most work. Below is the
          full methodology, written for a client audience.
        </p>
        <p className="mt-2 rounded-lg border border-dashed p-3 text-xs text-muted">
          Note: this MVP uses transparent, deterministic heuristic models in place of a future production Bayesian/causal MMM.
          Every index and lift estimate is interpretable and inspectable. Sections below flag where a true probabilistic model
          would replace the current approximation.
        </p>
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <MethodologySection title="1. Weather as an External Demand Shock">
          <p>Weather moves category demand independently of marketing. A cold snap pulls forward outerwear; a heat wave spikes hydration; rainy weekends lift at-home beauty. We model this as a baseline shift so paid media is never credited for organic, weather-driven demand.</p>
        </MethodologySection>
        <MethodologySection title="2. Weather as a Media-Effect Modifier">
          <p>Beyond shifting baseline demand, weather changes how efficiently media converts. When a category is highly relevant, the same impression converts better. We capture this with a weather × media interaction multiplier (~0.7–1.6) that is regime-, channel-, and funnel-aware.</p>
        </MethodologySection>
        <MethodologySection title="3. The Data Spine">
          <p>A normalized panel keyed on DMA × day × product × channel joins sales, media, promo, inventory, creative, and weather. This single source of truth lets the model attribute every dollar of revenue to a cause and every market to an opportunity tier.</p>
        </MethodologySection>
        <MethodologySection title="4. Weather Feature Engineering">
          <p>Raw observations become decision-grade signals: temperature anomalies vs market norm, an Indoor Behavior Index, a per-category Trigger Index, and a Weather Friction Index. Discrete regimes (Cold Snap, Heat Wave, Poor Air Quality, First Warm Weekend, etc.) are derived from thresholds on these features.</p>
        </MethodologySection>
        <MethodologySection title="5. Baseline Demand Model">
          <p>Baseline demand is estimated per DMA × category from population, a market baseline index, and seasonality. This is the counterfactual: what sells with zero incremental media. <em>Future:</em> a hierarchical Bayesian baseline with partial pooling across DMAs.</p>
        </MethodologySection>
        <MethodologySection title="6. Media Response Curves">
          <p>Each channel follows a Hill saturation curve: response = xˢ / (xˢ + halfˢ). Early spend is efficient; deep spend saturates. Curves are visualized on the Geo and Optimizer pages with the current spend point marked.</p>
        </MethodologySection>
        <MethodologySection title="7. Weather × Media Interaction Effects">
          <p>The interaction multiplier amplifies or dampens media response based on regime and category relevance. Severe storms suppress efficiency (fulfillment friction); high-relevance windows amplify it, especially for BOF/Search.</p>
        </MethodologySection>
        <MethodologySection title="8. Lag & Adstock Modeling">
          <p>Media effects persist. We apply channel-specific geometric adstock (CTV/YouTube decay slowly; Search decays fast) so the model credits delayed conversions to the impressions that drove them.</p>
        </MethodologySection>
        <MethodologySection title="9. Hierarchical Geo Logic">
          <p>DMAs are scored individually but interpreted within region and climate cohorts. This supports matched-market experiments and partial pooling, so thin-data markets borrow strength from similar ones.</p>
        </MethodologySection>
        <MethodologySection title="10. Experiment Calibration">
          <p>Model estimates are calibrated against geo lift tests, matched-market and synthetic-control designs. Experiments net out the weather baseline before attributing lift, keeping media causality honest. <em>Future:</em> a closed feedback loop where readouts update model priors.</p>
        </MethodologySection>
        <MethodologySection title="11. Forecast Simulation">
          <p>A 14-day weather forecast (confidence decaying with horizon) feeds forward-looking demand signals, so activation can be planned pre-event rather than reacting after the window has passed.</p>
        </MethodologySection>
        <MethodologySection title="12. Budget Optimization">
          <p>The optimizer allocates marginal dollars greedily by <strong className="text-foreground">marginal ROAS</strong> — the derivative of the Hill curve at current spend — not average ROAS. It respects per-DMA/per-channel shift limits and min-spend floors, and flags diminishing returns once a combination nears saturation.</p>
        </MethodologySection>
        <MethodologySection title="13. Confidence Scoring">
          <p>Every recommendation carries a confidence score reflecting forecast horizon, saturation level, and signal strength. Low-confidence opportunities are routed to Test rather than Act.</p>
        </MethodologySection>
        <MethodologySection title="14. Human-in-the-Loop Governance">
          <p>The engine recommends; it does not auto-execute. Actions are classified Act / Test / Monitor / Ignore / Suppress, with rationale and risk flags, so strategists make the final call with full context.</p>
        </MethodologySection>
      </div>

      <SectionCard title="MVP → V4 Roadmap" subtitle="From interpretable heuristics to a production causal engine">
        <div className="grid gap-3 md:grid-cols-4">
          {[
            { v: 'MVP (now)', d: 'Deterministic heuristic models, synthetic data, full decisioning UI and experiment design.' },
            { v: 'V2', d: 'Live weather API + real client data spine; calibrated Hill curves from historical spend.' },
            { v: 'V3', d: 'Bayesian hierarchical MMM service with partial pooling and credible intervals; experiment feedback loop.' },
            { v: 'V4', d: 'Causal/structural model, automated geo experiments, and platform activation integrations with guardrails.' },
          ].map((r) => (
            <div key={r.v} className="card p-4">
              <div className="text-sm font-semibold text-[var(--accent)]">{r.v}</div>
              <p className="mt-1.5 text-xs leading-relaxed text-muted">{r.d}</p>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
