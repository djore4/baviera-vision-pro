import { replaceTableRows } from '@/lib/replace-rows';
import type { ControlRecord } from '@/types/data';
import { toLocalIsoDay } from '@/lib/utils';

/** Data (Date) -> string 'AAAA-MM-DD' para colunas `date`, ou null. */
function isoDate(d: Date | null): string | null {
  if (!d || isNaN(d.getTime())) return null;
  return toLocalIsoDay(d);
}

/** Mapeia um registo da sheet CONTROL para uma linha da tabela control_records.
 *  (cliente -> id_cliente, M -> m, datas em ISO) */
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
    ret: r.ret || 0,
    fin: r.fin || null,
    week198: r.week198 || null,
    dmat: isoDate(r.dmat),
    date298: isoDate(r.date298),
    dfat: isoDate(r.dfat),
    obs: r.obs || null,
    mpa: 0,
    gkl: 0,
  };
}

/**
 * Substitui todos os registos da tabela control_records pelos registos
 * fornecidos (restauro de uma cópia de segurança).
 * Devolve o número de registos importados.
 */
export async function replaceControlRecords(records: ControlRecord[]): Promise<number> {
  // Proteção: nunca esvaziar a tabela a partir de um ficheiro sem registos.
  if (records.length === 0) {
    throw new Error('Sem registos — restauro cancelado para não apagar os dados existentes.');
  }

  // Uma só transação na BD (apagar + inserir): se algo falhar, os dados
  // anteriores ficam intactos.
  return replaceTableRows('control_records', records.map(controlRecordToRow), { label: 'registos' });
}
