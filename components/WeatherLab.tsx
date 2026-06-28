'use client';

import { useMemo, useState } from 'react';
import { ProductCategory, WeatherForecast, WeatherRegime } from '@/lib/types';
import {
  calculateCategoryTriggerIndex,
  calculateIndoorBehaviorIndex,
  calculateWeatherAnomaly,
  calculateWeatherFrictionIndex,
} from '@/lib/modeling';
import { WeatherSignalCard } from './cards';
import { MiniLineChart } from './charts';
import { SectionCard, Pill } from './ui';

export interface WeatherLabDMA {
  id: string;
  name: string;
  region: string;
  marketNorm: { temperature: number; precipitation: number };
  forecast: WeatherForecast[];
}

const CATEGORIES: ProductCategory[] = ['At-Home Beauty', 'Outerwear', 'Footwear', 'Hydration', 'Baby Care', 'Wellness'];
const REGIMES: WeatherRegime[] = ['Normal', 'Cold Snap', 'Heat Wave', 'Rainy Weekend', 'Snow Event', 'High UV', 'Poor Air Quality', 'Severe Storm', 'First Warm Weekend', 'First Cold Snap'];

export default function WeatherLab({ dmas }: { dmas: WeatherLabDMA[] }) {
  const [dmaId, setDmaId] = useState(dmas[0].id);
  const [category, setCategory] = useState<ProductCategory>('Outerwear');
  const [window, setWindow] = useState<3 | 7 | 14>(7);
  const [overrideRegime, setOverrideRegime] = useState<WeatherRegime | 'Forecast'>('Forecast');

  const dma = dmas.find((d) => d.id === dmaId)!;
  const horizon = dma.forecast.slice(0, window);

  const signals = useMemo(() => {
    return horizon.map((f) => {
      const regime = overrideRegime === 'Forecast' ? f.regime : overrideRegime;
      const anomaly = calculateWeatherAnomaly({ temperature: f.temperature, precipitation: f.precipitation }, dma.marketNorm);
      const indoor = calculateIndoorBehaviorIndex({
        temperature: f.temperature,
        precipitation: f.precipitation,
        snow: f.snow,
        uv_index: f.uv_index,
        air_quality: f.air_quality,
        severe: f.severe_weather_flag,
      });
      const trigger = calculateCategoryTriggerIndex(category, regime, anomaly);
      const friction = calculateWeatherFrictionIndex({
        precipitation: f.precipitation,
        snow: f.snow,
        severe: f.severe_weather_flag,
        inventoryHealthy: true,
      });
      return { date: f.date, label: f.date.slice(5), indoor, trigger, friction, regime, confidence: f.confidence };
    });
  }, [horizon, category, overrideRegime, dma.marketNorm]);

  const avg = (k: 'indoor' | 'trigger' | 'friction') =>
    Math.round(signals.reduce((s, x) => s + x[k], 0) / signals.length);
  const avgConfidence = signals.reduce((s, x) => s + x.confidence, 0) / signals.length;
  const weatherConfidence = Math.round(avgConfidence * 100);

  const chartData = signals.map((s) => ({ label: s.label, Trigger: s.trigger, Indoor: s.indoor, Friction: s.friction }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="DMA">
          <select value={dmaId} onChange={(e) => setDmaId(e.target.value)} className="sel">
            {dmas.map((d) => (
              <option key={d.id} value={d.id}>{d.name} ({d.region})</option>
            ))}
          </select>
        </Field>
        <Field label="Category">
          <select value={category} onChange={(e) => setCategory(e.target.value as ProductCategory)} className="sel">
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Forecast window">
          <div className="flex gap-1">
            {([3, 7, 14] as const).map((w) => (
              <button key={w} onClick={() => setWindow(w)} className={`rounded-md border px-3 py-1.5 text-xs ${window === w ? 'bg-[var(--accent)] text-black' : 'bg-[var(--surface-2)]'}`}>{w}d</button>
            ))}
          </div>
        </Field>
        <Field label="Regime override">
          <select value={overrideRegime} onChange={(e) => setOverrideRegime(e.target.value as WeatherRegime | 'Forecast')} className="sel">
            <option value="Forecast">Use forecast</option>
            {REGIMES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <WeatherSignalCard label="Indoor Behavior Index" value={avg('indoor')} description="How strongly weather pushes consumers indoors and onto mobile commerce." />
        <WeatherSignalCard label={`Category Trigger — ${category}`} value={avg('trigger')} description="Weather-driven relevance of this category. 50 = neutral; higher means weather lifts demand." />
        <WeatherSignalCard label="Weather Friction Index" value={avg('friction')} description="Friction to purchase and fulfillment from precipitation, snow, and severe weather." />
        <WeatherSignalCard label="Weather Confidence" value={weatherConfidence} description="Forecast confidence over the selected horizon; decays with longer windows." />
      </div>

      <SectionCard title="Signal Trajectory Over Forecast Window" subtitle={`${dma.name} · ${category} · ${window}-day horizon`}>
        <MiniLineChart data={chartData} dataKey="Trigger" color="#5b8cff" />
        <div className="mt-2 flex flex-wrap gap-2">
          {signals.map((s) => (
            <span key={s.date} className="rounded-md border bg-[var(--surface-2)] px-2 py-1 text-[11px]">
              {s.label}: <Pill>{s.regime}</Pill> T{s.trigger}
            </span>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="How to Read These Signals" subtitle="Plain-language explainer">
        <div className="space-y-2 text-sm leading-relaxed text-muted">
          <p>
            <strong className="text-foreground">Category Trigger Index</strong> drives <em>what</em> to sell: when {category}{' '}
            scores above ~65, weather is materially lifting demand and creative should lean into the weather angle.
          </p>
          <p>
            <strong className="text-foreground">Indoor Behavior Index</strong> drives <em>how</em> to reach people — high values
            favor mobile, DTC convenience, and at-home messaging.
          </p>
          <p>
            <strong className="text-foreground">Weather Friction Index</strong> is a brake: high friction (snow, storms,
            constrained inventory) argues for suppressing paid acquisition to protect efficiency and customer experience.
          </p>
          <p>
            <strong className="text-foreground">Weather Confidence</strong> scales how aggressively to act — longer horizons
            carry more forecast uncertainty, so further-out windows warrant tests over full-scale activation.
          </p>
        </div>
      </SectionCard>

      <style>{`.sel{background:var(--surface-2);border:1px solid var(--border);border-radius:0.375rem;padding:0.375rem 0.5rem;font-size:0.75rem;color:var(--foreground);outline:none}`}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted">
      {label}
      {children}
    </label>
  );
}
