'use client';

import { usePathname } from 'next/navigation';

const TITLES: Record<string, string> = {
  '/': 'Executive Command Center',
  '/geo': 'Geo Opportunity & DMA Intelligence',
  '/mmm': 'Marketing Mix Decomposition',
  '/weather': 'Weather Signal Lab',
  '/simulator': 'Scenario Simulator',
  '/optimizer': 'Budget Optimizer',
  '/creative': 'Creative Activation Briefs',
  '/experiments': 'Experiment Design',
  '/data': 'Data Spine',
  '/methodology': 'Methodology',
};

export default function TopHeader() {
  const pathname = usePathname();
  const title = TITLES[pathname] ?? 'Geo Demand Engine';
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b px-6 py-3.5 backdrop-blur"
      style={{ background: 'color-mix(in srgb, var(--background) 88%, transparent)' }}>
      <div>
        <h1 className="text-base font-semibold">{title}</h1>
        <p className="text-xs text-muted">Forecast horizon as of 2026-06-28</p>
      </div>
      <div className="flex items-center gap-3">
        <span className="hidden rounded-full border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3 py-1 text-xs font-medium text-[var(--accent)] sm:inline-flex">
          ● Demo Mode — synthetic data
        </span>
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--surface-2)] text-xs font-semibold">
          ZD
        </div>
      </div>
    </header>
  );
}
