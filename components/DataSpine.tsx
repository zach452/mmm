'use client';

import { useState } from 'react';
import { SectionCard, Pill } from './ui';
import { useDataSpine } from '@/lib/store/dataSpineContext';
import {
  detectKind,
  IngestKind,
  IngestResult,
  validateCsv,
} from '@/lib/ingest/schema';
import { extractSalesRows } from '@/lib/ingest/salesRows';
import { parseCsv } from '@/lib/ingest/parseCsv';

const SCHEMA_DISPLAY: { name: string; fields: { name: string; type: string }[] }[] = [
  { name: 'Sales', fields: [['date', 'date'], ['dma', 'string'], ['product_category', 'enum'], ['revenue', 'number'], ['orders', 'int'], ['new_customers', 'int'], ['returning_customers', 'int'], ['margin', 'float 0-1']].map(([name, type]) => ({ name, type })) },
  { name: 'Media', fields: [['date', 'date'], ['dma', 'string'], ['channel', 'enum'], ['funnel_stage', 'enum'], ['spend', 'number'], ['impressions', 'int'], ['clicks', 'int'], ['conversions', 'int']].map(([name, type]) => ({ name, type })) },
  { name: 'Promo', fields: [['date', 'date'], ['promo_name', 'string'], ['discount_level', 'float 0-1'], ['product_category', 'enum'], ['dma', 'string']].map(([name, type]) => ({ name, type })) },
  { name: 'Inventory', fields: [['date', 'date'], ['dma', 'string'], ['product_category', 'enum'], ['inventory_status', 'enum'], ['stock_level', 'float 0-1']].map(([name, type]) => ({ name, type })) },
  { name: 'Creative', fields: [['creative_id', 'string'], ['channel', 'enum'], ['funnel_stage', 'enum'], ['message_angle', 'string'], ['product_category', 'enum'], ['format', 'enum'], ['launch_date', 'date']].map(([name, type]) => ({ name, type })) },
  { name: 'Weather', fields: [['date', 'date'], ['dma', 'string'], ['temperature', 'float'], ['temp_anomaly', 'float'], ['precipitation', 'float'], ['snow', 'float'], ['humidity', 'int'], ['uv_index', 'int'], ['air_quality', 'int'], ['severe_weather_flag', 'bool']].map(([name, type]) => ({ name, type })) },
];

// A small but valid SALES dataset so "Generate Demo Dataset" exercises the real
// ingestion + data-spine path (not just a media preview).
const DEMO_SALES_CSV = `date,dma,product_category,revenue,orders,new_customers,returning_customers,margin
2026-06-24,New York,Outerwear,184200,2210,860,1350,0.41
2026-06-24,New York,Hydration,96400,1480,520,960,0.38
2026-06-25,Chicago,Outerwear,142800,1690,640,1050,0.43
2026-06-25,Chicago,Wellness,88100,1120,410,710,0.46
2026-06-26,Miami,Hydration,167900,2050,910,1140,0.39
2026-06-26,Miami,Footwear,73200,980,360,620,0.4
2026-06-27,Los Angeles,At-Home Beauty,133200,1740,690,1050,0.44
2026-06-27,Los Angeles,Hydration,121900,1620,640,980,0.37
2026-06-28,Seattle,Outerwear,98800,1180,470,710,0.42
2026-06-28,Seattle,At-Home Beauty,112400,1490,560,930,0.45
2026-06-28,Denver,Wellness,79800,1010,380,630,0.47
2026-06-28,Phoenix,Hydration,154300,1980,820,1160,0.36`;

export default function DataSpine() {
  const spine = useDataSpine();
  const [result, setResult] = useState<IngestResult | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [kind, setKind] = useState<IngestKind | null>(null);
  const [previewRows, setPreviewRows] = useState<string[][]>([]);
  const [previewHeaders, setPreviewHeaders] = useState<string[]>([]);

  const ingest = (text: string, name: string) => {
    const { headers, matrix } = parseCsv(text);
    const detected = detectKind(headers) ?? 'sales';
    const res = validateCsv(text, detected);
    setKind(detected);
    setResult(res);
    setFileName(name);
    setPreviewHeaders(headers);
    setPreviewRows(matrix);
  };

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      ingest(String(reader.result), file.name);
    };
    reader.readAsText(file);
  };

  const loadDemo = () => ingest(DEMO_SALES_CSV, 'demo_sales.csv (generated)');

  const canUseAsSpine =
    result && kind === 'sales' && result.ok && result.dmaResolutionRate > 0.5;

  const useAsSpine = () => {
    if (!result) return;
    const rows = extractSalesRows(result);
    spine.setSales(rows, fileName);
  };

  return (
    <div className="space-y-6">
      {spine.hasSales && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-4 py-3 text-sm">
          <span>
            <strong>Data spine active:</strong> using uploaded client sales data —{' '}
            {spine.sales!.length.toLocaleString()} rows from{' '}
            <span className="font-mono">{spine.fileName}</span>. The MMM Decomposition page
            now computes top-line numbers from this data.
          </span>
          <button onClick={spine.clear} className="rounded-md border px-3 py-1.5 text-xs hover:border-[var(--negative)]">
            Clear &amp; revert to demo data
          </button>
        </div>
      )}

      <SectionCard title="Upload Data" subtitle="CSV ingestion with real schema validation — sales, media, promo, inventory, creative, or weather exports">
        <div className="flex flex-wrap items-center gap-3">
          <label className="cursor-pointer rounded-md border bg-[var(--surface-2)] px-4 py-2 text-sm hover:border-[var(--accent)]">
            Choose CSV
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
          </label>
          <button onClick={loadDemo} className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-black">Generate Demo Dataset</button>
          {fileName && <span className="text-xs text-muted">{fileName}{kind ? ` · detected: ${kind}` : ''}</span>}
        </div>

        {result && (
          <>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Quality label="Rows" value={result.rowCount.toLocaleString()} />
              <Quality label="Detected type" value={kind ?? 'unknown'} />
              <Quality label="Errors" value={String(result.errors.length)} tone={result.errors.length > 0 ? 'warn' : 'ok'} />
              <Quality label="Warnings" value={String(result.warnings.length)} tone={result.warnings.length > 0 ? 'warn' : 'ok'} />
              <Quality label="Date range" value={result.dateRange ? `${result.dateRange.start} → ${result.dateRange.end}` : 'n/a'} />
              <Quality label="DMA resolution" value={`${Math.round(result.dmaResolutionRate * 100)}%`} tone={result.dmaResolutionRate < 0.9 ? 'warn' : 'ok'} />
              <Quality label="Validation" value={result.ok ? 'PASS' : 'FAIL'} tone={result.ok ? 'ok' : 'warn'} />
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Missing values per column</div>
                <div className="space-y-1">
                  {result.columnStats.map((c) => (
                    <div key={c.column} className="flex items-center justify-between text-xs">
                      <span className="font-mono">{c.column}</span>
                      <span className={c.missing > 0 ? 'text-[var(--warning)]' : 'text-[var(--positive)]'}>{c.missing}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                  Validation issues ({result.errors.length} errors, {result.warnings.length} warnings)
                </div>
                <div className="max-h-44 space-y-1 overflow-y-auto">
                  {[...result.errors.map((e) => ({ ...e, sev: 'error' as const })), ...result.warnings.map((w) => ({ ...w, sev: 'warn' as const }))]
                    .slice(0, 50)
                    .map((issue, i) => (
                      <div key={i} className="text-xs">
                        <span className={issue.sev === 'error' ? 'text-[var(--negative)]' : 'text-[var(--warning)]'}>
                          {issue.sev === 'error' ? '✗' : '⚠'}
                        </span>{' '}
                        <span className="text-muted">row {issue.row || '—'} · {issue.column}:</span> {issue.message}
                      </div>
                    ))}
                  {result.errors.length === 0 && result.warnings.length === 0 && (
                    <div className="text-xs text-[var(--positive)]">No issues — clean dataset.</div>
                  )}
                </div>
              </div>
            </div>

            {kind === 'sales' && (
              <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-dashed p-3">
                <button
                  onClick={useAsSpine}
                  disabled={!canUseAsSpine}
                  className={`rounded-md px-4 py-2 text-sm font-medium ${canUseAsSpine ? 'bg-[var(--positive)] text-black' : 'cursor-not-allowed bg-[var(--surface-2)] text-muted'}`}
                >
                  Use this sales data across the app
                </button>
                <span className="text-xs text-muted">
                  {canUseAsSpine
                    ? 'Stores validated rows in the session data spine (localStorage). The MMM page will recompute from it.'
                    : 'Sales CSV must pass validation with >50% of DMAs resolved to be usable as the spine.'}
                </span>
              </div>
            )}

            <div className="mt-4 overflow-x-auto rounded-lg border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-[var(--surface-2)] text-left">
                    {previewHeaders.map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.slice(0, 10).map((r, i) => (
                    <tr key={i} className="border-b">
                      {r.map((c, j) => <td key={j} className="px-3 py-1.5 tabular">{c || <span className="text-[var(--negative)]">∅</span>}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-muted">Showing first 10 of {result.rowCount} rows.</p>
          </>
        )}
      </SectionCard>

      <SectionCard title="Data Spine Schemas" subtitle="Minimum viable input schema for each source. The normalized panel keys on DMA × day × product × channel.">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {SCHEMA_DISPLAY.map((s) => (
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
    </div>
  );
}

function Quality({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'warn' }) {
  return (
    <div className="card p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
      <div className={`text-base font-semibold ${tone === 'warn' ? 'text-[var(--warning)]' : tone === 'ok' ? 'text-[var(--positive)]' : ''}`}>{value}</div>
    </div>
  );
}
