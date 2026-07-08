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
  { name: 'Transactions', fields: [['date', 'date'], ['dma', 'string'], ['location_id', 'string'], ['service_line', 'enum'], ['revenue', 'number'], ['avg_ticket', 'number'], ['transactions', 'int'], ['new_customers', 'int'], ['returning_customers', 'int'], ['loyalty_member_flag', 'bool'], ['coupon_code', 'string'], ['coupon_redemption', 'float 0-1'], ['margin', 'float 0-1']].map(([name, type]) => ({ name, type })) },
  { name: 'Media', fields: [['date', 'date'], ['dma', 'string'], ['channel', 'enum'], ['funnel_stage', 'enum'], ['spend', 'number'], ['impressions', 'int'], ['clicks', 'int'], ['bookings', 'int'], ['coupon_impressions', 'int']].map(([name, type]) => ({ name, type })) },
  { name: 'Promo', fields: [['date', 'date'], ['promo_name', 'string'], ['promo_type', 'enum'], ['discount_pct', 'float 0-1'], ['service_line', 'enum'], ['dma', 'string'], ['distribution_method', 'enum'], ['distribution_count', 'int']].map(([name, type]) => ({ name, type })) },
  { name: 'Capacity', fields: [['date', 'date'], ['dma', 'string'], ['location_id', 'string'], ['service_bays_available', 'int'], ['avg_wait_time_minutes', 'int'], ['hours_of_operation', 'string'], ['capacity_status', 'enum']].map(([name, type]) => ({ name, type })) },
  { name: 'Location', fields: [['location_id', 'string'], ['dma', 'string'], ['address', 'string'], ['location_type', 'enum (Corporate|Franchise)'], ['open_date', 'date'], ['bays', 'int'], ['hours', 'string']].map(([name, type]) => ({ name, type })) },
  { name: 'Creative', fields: [['creative_id', 'string'], ['channel', 'enum'], ['funnel_stage', 'enum'], ['message_angle', 'string'], ['service_line', 'enum'], ['format', 'enum'], ['launch_date', 'date']].map(([name, type]) => ({ name, type })) },
  { name: 'Weather', fields: [['date', 'date'], ['dma', 'string'], ['temperature', 'float'], ['temp_anomaly', 'float'], ['precipitation', 'float'], ['snow', 'float'], ['humidity', 'int'], ['uv_index', 'int'], ['air_quality', 'int'], ['severe_weather_flag', 'bool']].map(([name, type]) => ({ name, type })) },
];

// Data-quality challenges specific to a franchised quick-lube client.
const DATA_CHALLENGES: { title: string; detail: string }[] = [
  { title: 'Franchise data fragmentation', detail: 'Many franchisees run separate POS systems (e.g., MyShopManager, NexGen). Requires standardized data-extract agreements with franchisees and likely a data-aggregation layer to normalize into one spine.' },
  { title: 'Direct-mail attribution gap', detail: 'Coupon codes are the primary attribution mechanism for direct mail. Without unique promo codes per DMA and drop date, direct mail cannot be modeled separately from organic walk-in demand.' },
  { title: 'National vs. local spend separation', detail: 'National co-op (brand fund) spend vs. franchisee local spend must be tracked separately, or the channel model conflates two different decision-makers with different objectives.' },
  { title: 'Capacity constraint', detail: 'Locations with long wait times suppress effective demand even when the weather signal is strong. Capacity / wait-time data must be merged with transactions to flag capacity-capped DMAs that should NOT get more spend.' },
  { title: 'Google Business Profile signal', detail: 'Search impressions, clicks, and direction requests from Google Business Profile are a leading indicator of intent and should be joined into the media spine.' },
];

// A small but valid TRANSACTIONS dataset so "Generate Demo Dataset" exercises the
// real ingestion + data-spine path (not just a media preview).
const DEMO_SALES_CSV = `date,dma,location_id,service_line,revenue,avg_ticket,transactions,new_customers,returning_customers,loyalty_member_flag,coupon_code,coupon_redemption,margin
2026-06-24,Chicago,LOC-1042,Synthetic Oil Change,68400,86,795,240,555,true,WINTERPREP20,0.28,0.44
2026-06-24,Chicago,LOC-1042,Battery/Electrical,42600,205,208,70,138,true,WINTERPREP20,0.31,0.41
2026-06-25,Minneapolis,LOC-2210,Synthetic Oil Change,51200,88,582,190,392,true,COLDSNAP,0.34,0.45
2026-06-25,Minneapolis,LOC-2210,Wiper Blades,9400,34,276,120,156,false,,0.08,0.5
2026-06-26,Dallas,LOC-3301,Cooling System,38700,142,272,95,177,true,HEATCHECK30,0.22,0.43
2026-06-26,Dallas,LOC-3301,Standard Oil Change,44100,55,802,300,502,false,,0.06,0.4
2026-06-27,Los Angeles,LOC-4400,Standard Oil Change,58300,56,1041,410,631,true,SPRING10,0.12,0.39
2026-06-27,Los Angeles,LOC-4400,Tire Services,61200,135,453,150,303,false,,0.05,0.37
2026-06-28,Seattle,LOC-5120,Wiper Blades,7300,35,209,90,119,false,RAINY,0.19,0.5
2026-06-28,Seattle,LOC-5120,Synthetic Oil Change,39900,89,448,140,308,true,,0.09,0.46
2026-06-28,Denver,LOC-6010,Battery/Electrical,31500,210,150,55,95,true,COLDSNAP,0.26,0.42
2026-06-28,Phoenix,LOC-7008,Cooling System,47800,145,330,120,210,true,HEATCHECK30,0.24,0.41`;

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
            <strong>Data spine active:</strong> using uploaded client transaction data —{' '}
            {spine.sales!.length.toLocaleString()} rows from{' '}
            <span className="font-mono">{spine.fileName}</span>. The MMM Decomposition page
            now computes top-line numbers from this data.
          </span>
          <button onClick={spine.clear} className="rounded-md border px-3 py-1.5 text-xs hover:border-[var(--negative)]">
            Clear &amp; revert to demo data
          </button>
        </div>
      )}

      <SectionCard title="Upload Data" subtitle="CSV ingestion with real schema validation — transactions, media, promo, capacity, creative, or weather exports">
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
                  Use this transaction data across the app
                </button>
                <span className="text-xs text-muted">
                  {canUseAsSpine
                    ? 'Stores validated rows in the session data spine (localStorage). The MMM page will recompute from it.'
                    : 'Transactions CSV must pass validation with >50% of DMAs resolved to be usable as the spine.'}
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

      <SectionCard title="Data Spine Schemas" subtitle="Minimum viable input schema for each source. The normalized panel keys on DMA × day × location × service line × channel.">
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

      <SectionCard title="Data Quality Challenges — Quick-Lube / Franchise Reality" subtitle="Be honest about what a Jiffy Lube-type client actually has to solve before modeling can be trusted.">
        <div className="space-y-3">
          {DATA_CHALLENGES.map((c, i) => (
            <div key={c.title} className="flex gap-3 rounded-lg border border-dashed p-3">
              <span className="shrink-0 text-sm font-semibold text-[var(--warning)]">{i + 1}</span>
              <div>
                <div className="text-sm font-medium">{c.title}</div>
                <p className="mt-0.5 text-xs leading-relaxed text-muted">{c.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Required Minimum Data" subtitle="What we need before we can stand up a weather-responsive MMM for this client.">
        <ul className="space-y-2 text-sm leading-relaxed text-muted">
          <li>· <strong className="text-foreground">12 months of transaction history minimum</strong> — needed to learn seasonal maintenance patterns for the baseline model.</li>
          <li>· <strong className="text-foreground">2+ years preferred</strong> — captures year-over-year weather variation and lets us control for anomalous years (e.g. COVID) if present.</li>
          <li>· <strong className="text-foreground">Daily granularity required</strong> — weekly is insufficient for weather-window modeling (pre/during/post-event timing collapses at a weekly grain).</li>
          <li>· <strong className="text-foreground">DMA-level at minimum; location-level preferred</strong> — location-level unlocks capacity/wait-time modeling and per-store franchise/corporate splits.</li>
          <li>· <strong className="text-foreground">Unique coupon codes per DMA + drop date</strong> — the only reliable way to attribute direct-mail lift separately from organic walk-ins.</li>
        </ul>
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
