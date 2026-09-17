import { supabase } from '@/integrations/supabase/client';
import type { ControlRecord } from '@/types/data';
import { controlRecordToRow } from '@/lib/control-records';

/* ── Registos de control das Viaturas Usadas ───────────────────────────────────
 * Mesmo formato do control VN (sheet CONTROL), mas guardado numa tabela separada
 * (control_records_vu) para não misturar com os dados VN. Alimenta a WIP VU.
 * ──────────────────────────────────────────────────────────────────────────── */

const TABLE = 'control_records_vu';

interface DbRow {
  id: string;
  status: string | null; neg: string | null; mes1: string | null; resp: string | null;
  id_cliente: string | null; cliente: string | null; type: string | null;
  biz: string | null; enc: string | null;
  chas: string | null; mat: string | null; model: string | null; version: string | null;
  gar: string | null; qor: number | null; xev: number | null; bev: number | null; m: number | null;
  csc: number | null; cme: number | null; ret: number | null; fin: string | null; week198: string | null;
  dmat: string | null; date298: string | null; app: string | null; dfat: string | null; obs: string | null;
}

const s = (v: string | null | undefined) => v ?? '';
const nz = (v: number | null | undefined) => (v == null ? 0 : Number(v));
const dt = (v: string | null | undefined) => (v ? new Date(v) : null);

function mapDbRow(r: DbRow): ControlRecord {
  return {
    id: r.id,
    status: s(r.status), neg: dt(r.neg), mes1: s(r.mes1), resp: s(r.resp),
    cliente: s(r.id_cliente ?? r.cliente), type: s(r.type), biz: s(r.biz), enc: s(r.enc),
    chas: s(r.chas), mat: s(r.mat), model: s(r.model), version: s(r.version),
    gar: s(r.gar), qor: nz(r.qor), xev: nz(r.xev), bev: nz(r.bev), mPerf: nz(r.m),
    csc: nz(r.csc), cme: r.cme == null ? null : Number(r.cme), ret: nz(r.ret),
    fin: s(r.fin), week198: s(r.week198),
    dmat: dt(r.dmat), date298: dt(r.date298), app: dt(r.app), dfat: dt(r.dfat), obs: s(r.obs),
  };
}

/** Carrega apenas os registos VU (type = 'VU'). O ficheiro importado pode conter
 *  registos de outros tipos (VN/VD/VP) — o dashboard VU só usa os de usados. */
export async function loadControlVuFromDb(): Promise<ControlRecord[]> {
  const { data, error } = await supabase.from(TABLE).select('*').eq('type', 'VU');
  if (error || !data) return [];
  return (data as unknown as DbRow[]).map(mapDbRow);
}

/* ── Objetivos de faturas VU (por mês) ── */
export interface VuObjetivo { mes: string; faturas: number; }

export async function listVuObjetivos(): Promise<VuObjetivo[]> {
  const { data, error } = await supabase.from('vu_objetivos').select('mes, faturas');
  if (error || !data) return [];
  return (data as { mes: string; faturas: number }[]).map(o => ({ mes: o.mes, faturas: Number(o.faturas) || 0 }));
}

export async function setVuObjetivo(mes: string, faturas: number): Promise<void> {
  const { error } = await supabase
    .from('vu_objetivos')
    .upsert({ mes, faturas, updated_at: new Date().toISOString() }, { onConflict: 'mes' });
  if (error) throw error;
}

/** Substitui todos os registos VU pelos fornecidos (snapshot da sheet CONTROL). */
export async function replaceControlRecordsVu(records: ControlRecord[]): Promise<number> {
  if (records.length === 0) {
    throw new Error('A sheet CONTROL não tem registos — importação cancelada para não apagar os dados existentes.');
  }
  const { error: delError } = await supabase.from(TABLE).delete().not('id', 'is', null);
  if (delError) throw new Error(`Erro ao limpar registos VU existentes: ${delError.message}`);

  const rows = records.map(controlRecordToRow);
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const { error } = await supabase.from(TABLE).insert(chunk);
    if (error) throw new Error(`Erro ao importar registos VU (lote ${i / BATCH + 1}): ${error.message}`);
  }
  return rows.length;
}
