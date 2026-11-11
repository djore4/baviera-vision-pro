import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { toLocalIsoDay } from '@/lib/utils';
import type { ControlRecord } from '@/types/data';

/* Controlo de faturas: o relatório de vendas exportado do sistema (uma linha por
 * viatura faturada) é cruzado com os registos por chassis e atualiza a data de
 * fatura (DFAT) e a data de matrícula (DMAT). O relatório manda: se a data
 * da plataforma for diferente, é substituída.
 *
 * Chassis: a base de dados guarda só os 7 últimos caracteres do VIN (ex.: FX46063),
 * o relatório traz o VIN completo — o cruzamento é pelos 7 últimos. */

export interface FaturaRow {
  vin: string;
  dfat: string | null;   // AAAA-MM-DD
  dmat: string | null;   // AAAA-MM-DD
  total: number | null;  // Total Venda (negativo = nota de crédito / movimento que neutraliza)
  estado: string;
}

export interface FaturaMovimento { vin: string; dfat: string | null; dmat: string | null }

const norm = (v: unknown) =>
  String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

/** Chave de cruzamento: 7 últimos caracteres do chassis/VIN, em maiúsculas. */
export function chassisKey(v: string | null | undefined): string {
  const c = String(v ?? '').replace(/\s+/g, '').toUpperCase();
  return c.length >= 7 ? c.slice(-7) : '';
}

/** Converte uma célula de data (serial Excel, texto dd/mm/aaaa ou aaaa-mm-dd) em AAAA-MM-DD. */
function cellToIso(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') {
    const p = XLSX.SSF.parse_date_code(v);
    if (!p) return null;
    return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
  }
  if (v instanceof Date) return isNaN(v.getTime()) ? null : toLocalIsoDay(v);
  const t = String(v).trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

const toNum = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/\s/g, '').replace(',', '.'));
  return isNaN(n) ? null : n;
};

/** Lê o relatório. O cabeçalho é procurado nas primeiras linhas (pela coluna VIN),
 *  para aguentar linhas de título acima da tabela. */
export function parseFaturasReport(buffer: ArrayBuffer): FaturaRow[] {
  const wb = XLSX.read(buffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error('O ficheiro não tem folhas.');
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '', raw: true });

  const headerIdx = raw.slice(0, 30).findIndex(r => r.some(c => norm(c) === 'vin'));
  if (headerIdx < 0) throw new Error('Não encontrei a coluna "VIN" no ficheiro — é o relatório de vendas certo?');
  const header = raw[headerIdx].map(norm);
  const col = (...names: string[]) => header.findIndex(h => names.includes(h));
  const iVin = col('vin');
  const iDfat = col('dt. fat. venda', 'dt. fat venda', 'data fatura venda');
  const iDmat = col('dt. matricula', 'dt. matricula.', 'data matricula');
  const iTotal = col('total venda');
  const iEstado = col('estado');
  if (iDfat < 0) throw new Error('Não encontrei a coluna "Dt. Fat. Venda" no ficheiro.');

  const rows: FaturaRow[] = [];
  for (const r of raw.slice(headerIdx + 1)) {
    const vin = String(r[iVin] ?? '').trim().toUpperCase();
    if (chassisKey(vin) === '') continue; // linhas vazias, rodapés
    rows.push({
      vin,
      dfat: cellToIso(r[iDfat]),
      dmat: iDmat >= 0 ? cellToIso(r[iDmat]) : null,
      total: iTotal >= 0 ? toNum(r[iTotal]) : null,
      estado: iEstado >= 0 ? String(r[iEstado] ?? '').trim() : '',
    });
  }
  return rows;
}

export interface FaturasResolvidas {
  movimentos: FaturaMovimento[];
  /** VIN cujos movimentos se neutralizam (fatura anulada, saldo ≤ 0): não há data a aplicar. */
  anuladas: string[];
}

/** Resolve os movimentos por viatura: se houver notas de crédito que neutralizam a
 *  fatura (saldo zero), a viatura fica sem fatura; caso contrário vale o movimento
 *  positivo mais recente. */
export function resolveFaturas(rows: FaturaRow[]): FaturasResolvidas {
  const byVin = new Map<string, FaturaRow[]>();
  for (const r of rows) {
    if (/anul|cancel/.test(norm(r.estado))) continue;
    const k = r.vin;
    byVin.set(k, [...(byVin.get(k) ?? []), r]);
  }
  const movimentos: FaturaMovimento[] = [];
  const anuladas: string[] = [];
  for (const [vin, list] of byVin) {
    const comTotal = list.filter(r => r.total !== null);
    const saldo = comTotal.reduce((s, r) => s + (r.total ?? 0), 0);
    if (comTotal.length > 0 && saldo < 0.005) {
      anuladas.push(vin); continue;
    }
    const positivos = list.filter(r => (r.total ?? 1) > 0 && r.dfat);
    const pool = positivos.length > 0 ? positivos : list.filter(r => r.dfat);
    if (pool.length === 0) continue;
    const last = pool.reduce((a, b) => ((b.dfat ?? '') >= (a.dfat ?? '') ? b : a));
    movimentos.push({ vin, dfat: last.dfat, dmat: last.dmat });
  }
  return { movimentos, anuladas };
}

export interface FaturaChange {
  id: string;
  vin: string;
  resp: string;
  cliente: string;
  chas: string;
  type: string;
  dfat?: { de: string | null; para: string };
  dmat?: { de: string | null; para: string };
}

export interface FaturasPlano {
  alteracoes: FaturaChange[];
  iguais: number;
  /** Chassis do relatório sem registo na plataforma. */
  semCorrespondencia: string[];
  /** Chassis do relatório com mais de um registo possível: nunca são gravados. */
  ambiguos: { vin: string; registos: number }[];
  anuladas: string[];
}

const isoOf = (d: Date | null | undefined) => (d && !isNaN(d.getTime()) ? toLocalIsoDay(d) : null);

/** Cruza o relatório com os registos e calcula o que mudaria. Não grava nada. */
export function planFaturas(records: ControlRecord[], rows: FaturaRow[]): FaturasPlano {
  const { movimentos, anuladas } = resolveFaturas(rows);
  const byKey = new Map<string, ControlRecord[]>();
  for (const r of records) {
    const k = chassisKey(r.chas);
    if (k) byKey.set(k, [...(byKey.get(k) ?? []), r]);
  }
  const plano: FaturasPlano = { alteracoes: [], iguais: 0, semCorrespondencia: [], ambiguos: [], anuladas };
  for (const m of movimentos) {
    const hits = byKey.get(chassisKey(m.vin)) ?? [];
    if (hits.length === 0) { plano.semCorrespondencia.push(m.vin); continue; }
    if (hits.length > 1) { plano.ambiguos.push({ vin: m.vin, registos: hits.length }); continue; }
    const rec = hits[0];
    if (!rec.id) { plano.semCorrespondencia.push(m.vin); continue; }
    const change: FaturaChange = { id: rec.id, vin: m.vin, resp: rec.resp, cliente: rec.cliente, chas: rec.chas, type: rec.type };
    const dfatAtual = isoOf(rec.dfat);
    const dmatAtual = isoOf(rec.dmat);
    if (m.dfat && m.dfat !== dfatAtual) change.dfat = { de: dfatAtual, para: m.dfat };
    if (m.dmat && m.dmat !== dmatAtual) change.dmat = { de: dmatAtual, para: m.dmat };
    if (change.dfat || change.dmat) plano.alteracoes.push(change);
    else plano.iguais++;
  }
  return plano;
}

/** Grava as alterações (só os campos que mudam). Devolve o número de registos atualizados. */
export async function aplicarFaturas(alteracoes: FaturaChange[]): Promise<number> {
  let n = 0;
  for (let i = 0; i < alteracoes.length; i += 10) {
    const lote = alteracoes.slice(i, i + 10);
    const res = await Promise.all(lote.map(async a => {
      const patch: { dfat?: string; dmat?: string } = {};
      if (a.dfat) patch.dfat = a.dfat.para;
      if (a.dmat) patch.dmat = a.dmat.para;
      const { data, error } = await supabase.from('control_records').update(patch).eq('id', a.id).select('id');
      if (error) throw new Error(`Erro ao gravar o chassis ${a.chas}: ${error.message}`);
      return data?.length ?? 0;
    }));
    n += res.reduce((s, x) => s + x, 0);
  }
  return n;
}
