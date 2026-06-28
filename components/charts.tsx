'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Area,
  ComposedChart,
  Legend,
} from 'recharts';
import { DecompositionResult } from '@/lib/types';
import { hillSaturation, calculateMarginalROAS } from '@/lib/modeling';

const COMPONENTS = [
  { key: 'baseline', label: 'Baseline', color: '#3f4254' },
  { key: 'seasonality', label: 'Seasonality', color: '#6366f1' },
  { key: 'weatherLift', label: 'Weather lift', color: '#22d3ee' },
  { key: 'mediaLift', label: 'Media lift', color: '#5b8cff' },
  { key: 'interactionLift', label: 'Weather×Media', color: '#a78bfa' },
  { key: 'promoLift', label: 'Promo', color: '#fbbf24' },
] as const;

const axisProps = { stroke: '#8b90a0', fontSize: 11 };

function tooltipStyle() {
  return {
    contentStyle: {
      background: '#13151c',
      border: '1px solid #242836',
      borderRadius: 8,
      fontSize: 12,
    },
    labelStyle: { color: '#e6e8ee' },
  };
}

export function DecompositionChart({
  data,
}: {
  data: (DecompositionResult & { date: string })[];
}) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#242836" vertical={false} />
        <XAxis dataKey="date" {...axisProps} tickFormatter={(d) => String(d).slice(5)} minTickGap={28} />
        <YAxis {...axisProps} tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`} />
        <Tooltip {...tooltipStyle()} formatter={(v) => `$${Number(v).toLocaleString()}`} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {COMPONENTS.map((c) => (
          <Bar key={c.key} dataKey={c.key} stackId="a" fill={c.color} name={c.label} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ObservedVsModeledChart({
  data,
}: {
  data: { date: string; observed: number; modeled: number; low: number; high: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#242836" vertical={false} />
        <XAxis dataKey="date" {...axisProps} tickFormatter={(d) => String(d).slice(5)} minTickGap={28} />
        <YAxis {...axisProps} tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`} />
        <Tooltip {...tooltipStyle()} formatter={(v) => `$${Number(v).toLocaleString()}`} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Area dataKey="high" stroke="none" fill="#5b8cff" fillOpacity={0.08} name="CI high" />
        <Area dataKey="low" stroke="none" fill="#0a0b0f" fillOpacity={1} name="CI low" />
        <Line dataKey="observed" stroke="#34d399" dot={false} strokeWidth={2} name="Observed" />
        <Line dataKey="modeled" stroke="#5b8cff" dot={false} strokeWidth={2} strokeDasharray="4 3" name="Modeled" />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Hill saturation response curve for a channel, marking current spend. */
export function ChannelResponseCurve({
  channel,
  halfSaturation,
  maxResponse,
  slope = 1.3,
  currentSpend,
  interactionMultiplier = 1,
}: {
  channel: string;
  halfSaturation: number;
  maxResponse: number;
  slope?: number;
  currentSpend: number;
  interactionMultiplier?: number;
}) {
  const points = [];
  const maxX = halfSaturation * 3;
  for (let i = 0; i <= 30; i++) {
    const x = (maxX / 30) * i;
    points.push({
      spend: Math.round(x),
      response: Math.round(maxResponse * hillSaturation(x, halfSaturation, slope) * interactionMultiplier),
      current: Math.abs(x - currentSpend) < maxX / 30 ? Math.round(maxResponse * hillSaturation(x, halfSaturation, slope) * interactionMultiplier) : undefined,
    });
  }
  const m = calculateMarginalROAS({ spend: currentSpend, channel: channel as never, halfSaturation, maxResponse, slope, interactionMultiplier });
  return (
    <div>
      <ResponsiveContainer width="100%" height={180}>
        <ComposedChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#242836" vertical={false} />
          <XAxis dataKey="spend" {...axisProps} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`} minTickGap={28} />
          <YAxis {...axisProps} tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`} />
          <Tooltip {...tooltipStyle()} formatter={(v) => `$${Number(v).toLocaleString()}`} labelFormatter={(l) => `Spend $${Number(l).toLocaleString()}`} />
          <Line dataKey="response" stroke="#5b8cff" dot={false} strokeWidth={2} name="Incremental revenue" />
          <Line dataKey="current" stroke="#34d399" dot={{ r: 4 }} name="Current spend" />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="mt-1 text-xs text-muted">
        {channel}: marginal ROAS at current spend{' '}
        <span className="tabular text-[var(--accent)]">{m.marginalRoas.toFixed(2)}</span>
      </div>
    </div>
  );
}

export function MiniLineChart({
  data,
  dataKey,
  color = '#5b8cff',
}: {
  data: Record<string, number | string>[];
  dataKey: string;
  color?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={160}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#242836" vertical={false} />
        <XAxis dataKey="label" {...axisProps} minTickGap={20} />
        <YAxis {...axisProps} />
        <Tooltip {...tooltipStyle()} />
        <Line dataKey={dataKey} stroke={color} dot={false} strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function BarCompareChart({
  data,
}: {
  data: { label: string; current: number; recommended: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#242836" vertical={false} />
        <XAxis dataKey="label" {...axisProps} interval={0} angle={-20} textAnchor="end" height={50} />
        <YAxis {...axisProps} tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`} />
        <Tooltip {...tooltipStyle()} formatter={(v) => `$${Number(v).toLocaleString()}`} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="current" fill="#3f4254" name="Current" />
        <Bar dataKey="recommended" fill="#5b8cff" name="Recommended" />
      </BarChart>
    </ResponsiveContainer>
  );
}
