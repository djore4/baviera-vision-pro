import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { AppData, PeriodFilter, ControlRecord, ObjetivoTotal, ObjetivoResp } from '@/types/data';
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

/** Linha da tabela control_records (tab "database"). */
interface DbControlRow {
  status: string | null; neg: string | null; mes1: string | null; resp: string | null;
  id_cliente: string | null; cliente: string | null; local: string | null; type: string | null;
  origin: string | null; profile: string | null; biz: string | null; enc: string | null;
  chas: string | null; mat: string | null; model: string | null; version: string | null;
  gar: string | null; qor: number | null; xev: number | null; bev: number | null; m: number | null;
  csc: number | null; cme: number | null; fin: string | null; week198: string | null;
  dmat: string | null; date298: string | null; app: string | null; obs: string | null;
}

const s = (v: string | null | undefined) => v ?? '';
const nz = (v: number | null | undefined) => (v == null ? 0 : Number(v));
const dt = (v: string | null | undefined) => (v ? new Date(v) : null);

/** Mapeia uma linha de control_records para o formato ControlRecord usado nos dashboards. */
function mapDbRow(r: DbControlRow): ControlRecord {
  return {
    status: s(r.status),
    neg: dt(r.neg),
    mes1: s(r.mes1),
    resp: s(r.resp),
    cliente: s(r.id_cliente ?? r.cliente),
    local: s(r.local),
    type: s(r.type),
    origin: s(r.origin),
    profile: s(r.profile),
    biz: s(r.biz),
    enc: s(r.enc),
    chas: s(r.chas),
    mat: s(r.mat),
    model: s(r.model),
    version: s(r.version),
    gar: s(r.gar),
    qor: nz(r.qor),
    xev: nz(r.xev),
    bev: nz(r.bev),
    mPerf: nz(r.m),
    csc: nz(r.csc),
    cme: r.cme == null ? null : Number(r.cme),
    fin: s(r.fin),
    week198: s(r.week198),
    dmat: dt(r.dmat),
    date298: dt(r.date298),
    app: dt(r.app),
    obs: s(r.obs),
  };
}

/** Carrega os objetivos a partir do último Excel carregado (o control já vem da BD). */
async function loadObjetivosFromExcel(): Promise<{ objetivosTotal: ObjetivoTotal[]; objetivosResp: ObjetivoResp[] }> {
  try {
    const { data: fileData, error } = await supabase.storage.from(BUCKET).download(FILE_PATH);
    if (error || !fileData) return { objetivosTotal: [], objetivosResp: [] };
    const parsed = parseExcel(await fileData.arrayBuffer());
    return { objetivosTotal: parsed.objetivosTotal, objetivosResp: parsed.objetivosResp };
  } catch {
    return { objetivosTotal: [], objetivosResp: [] };
  }
}

/** Carrega todos os registos de control a partir da tabela control_records. */
async function loadControlFromDb(): Promise<ControlRecord[]> {
  const { data: rows, error } = await supabase.from('control_records').select('*');
  if (error || !rows) return [];
  return (rows as unknown as DbControlRow[]).map(mapDbRow);
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

  // Ao montar: control a partir da tabela control_records; objetivos do último Excel.
  useEffect(() => {
    async function loadInitial() {
      setLoading(true);
      try {
        const [control, objetivos] = await Promise.all([
          loadControlFromDb(),
          loadObjetivosFromExcel(),
        ]);

        if (control.length > 0 || objetivos.objetivosTotal.length > 0 || objetivos.objetivosResp.length > 0) {
          setData({
            control,
            objetivosTotal: objetivos.objetivosTotal,
            objetivosResp: objetivos.objetivosResp,
            lastUpdated: new Date().toLocaleString('pt-PT'),
          });
        }
      } catch {
        // Sem dados ainda — o utilizador tem de importar/inserir primeiro.
      } finally {
        setLoading(false);
      }
    }

    loadInitial();
  }, []);

  const uploadFile = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    try {
      const buffer = await file.arrayBuffer();
      const parsed = parseExcel(buffer);

      // Guarda o Excel no storage (apenas para os objetivos; o control vive na BD).
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(FILE_PATH, file, { upsert: true });

      if (uploadError) {
        console.error('Supabase upload error:', uploadError);
        throw new Error(`Erro ao guardar ficheiro: ${uploadError.message}`);
      }

      // O control já foi importado para control_records (ver DadosPage); usamos o
      // parse fresco em memória — é equivalente ao que está agora na BD.
      setData({
        control: parsed.control,
        objetivosTotal: parsed.objetivosTotal,
        objetivosResp: parsed.objetivosResp,
        lastUpdated: new Date().toLocaleString('pt-PT'),
      });
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
