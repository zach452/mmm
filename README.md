# Geo Demand Engine

A weather-responsive **geo marketing-mix-modeling (MMM)** and **budget-investment decisioning** tool for media agencies. It separates demand that *would have happened anyway* (weather + seasonality) from demand that *media actually caused*, then recommends where, when, and how much to invest across DMAs, channels, and the funnel.

> **MVP / Demo Mode.** All data is synthetic and deterministically generated. The modeling layer uses transparent, interpretable **heuristic models that stand in for a future production Bayesian/causal MMM** — every such simplification is labeled in code (`lib/modeling/index.ts`) and in the in-app Methodology page.

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
- **Bayesian / hierarchical model service** — partial pooling across DMAs with credible intervals replacing the deterministic indices and point estimates.
- **Experiment calibration loop** — geo lift / matched-market / synthetic-control readouts feed back as priors that update the model.
- **Data warehouse integration** — the normalized spine sourced from Snowflake/BigQuery instead of CSV upload.
- **Platform activation integrations** — push optimizer outputs to Meta/Google/TikTok/RMN with guardrails and human approval.
- **Slack / email alerting** — notify strategists when a high-opportunity weather window or suppression risk emerges.
- **Scheduled forecast jobs** — nightly regeneration of forecasts, indices, and recommendations.

## Future Model Upgrades

- Structural/causal demand model separating weather, media, price, and distribution effects.
- Automated geo experimentation with sequential testing and MDE computation.
- Per-channel saturation re-estimation as spend patterns shift.
- Uncertainty-aware budget optimization (allocate against the full posterior, not point estimates).

---

*Heuristic models throughout `lib/modeling` are clearly labeled as stand-ins for a future true Bayesian/causal MMM. All datasets are synthetic and seeded for reproducibility.*
