'use client';

/**
 * Session-scoped data-spine store. Once a user uploads a VALID sales CSV on the
 * /data page, the parsed+validated rows are kept here (and mirrored to
 * localStorage so they survive navigation). Other pages read it via useDataSpine()
 * to decide whether to compute from uploaded client data or fall back to mock.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { SalesObservation } from '../types';

const STORAGE_KEY = 'gde.dataSpine.sales.v1';

export interface DataSpineState {
  sales: SalesObservation[] | null;
  fileName: string | null;
  uploadedAt: string | null;
}

interface DataSpineContextValue extends DataSpineState {
  hasSales: boolean;
  setSales: (rows: SalesObservation[], fileName: string) => void;
  clear: () => void;
}

const DataSpineContext = createContext<DataSpineContextValue | null>(null);

export function DataSpineProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DataSpineState>({
    sales: null,
    fileName: null,
    uploadedAt: null,
  });

  // hydrate from localStorage once on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from external storage (localStorage)
      if (raw) setState(JSON.parse(raw) as DataSpineState);
    } catch {
      // ignore malformed/unavailable storage
    }
  }, []);

  const setSales = useCallback((rows: SalesObservation[], fileName: string) => {
    const next: DataSpineState = {
      sales: rows,
      fileName,
      uploadedAt: new Date().toISOString(),
    };
    setState(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // storage may be full/unavailable; in-memory state still works
    }
  }, []);

  const clear = useCallback(() => {
    setState({ sales: null, fileName: null, uploadedAt: null });
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  const value = useMemo<DataSpineContextValue>(
    () => ({
      ...state,
      hasSales: !!state.sales && state.sales.length > 0,
      setSales,
      clear,
    }),
    [state, setSales, clear],
  );

  return <DataSpineContext.Provider value={value}>{children}</DataSpineContext.Provider>;
}

export function useDataSpine(): DataSpineContextValue {
  const ctx = useContext(DataSpineContext);
  if (!ctx) {
    throw new Error('useDataSpine must be used within a DataSpineProvider');
  }
  return ctx;
}
