'use client';

import { useState } from 'react';
import { SectionCard, Pill } from './ui';

interface Parsed {
  headers: string[];
  rows: string[][];
  rowCount: number;
  missing: number;
  dateRange: string | null;
}

function parseCSV(text: string): Parsed {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (!lines.length) return { headers: [], rows: [], rowCount: 0, missing: 0, dateRange: null };
  const headers = lines[0].split(',').map((h) => h.trim());
  const rows = lines.slice(1).map((l) => l.split(',').map((c) => c.trim()));
  let missing = 0;
  for (const r of rows) for (const c of r) if (c === '' || c == null) missing++;
  const dateIdx = headers.findIndex((h) => /date/i.test(h));
  let dateRange: string | null = null;
  if (dateIdx >= 0) {
    const dates = rows.map((r) => r[dateIdx]).filter(Boolean).sort();
    if (dates.length) dateRange = `${dates[0]} → ${dates[dates.length - 1]}`;
  }
  return { headers, rows, rowCount: rows.length, missing, dateRange };
}

const SCHEMAS: { name: string; fields: { name: string; type: string }[] }[] = [
  { name: 'Sales', fields: [['date', 'date'], ['dma', 'string'], ['product_category', 'enum'], ['revenue', 'number'], ['orders', 'int'], ['new_customers', 'int'], ['returning_customers', 'int'], ['margin', 'float 0-1']].map(([name, type]) => ({ name, type })) },
  { name: 'Media', fields: [['date', 'date'], ['dma', 'string'], ['channel', 'enum'], ['funnel_stage', 'enum'], ['spend', 'number'], ['impressions', 'int'], ['clicks', 'int'], ['conversions', 'int']].map(([name, type]) => ({ name, type })) },
  { name: 'Promo', fields: [['date', 'date'], ['promo_name', 'string'], ['discount_level', 'float 0-1'], ['product_category', 'enum'], ['dma', 'string']].map(([name, type]) => ({ name, type })) },
  { name: 'Inventory', fields: [['date', 'date'], ['dma', 'string'], ['product_category', 'enum'], ['inventory_status', 'enum'], ['stock_level', 'float 0-1']].map(([name, type]) => ({ name, type })) },
  { name: 'Creative', fields: [['creative_id', 'string'], ['channel', 'enum'], ['funnel_stage', 'enum'], ['message_angle', 'string'], ['product_category', 'enum'], ['format', 'enum'], ['launch_date', 'date']].map(([name, type]) => ({ name, type })) },
  { name: 'Weather', fields: [['date', 'date'], ['dma', 'string'], ['temperature', 'float'], ['temp_anomaly', 'float'], ['precipitation', 'float'], ['snow', 'float'], ['humidity', 'int'], ['uv_index', 'int'], ['air_quality', 'int'], ['severe_weather_flag', 'bool']].map(([name, type]) => ({ name, type })) },
];

const DEMO_CSV = `date,dma,channel,funnel_stage,spend,impressions,clicks,conversions
2026-06-24,DMA-001,Meta,MOF,4210,701000,9800,260
2026-06-24,DMA-001,Google Search,BOF,3850,210000,5200,410
2026-06-25,DMA-001,TikTok,TOF,2390,540000,7100,140
2026-06-25,DMA-002,Meta,MOF,5120,820000,11200,305
2026-06-26,DMA-002,CTV,TOF,2210,310000,1200,60
2026-06-26,DMA-003,Amazon/RMN,BOF,2630,180000,4400,520
2026-06-27,DMA-003,Pinterest,MOF,1080,260000,3900,95
2026-06-27,DMA-004,YouTube,TOF,1920,480000,5600,110
2026-06-28,DMA-004,Meta,MOF,4480,742000,10300,288
2026-06-28,DMA-005,Google Search,BOF,3990,221000,5500,430`;

export default function DataSpine() {
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [fileName, setFileName] = useState<string>('');

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      setParsed(parseCSV(String(reader.result)));
      setFileName(file.name);
    };
    reader.readAsText(file);
  };

  const loadDemo = () => {
    setParsed(parseCSV(DEMO_CSV));
    setFileName('demo_media.csv (generated)');
  };

  return (
    <div className="space-y-6">
      <SectionCard title="Upload Data" subtitle="Client-side CSV preview — sales, media, product, promo, inventory, or creative exports">
        <div className="flex flex-wrap items-center gap-3">
          <label className="cursor-pointer rounded-md border bg-[var(--surface-2)] px-4 py-2 text-sm hover:border-[var(--accent)]">
            Choose CSV
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
          </label>
          <button onClick={loadDemo} className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-black">Generate Demo Dataset</button>
          {fileName && <span className="text-xs text-muted">{fileName}</span>}
        </div>

        {parsed && (
          <>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Quality label="Rows" value={parsed.rowCount.toLocaleString()} />
              <Quality label="Columns" value={String(parsed.headers.length)} />
              <Quality label="Missing values" value={String(parsed.missing)} tone={parsed.missing > 0 ? 'warn' : 'ok'} />
              <Quality label="Date range" value={parsed.dateRange ?? 'n/a'} />
            </div>
            <div className="mt-4 overflow-x-auto rounded-lg border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-[var(--surface-2)] text-left">
                    {parsed.headers.map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {parsed.rows.slice(0, 10).map((r, i) => (
                    <tr key={i} className="border-b">
                      {r.map((c, j) => <td key={j} className="px-3 py-1.5 tabular">{c || <span className="text-[var(--negative)]">∅</span>}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-muted">Showing first 10 of {parsed.rowCount} rows.</p>
          </>
        )}
      </SectionCard>

      <SectionCard title="Data Spine Schemas" subtitle="Minimum viable input schema for each source. The normalized panel keys on DMA × day × product × channel.">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {SCHEMAS.map((s) => (
            <div key={s.name} className="card p-4">
              <div className="mb-2 text-sm font-semibold">{s.name}</div>
              <div className="space-y-1">
                {s.fields.map((f) => (
                  <div key={f.name} className="flex items-center justify-between text-xs">
                    <span className="font-mono">{f.name}</span>
                    <Pill>{f.type}</Pill>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Normalized Panel Preview" subtitle="Sample of the joined DMA × day × product × channel panel the models consume">
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-[var(--surface-2)] text-left">
                {['date', 'dma', 'product', 'channel', 'revenue', 'spend', 'regime', 'trigger_idx'].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {PANEL_SAMPLE.map((r, i) => (
                <tr key={i} className="border-b">{r.map((c, j) => <td key={j} className="px-3 py-1.5 tabular">{c}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

const PANEL_SAMPLE: string[][] = [
  ['2026-06-28', 'DMA-001', 'Outerwear', 'Google Search', '38,400', '3,850', 'Cold Snap', '78'],
  ['2026-06-28', 'DMA-001', 'Hydration', 'Meta', '24,100', '4,210', 'Cold Snap', '34'],
  ['2026-06-28', 'DMA-005', 'Hydration', 'Amazon/RMN', '41,900', '2,630', 'Heat Wave', '82'],
  ['2026-06-28', 'DMA-012', 'At-Home Beauty', 'TikTok', '33,200', '2,390', 'Rainy Weekend', '71'],
  ['2026-06-28', 'DMA-018', 'Wellness', 'CTV', '29,800', '2,210', 'Poor Air Quality', '69'],
];

function Quality({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'warn' }) {
  return (
    <div className="card p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
      <div className={`text-base font-semibold ${tone === 'warn' ? 'text-[var(--warning)]' : tone === 'ok' ? 'text-[var(--positive)]' : ''}`}>{value}</div>
    </div>
  );
}
