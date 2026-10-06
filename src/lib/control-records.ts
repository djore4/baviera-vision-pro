import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { replaceTableRows, isMissingRpc } from '@/lib/replace-rows';
import { objetivosRowsFromExcel, replaceObjetivosFromExcel } from '@/lib/objetivos';
import type { AppData, ControlRecord } from '@/types/data';
import { toLocalIsoDay } from '@/lib/utils';

/** Data (Date) -> string 'AAAA-MM-DD' para colunas `date`, ou null. */
function isoDate(d: Date | null): string | null {
  if (!d || isNaN(d.getTime())) return null;
  return toLocalIsoDay(d);
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
    type: r.type || null,
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
    ret: r.ret || 0,
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

  // Uma só transação na BD (apagar + inserir): se algo falhar, os dados
  // anteriores ficam intactos.
  return replaceTableRows('control_records', records.map(controlRecordToRow), { label: 'registos' });
}

/**
 * Importa um Excel de control inteiro — registos de control e objetivos — numa
 * única transação na base de dados (RPC `import_control_excel`): ou entra tudo,
 * ou fica tudo como estava. Devolve o número de registos de control importados.
 */
export async function importControlExcel(parsed: AppData): Promise<number> {
  if (parsed.control.length === 0) {
    throw new Error('A sheet CONTROL não tem registos — importação cancelada para não apagar os dados existentes.');
  }
  const { orcRows, respRows } = objetivosRowsFromExcel(parsed);
  const { data, error } = await supabase.rpc('import_control_excel', {
    p_control: parsed.control.map(controlRecordToRow) as Json,
    p_orcamento: orcRows as unknown as Json,
    p_resp: respRows as unknown as Json,
  });
  if (isMissingRpc(error)) {
    // Migração por aplicar: caminho antigo, em dois passos (sem atomicidade).
    console.warn('import_control_excel em falta na base de dados: importação SEM atomicidade. Aplicar a migração 20261003150000.');
    const count = await replaceControlRecords(parsed.control);
    await replaceObjetivosFromExcel(parsed);
    return count;
  }
  if (error) throw new Error(`Erro ao importar o Excel (nada foi alterado): ${error.message}`);
  return Number(data ?? 0);
}
