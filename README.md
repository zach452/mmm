# Geo Demand Engine

A weather-responsive **geo marketing-mix-modeling (MMM)** and **budget-investment decisioning** tool for media agencies. It separates demand that *would have happened anyway* (weather + seasonality) from demand that *media actually caused*, then recommends where, when, and how much to invest across DMAs, channels, and the funnel.

> **MVP / Demo Mode + V2 live integrations.** The demo runs on synthetic, deterministically-generated data by default. The modeling layer uses transparent, interpretable **heuristic models that stand in for a future production Bayesian/causal MMM** — every such simplification is labeled in code (`lib/modeling/index.ts`) and in the in-app Methodology page. **V2 is now implemented:** real Open-Meteo live weather, real CSV ingestion + validation driving a session data spine, and Hill-curve calibration from historical spend (see "V2 — Implemented" below).

## Product Overview

Ten interactive routes, all backed by local TypeScript modeling logic (no backend, no external APIs):

| Route | What it does |
|-------|--------------|
| `/` | Executive Command Center — portfolio KPIs, top actions, weather windows, channel mix, funnel timing, Act/Test/Monitor/Ignore/Suppress breakdown |
| `/geo` | Geo Opportunity heatmap + ranked DMA table with filters/sort and a per-DMA insight drawer (decomposition, response curves, media plan, risks) |
| `/mmm` | MMM decomposition over time, observed vs modeled with CI band, contribution by channel/category/DMA, and a dynamically-written narrative |
| `/weather` | Weather Signal Lab — live Indoor Behavior, Category Trigger, Weather Friction, and Confidence indices over a 3/7/14-day forecast |
| `/simulator` | Scenario simulator — full input set feeding live revenue/CAC/MER/margin projections and an action recommendation |
| `/optimizer` | Budget optimizer using **marginal ROAS** (Hill-curve derivative), with constraints, before/after charts, and saturation flags |
| `/creative` | Auto-generated creative activation briefs for top weather-driven clusters |
| `/experiments` | Experiment designs with **live matched-market selection** by weighted similarity |
| `/data` | Data spine — client-side CSV upload/preview, demo dataset generator, schemas, quality checks, normalized panel preview |
| `/methodology` | Client-pitch-ready methodology write-up and MVP→V4 roadmap |

## Methodology Summary

- **Weather as a demand shock** — shifts category baseline demand (Outerwear↑ in Cold Snap, Hydration↑ in Heat Wave, At-Home Beauty↑ in Rainy/Snow, Wellness↑ in Poor Air Quality, etc.).
- **Weather as a media modifier** — a regime/channel/funnel-aware interaction multiplier (~0.7–1.6) scales media efficiency.
- **Media response** — channel-specific geometric **adstock** + **Hill saturation** transforms.
- **Decomposition** — revenue split into baseline, weather lift, media lift, weather×media interaction, promo, inventory, seasonality, noise.
- **Decisioning** — recommendations carry confidence + risk flags and can say **Ignore / Suppress / Monitor**; media credit is reduced when weather explains most of the lift.
- **Optimization** — greedy allocation of marginal dollars by the derivative of the Hill curve, respecting per-DMA/per-channel shift and min-spend constraints.

Core formulas live in `lib/modeling/index.ts`; unit tests in `lib/modeling/modeling.test.ts`.

## Data Requirements

Normalized panel keyed on **DMA × day × product × channel**, joined from:

- **Sales** — date, dma, product_category, revenue, orders, new_customers, returning_customers, margin
- **Media** — date, dma, channel, funnel_stage, spend, impressions, clicks, conversions
- **Promo** — date, promo_name, discount_level, product_category, dma
- **Inventory** — date, dma, product_category, inventory_status, stock_level
- **Creative** — creative_id, channel, funnel_stage, message_angle, product_category, format, launch_date
- **Weather** — date, dma, temperature, temp_anomaly, precipitation, snow, humidity, uv_index, air_quality, severe_weather_flag

The `/data` route previews and quality-checks these in-browser.

## V2 — Implemented

The roadmap's V2 milestone ("Live weather API + real client data spine; calibrated Hill curves from historical spend") is now **built and wired into the app**, not just aspirational text.

### What's real

- **Live weather via Open-Meteo** (`lib/weather/`). A `WeatherProvider` interface with two implementations: `MockWeatherProvider` (wraps the existing seeded generators — default, deterministic) and `OpenMeteoWeatherProvider` (real calls to the free, key-less [Open-Meteo](https://open-meteo.com) daily forecast API). `getWeatherProvider()` selects via `WEATHER_PROVIDER` (`mock` | `live`, default `mock`). The `/weather` Weather Signal Lab has a **Demo Data / Live Weather** toggle: selecting Live fetches real forecasts for the chosen DMA's lat/lon through a server-side route handler (`app/api/weather/[dmaId]`) and feeds them through the **same** modeling functions (Indoor / Trigger / Friction / anomaly), so the indices update from real data. Loading/error states fall back to the demo forecast.
- **CSV ingestion + validation** (`lib/ingest/`). A dependency-free RFC-4180-ish CSV parser (`parseCsv.ts`) and real per-type schema validation (`schema.ts`) for all six sources: required-column checks, type parsing (dates/numbers/enums/bools), DMA-name resolution (exact + fuzzy via Levenshtein), missing-value counts per column, date range, and a structured `IngestResult` of errors/warnings. The `/data` page renders these real data-quality results for both uploads and the demo dataset.
- **Session data spine** (`lib/store/dataSpineContext.tsx`). Uploading a valid sales CSV stores the validated rows in a React context persisted to `localStorage`. The `/mmm` MMM Decomposition page consumes it via `useDataSpine()` — it shows "Using uploaded client data (N rows)" and recomputes its top-line revenue / baseline / weather-vs-media split from the uploaded rows, falling back to mock data otherwise.
- **Hill-curve calibration** (`lib/modeling/calibration.ts`). `calibrateHillCurve()` fits half-saturation, slope, and response asymptote to historical `(spend, conversions)` pairs via coarse grid-search + local coordinate descent (closed-form least-squares scale per candidate, scored by R²). The `/optimizer` Budget Optimizer has a **"Calibrate from historical spend"** toggle that fits a curve per channel from the media history and uses the calibrated parameters instead of the hardcoded defaults, displaying half-sat / slope / R² per channel. Unit tests in `lib/modeling/calibration.test.ts` verify parameter recovery on synthetic data.

### Still simulated / out of V2 scope

- **Air quality** is a deterministic proxy from each DMA's climate risk — the free Open-Meteo daily endpoint has no AQI; a real build would call an AQ API (Open-Meteo Air Quality / OpenWeather AQ / AirNow), most of which need a key. Flagged in `lib/weather/openMeteoProvider.ts`.
- **Severe-weather flag** under live weather is a precipitation/snow-threshold proxy (no severe field in the daily endpoint).
- **DMA lat/lon** are approximate metro coordinates from a lookup table.
- **Data spine consumption** is wired into one page (`/mmm`) to prove the flow end-to-end; the other routes still read mock data. The baseline/media split from uploaded data is a transparent heuristic (a true joint estimate is V3).
- **V3/V4 core algorithms are now implemented** with real TypeScript (see "V3 & V4 — Implemented" below). What remains aspirational: full MCMC posterior sampling, and real OAuth/webhook/SMTP credentials for live platform activation and alerting.

> **Env:** set `WEATHER_PROVIDER=live` to make server-rendered weather use Open-Meteo (no key needed); see `.env.example`. The `/weather` Live toggle works regardless of this var.

## V3 & V4 — Implemented

The roadmap's V3 and V4 milestones now ship **real, genuinely-computed TypeScript algorithms** (not prose), with anything needing external production infra clearly stubbed.

### V3 — Bayesian hierarchical MMM (empirical-Bayes) + experiment feedback loop

- **Hierarchical partial pooling** (`lib/modeling/v3-bayesian.ts` → `hierarchicalShrinkage`). Real empirical-Bayes / James-Stein shrinkage: computes a precision-weighted grand mean, estimates between-group variance (τ²) by method-of-moments, and shrinks each group toward the pool by reliability weight `τ² / (τ² + σ²/n)`. Small-sample / noisy DMAs visibly shrink more. **Genuine math; labeled as an empirical-Bayes approximation to a full Stan/PyMC NUTS hierarchical model (V4+).**
- **Bootstrap credible intervals** (`bootstrapCredibleInterval`). Real nonparametric percentile bootstrap (seeded, deterministic) that wraps point estimates (e.g. marginal ROAS, incrementality) with `[α/2, 1-α/2]` bounds that widen with variance.
- **Applied shrinkage** (`shrinkDmaIncrementality`) computes per-DMA incrementality from mock media history and partially pools across DMAs, returning raw + shrunk estimates and a bootstrap CI. Surfaced in the **`/geo` DMA drawer** ("Hierarchical estimate" toggle).
- **Experiment feedback loop** (`lib/modeling/v3-feedback.ts` → `applyExperimentReadout`). Combines a prior model recommendation with a geo-test readout: confirming evidence raises confidence and upgrades toward Act; a significant contradicting result flips toward Suppress/Ignore and flags "model overridden by experiment evidence"; inconclusive lowers confidence and holds Monitor/Test. Demonstrated end-to-end on **`/experiments`** ("Simulate readout → update recommendation", seeded RNG).

### V4 — Causal model, automated geo experiments, guardrailed activation

- **Synthetic control** (`lib/modeling/v4-causal.ts` → `syntheticControlEstimate`). Real hand-rolled synthetic control: finds non-negative donor weights on the simplex (Euclidean simplex projection + projected gradient descent) that reconstruct the treatment unit's pre-period, then builds a post-period counterfactual and reads off per-period and cumulative lift. Same estimand as `Synth`/`gsynth`, no heavy deps. Charted in the **`/geo` drawer** on real mock sales (treatment DMA vs same-region donors).
- **Automated geo experiment design** (`automatedGeoExperimentDesign`). Greedily lays out multiple **non-overlapping** treatment/control clusters ranked by investability (opportunity × mROAS × confidence), drawing matched controls via the existing `selectMatchedMarkets`, with expected-power scoring. Runs live on **`/experiments`** ("Generate automated experiment slate").
- **Activation guardrails** (`lib/modeling/v4-guardrails.ts` → `evaluateActivationGuardrails`). Real branching rules: block on out-of-stock + increasing spend; block on not-ready creative for large increases; block/warn on marginal-ROAS CI lower bound (reusing V3's bootstrap) below breakeven; warn on step changes exceeding a risk-tolerance cap. Shown per-row on **`/optimizer`**.
- **Platform activation connectors** (`lib/integrations/`). `ActivationConnector` / `AlertConnector` interfaces with **clearly-labeled stub implementations** — `MetaAdsStubConnector`, `GoogleAdsStubConnector` run the guardrail check before refusing or returning `{ success, simulated: true, note: "Stub — V5 would call the real Meta/Google API with OAuth" }`; `SlackAlertStubConnector` / `EmailAlertStubConnector` log and return simulated results. **No real API calls** — the "Push to platforms (simulated)" button on `/optimizer` exercises the full path including a simulated Slack alert on blocked rows.

### Still stubbed / out of V3–V4 scope (needs production infra in V5)

- **Full posterior sampling** (MCMC/Stan/PyMC NUTS) — the empirical-Bayes shrinkage + bootstrap is a real but lighter approximation.
- **Real OAuth platform integrations** (Meta Marketing API, Google Ads API) — connectors are interface-correct stubs; no credentials exist in this demo.
- **Real Slack/email delivery** — alert connectors log + return simulated results; real webhook/SMTP credentials are V5.

Tests: `lib/modeling/v3.test.ts` and `v4.test.ts` cover shrinkage monotonicity, bootstrap CI bracketing/widening, feedback-loop direction flips, synthetic-control weight constraints + pre-period reconstruction RMSE, non-overlapping cluster design, and guardrail block/approve cases.

## Run Locally

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # production build
npm run lint       # eslint
npm run test       # vitest (modeling unit tests)
```

Requires Node 20+. Stack: Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, recharts, vitest.

## Deploy to Vercel

1. Push this repo to GitHub.
2. Import it at [vercel.com/new](https://vercel.com/new) — the framework auto-detects as Next.js.
3. No environment variables are required (all data is synthetic). Deploy.

The app is fully static-prerenderable; every route builds as static content.

## Future Architecture

Where the MVP uses simplified stand-ins (flagged in code), production would add:

- **Real weather API integration** — replace the seeded weather generator with a live forecast provider (history + 14-day forecast per DMA), with confidence by horizon.
- **Real MMM engine** — fit Hill curves and adstock from actual client spend/response history.
- **Bayesian / hierarchical model service** — *V3 implemented* as empirical-Bayes partial pooling with bootstrap credible intervals; full MCMC posterior sampling remains.
- **Experiment calibration loop** — *V3 implemented* (`applyExperimentReadout`); readouts feed back to update recommendations.
- **Data warehouse integration** — the normalized spine sourced from Snowflake/BigQuery instead of CSV upload.
- **Platform activation integrations** — *V4 implemented as guardrailed stub connectors*; real OAuth push to Meta/Google/TikTok/RMN is V5.
- **Slack / email alerting** — *V4 implemented as stub connectors*; real webhook/SMTP delivery is V5.
- **Scheduled forecast jobs** — nightly regeneration of forecasts, indices, and recommendations.

## Future Model Upgrades

- Structural/causal demand model separating weather, media, price, and distribution effects — *V4 ships a real synthetic-control causal estimator*; a full structural model with price/distribution terms remains.
- Automated geo experimentation — *V4 ships automated multi-cluster geo design*; sequential testing and formal MDE/power computation remain.
- Per-channel saturation re-estimation as spend patterns shift.
- Uncertainty-aware budget optimization (allocate against the full posterior, not point estimates).

---

*Heuristic models throughout `lib/modeling` are clearly labeled as stand-ins for a future true Bayesian/causal MMM. All datasets are synthetic and seeded for reproducibility.*
