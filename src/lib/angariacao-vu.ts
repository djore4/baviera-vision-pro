import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';

/* ── Angariações · Viaturas Usadas ─────────────────────────────────────────────
 * O ficheiro VU tem uma sheet própria "ANGARIAÇÃO" (uma linha por viatura
 * angariada): DT ANG · RESP · CLIENTE · ANGAR (canal: INTERNA | EXTERNA | NET |
 * CONSIG) · MAT · MODEL · VERSION · ANO · KMS · V COMPRA.
 * Importada juntamente com a sheet CONTROL (tab Dados) para a tabela
 * angariacoes_vu, que alimenta o tab Angariação da secção VU.
 * ──────────────────────────────────────────────────────────────────────────── */

const TABLE = 'angariacoes_vu';

export interface Angariacao {
  id?: string;
  dtAng: Date | null;
  resp: string;
  cliente: string;
  angar: string;       // canal de angariação
  mat: string;
  model: string;
  version: string;
  ano: number | null;
  kms: number | null;
  vCompra: number | null;
}

/* Sem acentos e em maiúsculas (cabeçalhos, nome da sheet e canal). */
const norm = (v: unknown) =>
  String(v ?? '').trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');

const str = (v: unknown) => (v == null ? '' : String(v).trim());

function toDate(v: unknown): Date | null {
  if (v == null || v === '') return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === 'number') {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d;
}

/* Números do Excel ou texto ("15.000 €", "60 000", "15000,50"). */
function toNum(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let t = String(v).replace(/[\s€]/g, '');
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Lê a sheet ANGARIAÇÃO do ficheiro VU. Devolve null se o ficheiro não tiver
 *  essa sheet (a importação não mexe então nas angariações existentes). */
export function parseVuAngariacao(buffer: ArrayBuffer): Angariacao[] | null {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheetName = wb.SheetNames.find(n => norm(n) === 'ANGARIACAO');
  if (!sheetName) return null;
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1, defval: '', raw: true });

  const headerIdx = rows.findIndex(r => Array.isArray(r) && r.some(c => norm(c) === 'DT ANG'));
  if (headerIdx === -1) {
    throw new Error('Não foi encontrado o cabeçalho (coluna DT ANG) na sheet ANGARIAÇÃO do ficheiro VU.');
  }
  const idx: Record<string, number> = {};
  (rows[headerIdx] as unknown[]).forEach((c, i) => { const k = norm(c); if (k && !(k in idx)) idx[k] = i; });
  const at = (row: unknown[], ...names: string[]): unknown => {
    for (const n of names) { const i = idx[norm(n)]; if (i != null) return row[i]; }
    return '';
  };

  const out: Angariacao[] = [];
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r] as unknown[];
    if (!Array.isArray(row)) continue;
    const dtAng = toDate(at(row, 'DT ANG'));
    const resp = str(at(row, 'RESP')).toUpperCase();
    const mat = str(at(row, 'MAT')).toUpperCase();
    // Uma angariação real tem, pelo menos, data, responsável ou matrícula
    // (ignora restos soltos na folha, ex.: uma letra perdida numa célula).
    if (!dtAng && !resp && !mat) continue;
    const ano = toNum(at(row, 'ANO'));
    const kms = toNum(at(row, 'KMS'));
    out.push({
      dtAng,
      resp,
      cliente: str(at(row, 'CLIENTE')),
      angar: norm(at(row, 'ANGAR')),
      mat,
      model: str(at(row, 'MODEL')),
      version: str(at(row, 'VERSION')),
      ano: ano == null ? null : Math.round(ano),
      kms: kms == null ? null : Math.round(kms),
      vCompra: toNum(at(row, 'V COMPRA', 'VCOMPRA')),
    });
  }
  return out;
}

/* ── DB ─────────────────────────────────────────────────────────────────────── */

interface DbRow {
  id: string; dt_ang: string | null; resp: string | null; cliente: string | null; angar: string | null;
  mat: string | null; model: string | null; version: string | null; ano: number | null; kms: number | null;
  v_compra: number | string | null;
}

/* Data local → 'AAAA-MM-DD' (sem desvio de fuso). */
const isoDate = (d: Date | null) =>
  d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : null;

export async function loadAngariacoesVu(): Promise<Angariacao[]> {
  const { data, error } = await supabase.from(TABLE).select('*');
  if (error || !data) return [];
  return (data as unknown as DbRow[]).map(r => ({
    id: r.id,
    dtAng: r.dt_ang ? new Date(`${r.dt_ang}T00:00:00`) : null,
    resp: r.resp ?? '',
    cliente: r.cliente ?? '',
    angar: r.angar ?? '',
    mat: r.mat ?? '',
    model: r.model ?? '',
    version: r.version ?? '',
    ano: r.ano,
    kms: r.kms,
    vCompra: r.v_compra == null ? null : Number(r.v_compra),
  }));
}

/** Substitui todas as angariações pelas da sheet (snapshot). */
export async function replaceAngariacoesVu(rows: Angariacao[]): Promise<number> {
  const { error: delError } = await supabase.from(TABLE).delete().not('id', 'is', null);
  if (delError) throw new Error(`Erro ao limpar angariações existentes: ${delError.message}`);
  if (rows.length === 0) return 0;
  const payload = rows.map(a => ({
    dt_ang: isoDate(a.dtAng), resp: a.resp || null, cliente: a.cliente || null, angar: a.angar || null,
    mat: a.mat || null, model: a.model || null, version: a.version || null,
    ano: a.ano, kms: a.kms, v_compra: a.vCompra,
  }));
  const BATCH = 500;
  for (let i = 0; i < payload.length; i += BATCH) {
    const { error } = await supabase.from(TABLE).insert(payload.slice(i, i + BATCH));
    if (error) throw new Error(`Erro ao importar angariações (lote ${i / BATCH + 1}): ${error.message}`);
  }
  return payload.length;
}
