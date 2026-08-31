import { supabase } from '@/integrations/supabase/client';
import type { ControlRecord } from '@/types/data';

/** Data (Date) -> string 'AAAA-MM-DD' para colunas `date`, ou null. */
function isoDate(d: Date | null): string | null {
  if (!d || isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/** Mapeia um registo da sheet CONTROL para uma linha da tabela control_records.
 *  (mesma semântica do excel-parser: cliente -> id_cliente, M -> m, datas em ISO) */
export function controlRecordToRow(r: ControlRecord) {
  return {
    status: r.status || null,
    neg: isoDate(r.neg),
    mes1: r.mes1 || null,
    resp: r.resp || null,
    id_cliente: r.cliente || null,
    local: r.local || null,
    type: r.type || null,
    origin: r.origin || null,
    profile: r.profile || null,
    biz: r.biz || null,
    enc: r.enc || null,
    chas: r.chas || null,
    mat: r.mat || null,
    model: r.model || null,
    version: r.version || null,
    gar: r.gar || null,
    qor: r.qor || 0,
    xev: r.xev || 0,
    bev: r.bev || 0,
    m: r.mPerf || 0,
    csc: r.csc || 0,
    cme: r.cme,
    fin: r.fin || null,
    week198: r.week198 || null,
    dmat: isoDate(r.dmat),
    date298: isoDate(r.date298),
    app: isoDate(r.app),
    dfat: isoDate(r.dfat),
    obs: r.obs || null,
    mpa: 0,
    gkl: 0,
  };
}

/**
 * Substitui todos os registos da tabela control_records pelos registos
 * fornecidos (importação de um snapshot completo da sheet CONTROL).
 * Devolve o número de registos importados.
 */
export async function replaceControlRecords(records: ControlRecord[]): Promise<number> {
  // Proteção: nunca esvaziar a tabela a partir de um ficheiro sem registos.
  if (records.length === 0) {
    throw new Error('A sheet CONTROL não tem registos — importação cancelada para não apagar os dados existentes.');
  }

  // Apaga todos os registos atuais (todas as linhas têm id não-nulo).
  const { error: delError } = await supabase
    .from('control_records')
    .delete()
    .not('id', 'is', null);
  if (delError) throw new Error(`Erro ao limpar registos existentes: ${delError.message}`);

  const rows = records.map(controlRecordToRow);
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const { error } = await supabase.from('control_records').insert(chunk);
    if (error) throw new Error(`Erro ao importar registos (lote ${i / BATCH + 1}): ${error.message}`);
  }
  return rows.length;
}
