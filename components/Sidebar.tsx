'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

const NAV = [
  { href: '/', label: 'Command Center', icon: '◇' },
  { href: '/geo', label: 'Geo Intelligence', icon: '◈' },
  { href: '/mmm', label: 'MMM Decomposition', icon: '▤' },
  { href: '/weather', label: 'Weather Signal Lab', icon: '☁' },
  { href: '/simulator', label: 'Scenario Simulator', icon: '⊞' },
  { href: '/optimizer', label: 'Budget Optimizer', icon: '⊕' },
  { href: '/creative', label: 'Creative Briefs', icon: '✎' },
  { href: '/experiments', label: 'Experiment Design', icon: '⚗' },
  { href: '/data', label: 'Data Spine', icon: '▦' },
  { href: '/methodology', label: 'Methodology', icon: '❖' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Mobile top bar */}
      <div className="flex items-center justify-between border-b px-4 py-3 md:hidden">
        <Brand />
        <button
          onClick={() => setOpen((o) => !o)}
          className="rounded-md border px-3 py-1.5 text-sm text-muted"
        >
          Menu
        </button>
      </div>

      <aside
        className={`${
          open ? 'block' : 'hidden'
        } w-full shrink-0 border-b md:block md:w-64 md:border-b-0 md:border-r`}
        style={{ background: 'var(--surface)' }}
      >
        <div className="hidden px-5 py-5 md:block">
          <Brand />
        </div>
        <nav className="flex flex-col gap-0.5 p-3">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  active
                    ? 'bg-[var(--surface-2)] font-medium text-foreground'
                    : 'text-muted hover:bg-[var(--surface-2)] hover:text-foreground'
                }`}
              >
                <span className="w-4 text-center text-[var(--accent)]">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="px-5 py-4 text-xs text-muted">
          <div className="rounded-lg border border-dashed p-3 leading-relaxed">
            Heuristic models stand in for a future Bayesian/causal MMM engine. All data
            is synthetic.
          </div>
        </div>
      </aside>
    </>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent)] text-sm font-bold text-black">
        G
      </div>
      <div className="leading-tight">
        <div className="text-sm font-semibold">Geo Demand Engine</div>
        <div className="text-[10px] uppercase tracking-wider text-muted">
          Weather-Responsive MMM
        </div>
      </div>
    </div>
  );
}
