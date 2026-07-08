/**
 * CSV ingestion schemas + validation for the six data-spine source types.
 *
 * Validation checks, per file type:
 *  - required columns are present
 *  - cell types are parseable (dates valid, numbers numeric, bools/enums in range)
 *  - DMA names resolve against the known DMA list (exact, then fuzzy)
 *  - produces a structured IngestResult with row-level errors and warnings
 *
 * This is real validation that drives the /data UI and (for sales) the data spine.
 */
import { generateDMAs, CHANNELS, FUNNEL_STAGES, SERVICE_LINES } from '../mockData';
import { parseCsv } from './parseCsv';

export type IngestKind =
  | 'sales'
  | 'media'
  | 'promo'
  | 'capacity'
  | 'creative'
  | 'weather';

const PROMO_TYPES = ['Coupon', 'Digital Offer', 'Loyalty Bonus', 'Bundle'] as const;
const DISTRIBUTION_METHODS = ['Direct Mail', 'Digital', 'In-Store'] as const;
const CAPACITY_STATUSES = ['Healthy', 'Constrained', 'Maxed'] as const;

export type ColumnType = 'date' | 'number' | 'int' | 'fraction' | 'string' | 'bool' | 'enum';

export interface ColumnSpec {
  name: string;
  type: ColumnType;
  required?: boolean;
  /** allowed values for enum columns */
  values?: readonly string[];
  /** column holds a DMA name/id that should resolve against the known DMA list */
  isDma?: boolean;
}

export interface IngestError {
  row: number; // 1-based data row index (0 = header/schema-level)
  column: string;
  message: string;
}

export interface IngestColumnStats {
  column: string;
  missing: number;
}

export interface IngestResult<T = Record<string, unknown>> {
  kind: IngestKind;
  ok: boolean;
  rows: T[];
  rowCount: number;
  headers: string[];
  columnStats: IngestColumnStats[];
  errors: IngestError[];
  warnings: IngestError[];
  dateRange: { start: string; end: string } | null;
  dmaResolutionRate: number; // 0-1 fraction of DMA cells that resolved
}

const fractionRule = (v: number) => v >= 0 && v <= 1;

export const SCHEMAS: Record<IngestKind, ColumnSpec[]> = {
  // Transactions (service-visit) spine.
  sales: [
    { name: 'date', type: 'date', required: true },
    { name: 'dma', type: 'string', required: true, isDma: true },
    { name: 'location_id', type: 'string' },
    { name: 'service_line', type: 'enum', required: true, values: SERVICE_LINES },
    { name: 'revenue', type: 'number', required: true },
    { name: 'avg_ticket', type: 'number' },
    { name: 'transactions', type: 'int', required: true },
    { name: 'new_customers', type: 'int' },
    { name: 'returning_customers', type: 'int' },
    { name: 'loyalty_member_flag', type: 'bool' },
    { name: 'coupon_code', type: 'string' },
    { name: 'coupon_redemption', type: 'fraction' },
    { name: 'margin', type: 'fraction' },
  ],
  media: [
    { name: 'date', type: 'date', required: true },
    { name: 'dma', type: 'string', required: true, isDma: true },
    { name: 'channel', type: 'enum', required: true, values: CHANNELS },
    { name: 'funnel_stage', type: 'enum', required: true, values: FUNNEL_STAGES },
    { name: 'spend', type: 'number', required: true },
    { name: 'impressions', type: 'int' },
    { name: 'clicks', type: 'int' },
    { name: 'bookings', type: 'int' },
    { name: 'coupon_impressions', type: 'int' },
  ],
  promo: [
    { name: 'date', type: 'date', required: true },
    { name: 'promo_name', type: 'string', required: true },
    { name: 'promo_type', type: 'enum', required: true, values: PROMO_TYPES },
    { name: 'discount_pct', type: 'fraction', required: true },
    { name: 'service_line', type: 'enum', values: SERVICE_LINES },
    { name: 'dma', type: 'string', isDma: true },
    { name: 'distribution_method', type: 'enum', values: DISTRIBUTION_METHODS },
    { name: 'distribution_count', type: 'int' },
  ],
  // Service-network capacity (replaces retail inventory for a physical service business).
  capacity: [
    { name: 'date', type: 'date', required: true },
    { name: 'dma', type: 'string', required: true, isDma: true },
    { name: 'location_id', type: 'string' },
    { name: 'service_bays_available', type: 'int', required: true },
    { name: 'avg_wait_time_minutes', type: 'int' },
    { name: 'hours_of_operation', type: 'string' },
    { name: 'capacity_status', type: 'enum', values: CAPACITY_STATUSES },
  ],
  creative: [
    { name: 'creative_id', type: 'string', required: true },
    { name: 'channel', type: 'enum', required: true, values: CHANNELS },
    { name: 'funnel_stage', type: 'enum', values: FUNNEL_STAGES },
    { name: 'message_angle', type: 'string' },
    { name: 'service_line', type: 'enum', values: SERVICE_LINES },
    { name: 'format', type: 'enum', values: ['Static', 'Video', 'Carousel', 'UGC', 'Story'] },
    { name: 'launch_date', type: 'date', required: true },
  ],
  weather: [
    { name: 'date', type: 'date', required: true },
    { name: 'dma', type: 'string', required: true, isDma: true },
    { name: 'temperature', type: 'number', required: true },
    { name: 'temp_anomaly', type: 'number' },
    { name: 'precipitation', type: 'number' },
    { name: 'snow', type: 'number' },
    { name: 'humidity', type: 'int' },
    { name: 'uv_index', type: 'int' },
    { name: 'air_quality', type: 'int' },
    { name: 'severe_weather_flag', type: 'bool' },
  ],
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(v: string): boolean {
  if (!ISO_DATE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime());
}

// ---- DMA resolution (exact id, exact name, then fuzzy) --------------------
let _dmaIndex: { byId: Map<string, string>; byName: Map<string, string>; names: string[] } | null = null;
function dmaIndex() {
  if (_dmaIndex) return _dmaIndex;
  const byId = new Map<string, string>();
  const byName = new Map<string, string>();
  const names: string[] = [];
  for (const d of generateDMAs()) {
    byId.set(d.id.toLowerCase(), d.id);
    byName.set(d.name.toLowerCase(), d.id);
    names.push(d.name);
  }
  _dmaIndex = { byId, byName, names };
  return _dmaIndex;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => i);
  for (let j = 1; j <= n; j++) {
    let prev = dp[0];
    dp[0] = j;
    for (let i = 1; i <= m; i++) {
      const tmp = dp[i];
      dp[i] = Math.min(
        dp[i] + 1,
        dp[i - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      prev = tmp;
    }
  }
  return dp[m];
}

export interface DmaMatch {
  id: string | null;
  exact: boolean;
  suggestion?: string;
}

export function resolveDma(raw: string): DmaMatch {
  const idx = dmaIndex();
  const key = raw.trim().toLowerCase();
  if (idx.byId.has(key)) return { id: idx.byId.get(key)!, exact: true };
  if (idx.byName.has(key)) return { id: idx.byName.get(key)!, exact: true };
  // fuzzy: nearest name within a small edit distance
  let best: string | null = null;
  let bestDist = Infinity;
  for (const name of idx.names) {
    const d = levenshtein(key, name.toLowerCase());
    if (d < bestDist) {
      bestDist = d;
      best = name;
    }
  }
  if (best && bestDist <= Math.max(2, Math.floor(best.length * 0.25))) {
    return { id: idx.byName.get(best.toLowerCase()) ?? null, exact: false, suggestion: best };
  }
  return { id: null, exact: false, suggestion: best ?? undefined };
}

function checkCell(spec: ColumnSpec, value: string): string | null {
  if (value === '') {
    return spec.required ? `missing required value` : null;
  }
  switch (spec.type) {
    case 'date':
      return isValidDate(value) ? null : `invalid date (expected YYYY-MM-DD)`;
    case 'number':
      return Number.isFinite(Number(value)) ? null : `not a number`;
    case 'int': {
      const n = Number(value);
      return Number.isInteger(n) ? null : `not an integer`;
    }
    case 'fraction': {
      const n = Number(value);
      if (!Number.isFinite(n)) return `not a number`;
      return fractionRule(n) ? null : `out of range (expected 0–1)`;
    }
    case 'bool':
      return /^(true|false|0|1|yes|no)$/i.test(value) ? null : `not a boolean`;
    case 'enum':
      return spec.values && spec.values.includes(value)
        ? null
        : `not one of: ${spec.values?.join(', ')}`;
    default:
      return null;
  }
}

const HEADER_HINTS: Record<IngestKind, string[]> = {
  sales: ['revenue', 'transactions', 'service_line'],
  media: ['spend', 'channel', 'impressions'],
  promo: ['promo_name', 'promo_type'],
  capacity: ['service_bays_available', 'avg_wait_time_minutes', 'capacity_status'],
  creative: ['creative_id', 'launch_date'],
  weather: ['temperature', 'precipitation'],
};

/** Best-guess the file type from its header row. */
export function detectKind(headers: string[]): IngestKind | null {
  const set = new Set(headers.map((h) => h.toLowerCase()));
  let best: IngestKind | null = null;
  let bestScore = 0;
  (Object.keys(HEADER_HINTS) as IngestKind[]).forEach((kind) => {
    const score = HEADER_HINTS[kind].filter((h) => set.has(h)).length;
    if (score > bestScore) {
      bestScore = score;
      best = kind;
    }
  });
  return bestScore > 0 ? best : null;
}

export function validateCsv(text: string, kind: IngestKind): IngestResult {
  const specs = SCHEMAS[kind];
  const { headers, rows } = parseCsv(text);
  const errors: IngestError[] = [];
  const warnings: IngestError[] = [];

  // header-level: required columns present
  const headerSet = new Set(headers);
  for (const spec of specs) {
    if (spec.required && !headerSet.has(spec.name)) {
      errors.push({ row: 0, column: spec.name, message: `required column missing` });
    }
  }

  const columnStats: IngestColumnStats[] = specs
    .filter((s) => headerSet.has(s.name))
    .map((s) => ({ column: s.name, missing: 0 }));
  const statByCol = new Map(columnStats.map((c) => [c.column, c]));

  let dmaCells = 0;
  let dmaResolved = 0;
  const dates: string[] = [];
  const dmaColumn = specs.find((s) => s.isDma)?.name;
  const dateColumn = specs.find((s) => s.type === 'date' && s.required)?.name;

  rows.forEach((rec, i) => {
    const rowNum = i + 1;
    for (const spec of specs) {
      if (!headerSet.has(spec.name)) continue;
      const value = rec[spec.name] ?? '';
      if (value === '') statByCol.get(spec.name)!.missing++;
      const problem = checkCell(spec, value);
      if (problem) {
        const target = spec.required ? errors : warnings;
        target.push({ row: rowNum, column: spec.name, message: problem });
      }
    }
    if (dmaColumn) {
      const v = rec[dmaColumn] ?? '';
      if (v !== '') {
        dmaCells++;
        const match = resolveDma(v);
        if (match.id) {
          dmaResolved++;
          if (!match.exact) {
            warnings.push({
              row: rowNum,
              column: dmaColumn,
              message: `fuzzy-matched "${v}" → "${match.suggestion}"`,
            });
          }
        } else {
          warnings.push({
            row: rowNum,
            column: dmaColumn,
            message: `DMA "${v}" did not resolve${match.suggestion ? ` (closest: ${match.suggestion})` : ''}`,
          });
        }
      }
    }
    if (dateColumn) {
      const v = rec[dateColumn];
      if (v && isValidDate(v)) dates.push(v);
    }
  });

  dates.sort();
  const dateRange = dates.length ? { start: dates[0], end: dates[dates.length - 1] } : null;
  const dmaResolutionRate = dmaCells > 0 ? dmaResolved / dmaCells : 1;

  return {
    kind,
    ok: errors.length === 0,
    rows,
    rowCount: rows.length,
    headers,
    columnStats,
    errors,
    warnings,
    dateRange,
    dmaResolutionRate,
  };
}
