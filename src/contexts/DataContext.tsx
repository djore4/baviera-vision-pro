import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { AppData, PeriodFilter, ControlRecord } from '@/types/data';
import { parseExcel, getDeliveryMonth } from '@/lib/excel-parser';
import { supabase } from '@/integrations/supabase/client';

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

const BUCKET = 'excel-files';
const FILE_PATH = 'bmw-business-control.xlsx';

function rehydrateDates(records: ControlRecord[]): ControlRecord[] {
  return records.map(r => ({
    ...r,
    neg: r.neg ? new Date(r.neg) : null,
    dmat: r.dmat ? new Date(r.dmat) : null,
    date298: r.date298 ? new Date(r.date298) : null,
    app: r.app ? new Date(r.app) : null,
  }));
}

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<AppData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<PeriodFilter>(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    return { years: [year], quarters: [], months: [year * 100 + month] };
  });

  // Load from cloud storage on mount
  useEffect(() => {
    async function loadFromStorage() {
      setLoading(true);
      try {
        const { data: fileData, error: dlError } = await supabase.storage
          .from(BUCKET)
          .download(FILE_PATH);

        if (dlError || !fileData) {
          // No file stored yet — that's fine, user needs to upload first
          setLoading(false);
          return;
        }

        const buffer = await fileData.arrayBuffer();
        const parsed = parseExcel(buffer);
        setData(parsed);
      } catch {
        // No file yet, ignore
      } finally {
        setLoading(false);
      }
    }

    loadFromStorage();
  }, []);

  const uploadFile = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    try {
      const buffer = await file.arrayBuffer();
      const parsed = parseExcel(buffer);

      // Upload to cloud storage (upsert replaces if exists)
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(FILE_PATH, file, { upsert: true });

      if (uploadError) {
        throw new Error(`Erro ao guardar ficheiro: ${uploadError.message}`);
      }

      setData(parsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao processar ficheiro');
    } finally {
      setLoading(false);
    }
  }, []);

  const availablePeriods = React.useMemo(() => {
    if (!data) return { years: [], months: [] };
    const yearsSet = new Set<number>();
    data.control.forEach(r => {
      const dm = getDeliveryMonth(r);
      if (dm) {
        const [y] = dm.split('/').map(Number);
        if (y) yearsSet.add(y);
      }
      if (r.neg) yearsSet.add(r.neg.getFullYear());
    });
    const years = Array.from(yearsSet).sort();
    const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const months: { year: number; month: number; label: string }[] = [];
    years.forEach(y => {
      for (let m = 1; m <= 12; m++) {
        months.push({ year: y, month: m, label: `${monthNames[m - 1]} ${y}` });
      }
    });
    return { years, months };
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
