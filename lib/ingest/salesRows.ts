/**
 * Typed extraction of validated transaction rows for the data spine. Converts the
 * stringly-typed IngestResult rows into ServiceObservation objects, resolving DMA
 * names to ids. Only rows whose DMA resolves and whose numbers parse are kept.
 */
import { ServiceLine, ServiceObservation } from '../types';
import { IngestResult, resolveDma } from './schema';
import { SERVICE_LINES } from '../mockData';

const SERVICE_LINE_SET = new Set<string>(SERVICE_LINES);

export function extractSalesRows(result: IngestResult): ServiceObservation[] {
  if (result.kind !== 'sales') return [];
  const out: ServiceObservation[] = [];
  for (const rec of result.rows) {
    const r = rec as Record<string, string>;
    const dma = resolveDma(r.dma ?? '');
    if (!dma.id) continue;
    const sl = r.service_line;
    if (!SERVICE_LINE_SET.has(sl)) continue;
    const revenue = Number(r.revenue);
    const transactions = Number(r.transactions);
    if (!Number.isFinite(revenue) || !Number.isFinite(transactions)) continue;
    const avgTicket = Number.isFinite(Number(r.avg_ticket)) && Number(r.avg_ticket) > 0
      ? Number(r.avg_ticket)
      : transactions > 0
        ? Math.round(revenue / transactions)
        : 0;
    out.push({
      date: r.date,
      dma: dma.id,
      service_line: sl as ServiceLine,
      revenue,
      transactions,
      new_customers: Number(r.new_customers) || 0,
      returning_customers: Number(r.returning_customers) || 0,
      margin: Number.isFinite(Number(r.margin)) ? Number(r.margin) : 0.42,
      avg_ticket: avgTicket,
      coupon_redemption_rate: Number.isFinite(Number(r.coupon_redemption))
        ? Number(r.coupon_redemption)
        : 0,
    });
  }
  return out;
}
