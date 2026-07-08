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
      <SectionCard title="How the Geo Demand Engine Works" subtitle="A weather-responsive geo MMM and budget-decisioning framework for a quick-lube auto-services chain">
        <p className="text-sm leading-relaxed text-muted">
          The Geo Demand Engine separates service demand that <strong className="text-foreground">would have happened anyway</strong>{' '}
          (driven by weather and seasonal maintenance cycles) from demand that <strong className="text-foreground">media actually caused</strong>,
          then allocates budget to the markets, channels, and moments where incremental dollars do the most work — while
          respecting each DMA&apos;s physical service-bay capacity. Below is the full methodology, written for a client audience.
        </p>
        <p className="mt-2 rounded-lg border border-dashed p-3 text-xs text-muted">
          Note: this MVP uses transparent, deterministic heuristic models in place of a future production Bayesian/causal MMM.
          Every index and lift estimate is interpretable and inspectable. Sections below flag where a true probabilistic model
          would replace the current approximation.
        </p>
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <MethodologySection title="1. Weather as an External Demand Shock">
          <p>Weather moves service demand independently of marketing — and the causal links are unusually clean. <strong className="text-foreground">Cold kills batteries deterministically</strong>: below freezing, a marginal battery simply fails, so a cold snap produces a near-mechanical spike in Battery/Electrical and Synthetic Oil Change demand. Heat overwhelms cooling systems; rain drives wiper-blade replacement. We model this as a baseline shift so paid media is never credited for organic, weather-driven visits.</p>
        </MethodologySection>
        <MethodologySection title="2. Weather as a Media-Effect Modifier">
          <p>Beyond shifting baseline demand, weather changes how efficiently media converts. When a service line is highly relevant, the same impression converts better — and for auto services, Google Search sees the biggest lift during the First Cold Snap window as drivers actively search &quot;oil change near me.&quot; We capture this with a weather × media interaction multiplier (~0.7–1.6) that is regime-, channel-, and funnel-aware.</p>
        </MethodologySection>
        <MethodologySection title="3. The Data Spine">
          <p>A normalized panel keyed on DMA × day × location × service line × channel joins transactions, media, promo, capacity, creative, and weather. For a franchised chain this is the hard part — franchisee POS fragmentation and national-vs-local co-op spend must be reconciled first (see the Data Spine page). This single source of truth lets the model attribute every dollar of revenue to a cause and every market to an opportunity tier.</p>
        </MethodologySection>
        <MethodologySection title="4. Weather Feature Engineering">
          <p>Raw observations become decision-grade signals: temperature anomalies vs market norm, an Indoor/Visit-Friction Index, a per-service-line Trigger Index, and a Weather Friction Index. Discrete regimes (First Cold Snap, Cold Snap, Heat Wave, Snow Event, First Warm Weekend, etc.) are derived from thresholds on these features.</p>
        </MethodologySection>
        <MethodologySection title="5. Baseline Demand Model">
          <p>Baseline demand is estimated per DMA × service line from population, a market baseline index, location count, maintenance seasonality (winter-prep Oct–Nov and spring Mar–Apr run hot), and day-of-week (weekends are busier for oil changes). This is the counterfactual: visits with zero incremental media. <em>Future:</em> a hierarchical Bayesian baseline with partial pooling across DMAs.</p>
        </MethodologySection>
        <MethodologySection title="6. Media Response Curves">
          <p>Each channel follows a Hill saturation curve: response = xˢ / (xˢ + halfˢ). Early spend is efficient; deep spend saturates. Search saturates fast in small DMAs (limited local search volume); Direct Mail behaves step-function-like (below a minimum drop size its impact is near zero). Curves are visualized on the Geo and Optimizer pages with the current spend point marked.</p>
        </MethodologySection>
        <MethodologySection title="7. Weather × Media Interaction Effects">
          <p>The interaction multiplier amplifies or dampens media response based on regime and service relevance. Severe storms suppress efficiency (nobody drives in); high-relevance windows amplify it, especially for BOF/Search. Brand channels (CTV/Programmatic) work hardest during Normal conditions when there is no urgency trigger.</p>
        </MethodologySection>
        <MethodologySection title="8. Lag & Adstock Modeling">
          <p>Media effects persist. We apply channel-specific geometric adstock (CTV decays slowly as brand awareness; Direct Mail has a long tail — coupons sit on the fridge; Search decays fast — intent is immediate) so the model credits delayed bookings to the impressions that drove them.</p>
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
            { v: 'MVP', d: 'Deterministic heuristic models, synthetic data, full decisioning UI and experiment design.', status: 'done' as const },
            { v: 'V2', d: 'Live Open-Meteo weather (Weather Signal Lab toggle), real CSV ingestion + validation driving a session data spine (consumed by MMM Decomposition), and Hill curves calibrated from historical spend (Budget Optimizer). Air quality remains a proxy; data-spine consumption is wired into one page so far.', status: 'live' as const },
            { v: 'V3', d: 'Now live (core algorithms): empirical-Bayes hierarchical partial pooling shrinks noisy/small-sample DMA incrementality toward the cross-DMA mean (Geo drawer), real nonparametric bootstrap credible intervals wrap point estimates, and an experiment feedback loop (Experiments) updates a recommendation from a geo-test readout — confirming raises confidence, contradicting flips toward Suppress. Still aspirational: full MCMC/Stan/PyMC NUTS posterior sampling replacing the empirical-Bayes approximation.', status: 'live' as const },
            { v: 'V4', d: 'Now live (core algorithms): a hand-rolled synthetic-control estimator (projected-gradient simplex weights) computes causal counterfactual lift on real mock sales (Geo drawer), automated multi-cluster geo experiment design generates a ranked, non-overlapping treatment/control slate (Experiments), and guardrailed stub activation connectors (Optimizer) check DMA capacity / creative / marginal-ROAS CI / step-size before a simulated push to Meta/Google with a simulated Slack alert. Still aspirational: real OAuth platform integrations and real Slack/email delivery — these need production credentials in V5.', status: 'live' as const },
          ].map((r) => (
            <div key={r.v} className="card p-4">
              <div className="flex items-center gap-2">
                <div className="text-sm font-semibold text-[var(--accent)]">{r.v}</div>
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                    r.status === 'live'
                      ? 'bg-[var(--positive)]/15 text-[var(--positive)]'
                      : r.status === 'done'
                        ? 'bg-[var(--surface-2)] text-muted'
                        : 'border text-muted'
                  }`}
                >
                  {r.status === 'live' ? '● Now live' : r.status === 'done' ? 'Shipped' : 'Planned'}
                </span>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-muted">{r.d}</p>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
