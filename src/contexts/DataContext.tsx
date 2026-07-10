import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { AppData, PeriodFilter, ControlRecord } from '@/types/data';
import { parseExcel, getDeliveryMonth } from '@/lib/excel-parser';
import { supabase } from '@/integrations/supabase/client';
import { replaceControlRecords } from '@/lib/control-records';
import { loadObjetivos, replaceObjetivosFromExcel } from '@/lib/objetivos';

interface DataContextValue {
  data: AppData | null;
  loading: boolean;
  error: string | null;
  uploadFile: (file: File) => Promise<number>;
  refresh: () => Promise<void>;
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
  id: string;
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
    id: r.id,
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

/** Carrega todos os registos de control a partir da tabela control_records. */
async function loadControlFromDb(): Promise<ControlRecord[]> {
  const { data: rows, error } = await supabase.from('control_records').select('*');
  if (error || !rows) return [];
  return (rows as unknown as DbControlRow[]).map(mapDbRow);
}

/** Fallback: lê o último Excel carregado no storage (usado enquanto o Supabase
 *  ainda não tem dados, para não deixar a app vazia durante a transição). */
async function loadExcelBackup(): Promise<AppData | null> {
  try {
    const { data: fileData, error } = await supabase.storage.from(BUCKET).download(FILE_PATH);
    if (error || !fileData) return null;
    return parseExcel(await fileData.arrayBuffer());
  } catch {
    return null;
  }
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

  // Recarrega tudo do Supabase (control_records + tabelas de objetivos).
  // Enquanto essas tabelas estiverem vazias, recorre ao último Excel carregado,
  // para a app nunca ficar sem dados durante a transição.
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [dbControl, dbObjetivos] = await Promise.all([
        loadControlFromDb(),
        loadObjetivos(),
      ]);

      let control = dbControl;
      let objetivosTotal = dbObjetivos.objetivosTotal;
      let objetivosResp = dbObjetivos.objetivosResp;

      // Fallback para o Excel se o Supabase ainda não tiver dados.
      const needControl = control.length === 0;
      const needObjetivos = objetivosTotal.length === 0 && objetivosResp.length === 0;
      if (needControl || needObjetivos) {
        const excel = await loadExcelBackup();
        if (excel) {
          if (needControl) control = excel.control;
          if (needObjetivos) { objetivosTotal = excel.objetivosTotal; objetivosResp = excel.objetivosResp; }
        }
      }

      if (control.length > 0 || objetivosTotal.length > 0 || objetivosResp.length > 0) {
        setData({
          control,
          objetivosTotal,
          objetivosResp,
          lastUpdated: new Date().toLocaleString('pt-PT'),
        });
      }
    } catch {
      // Sem dados ainda — o utilizador tem de importar/inserir primeiro.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Upload de Excel (apenas recurso): importa control + objetivos para o
  // Supabase ("gravar por cima") e recarrega os dados a partir da BD.
  // Devolve o número de registos de control importados.
  const uploadFile = useCallback(async (file: File): Promise<number> => {
    setLoading(true);
    setError(null);
    try {
      const buffer = await file.arrayBuffer();
      const parsed = parseExcel(buffer);

      // Importa para o Supabase (fonte de verdade única).
      const count = await replaceControlRecords(parsed.control);
      await replaceObjetivosFromExcel(parsed);

      // Guarda o Excel como cópia de segurança (já não é lido pela app).
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(FILE_PATH, file, { upsert: true });
      if (uploadError) console.warn('Backup do Excel falhou:', uploadError.message);

      // Recarrega a partir do Supabase.
      const [control, objetivos] = await Promise.all([loadControlFromDb(), loadObjetivos()]);
      setData({
        control,
        objetivosTotal: objetivos.objetivosTotal,
        objetivosResp: objetivos.objetivosResp,
        lastUpdated: new Date().toLocaleString('pt-PT'),
      });
      return count;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro ao processar ficheiro';
      setError(msg);
      throw e;
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
    <DataContext.Provider value={{ data, loading, error, uploadFile, refresh, filter, setFilter, filteredControl, availablePeriods }}>
      {children}
    </DataContext.Provider>
  );
}
export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}
