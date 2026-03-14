import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { AppData, PeriodFilter, ControlRecord } from '@/types/data';
import { parseExcel, getDeliveryMonth } from '@/lib/excel-parser';

interface DataContextValue {
  data: AppData | null;
  loading: boolean;
  error: string | null;
  uploadFile: (file: File) => Promise<void>;
  filter: PeriodFilter;
  setFilter: React.Dispatch<React.SetStateAction<PeriodFilter>>;
  filteredControl: ControlRecord[];
  availablePeriods: { years: number[]; months: { year: number; month: number; label: string }[] };
}

const DataContext = createContext<DataContextValue | null>(null);

const STORAGE_KEY = 'baviera-control-data';

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<AppData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<PeriodFilter>({ years: [], quarters: [], months: [] });

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as AppData;
        // Rehydrate dates
        parsed.control = parsed.control.map(r => ({
          ...r,
          neg: r.neg ? new Date(r.neg) : null,
          dmat: r.dmat ? new Date(r.dmat) : null,
          date298: r.date298 ? new Date(r.date298) : null,
          app: r.app ? new Date(r.app) : null,
        }));
        setData(parsed);
      }
    } catch {
      // ignore
    }
  }, []);

  const uploadFile = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    try {
      const buffer = await file.arrayBuffer();
      const parsed = parseExcel(buffer);
      setData(parsed);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao processar ficheiro');
    } finally {
      setLoading(false);
    }
  }, []);

  const availablePeriods = React.useMemo(() => {
    if (!data) return { years: [], months: [] };
    const monthSet = new Set<string>();
    data.control.forEach(r => {
      const dm = getDeliveryMonth(r);
      if (dm) monthSet.add(dm);
      if (r.neg) {
        const y = r.neg.getFullYear();
        const m = String(r.neg.getMonth() + 1).padStart(2, '0');
        monthSet.add(`${y}/${m}`);
      }
    });
    const years = new Set<number>();
    const months: { year: number; month: number; label: string }[] = [];
    Array.from(monthSet).sort().forEach(s => {
      const [y, m] = s.split('/').map(Number);
      if (y && m) {
        years.add(y);
        const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        months.push({ year: y, month: m, label: `${monthNames[m - 1]} ${y}` });
      }
    });
    return { years: Array.from(years).sort(), months };
  }, [data]);

  const filteredControl = React.useMemo(() => {
    if (!data) return [];
    if (filter.years.length === 0 && filter.months.length === 0) return data.control;

    return data.control.filter(r => {
      const dm = getDeliveryMonth(r);
      if (!dm) return false;
      const [y, m] = dm.split('/').map(Number);
      if (!y || !m) return false;

      if (filter.months.length > 0) {
        return filter.months.some(fm => {
          const fy = Math.floor(fm / 100);
          const fmo = fm % 100;
          return y === fy && m === fmo;
        });
      }
      if (filter.quarters.length > 0) {
        const q = Math.ceil(m / 3);
        return filter.years.includes(y) && filter.quarters.includes(q);
      }
      if (filter.years.length > 0) {
        return filter.years.includes(y);
      }
      return true;
    });
  }, [data, filter]);

  return (
    <DataContext.Provider value={{ data, loading, error, uploadFile, filter, setFilter, filteredControl, availablePeriods }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}
