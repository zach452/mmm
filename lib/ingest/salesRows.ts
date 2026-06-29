/**
 * Typed extraction of validated sales rows for the data spine. Converts the
 * stringly-typed IngestResult rows into SalesObservation objects, resolving DMA
 * names to ids. Only rows whose DMA resolves and whose numbers parse are kept.
 */
import { ProductCategory, SalesObservation } from '../types';
import { IngestResult, resolveDma } from './schema';
import { PRODUCT_CATEGORIES } from '../mockData';

const CATEGORY_SET = new Set<string>(PRODUCT_CATEGORIES);

export function extractSalesRows(result: IngestResult): SalesObservation[] {
  if (result.kind !== 'sales') return [];
  const out: SalesObservation[] = [];
  for (const rec of result.rows) {
    const r = rec as Record<string, string>;
    const dma = resolveDma(r.dma ?? '');
    if (!dma.id) continue;
    const cat = r.product_category;
    if (!CATEGORY_SET.has(cat)) continue;
    const revenue = Number(r.revenue);
    const orders = Number(r.orders);
    if (!Number.isFinite(revenue) || !Number.isFinite(orders)) continue;
    out.push({
      date: r.date,
      dma: dma.id,
      product_category: cat as ProductCategory,
      revenue,
      orders,
      new_customers: Number(r.new_customers) || 0,
      returning_customers: Number(r.returning_customers) || 0,
      margin: Number.isFinite(Number(r.margin)) ? Number(r.margin) : 0.4,
    });
  }
  return out;
}
