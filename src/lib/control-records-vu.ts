import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';

/* ── Registos de control das Viaturas Usadas ───────────────────────────────────
 * O ficheiro VU tem UMA sheet "CONTROL" com um layout próprio (diferente do VN):
 * cabeçalho na primeira linha com dados, STATUS = FATURA | CARTEIRA, e colunas
 * PROV / 360º / RECOND / DGARANT / GARANT 3S específicas dos usados.
 * Guardado na tabela control_records_vu; alimenta a WIP da secção VU (ótica da
 * fatura). NÃO se mistura com os dados VN.
 * ──────────────────────────────────────────────────────────────────────────── */

const TABLE = 'control_records_vu';

export interface VuRecord {
  id?: string;
  status: string;      // FATURA | CARTEIRA
  dtFecho: Date | null;
  mes1: string;
  resp: string;
  cliente: string;
  type: string;        // VU | VD
  biz: string;
  chassis: string;
  mat: string;
  model: string;
  version: string;
  gar: string;         // GAR | nGAR
  prov: string;        // REMARK | RETOMA | CONSIGN | LEILÃO
  ret: number;         // 0/1
  fin: string;         // PP | FS | EXT
  a360: number;        // 0/1 (coluna "360º")
  recond: number;      // 0/1
  dfat: Date | null;
  dgarant: string;
  garant3s: string;
  obs: string;
}

/* ── Parser do ficheiro VU ──────────────────────────────────────────────────── */

const norm = (v: unknown) =>
  String(v ?? '').trim().toUpperCase().replace(/º/g, '').replace(/\s+/g, ' ');

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

function toNum(v: unknown): number {
  if (v == null || v === '') return 0;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

/** Normaliza uma data de garantia (DGARANT / GARANT 3S) para ISO 'AAAA-MM-DD'
 *  quando o valor é reconhecível como data (célula de data do Excel, serial ou
 *  string parseável). Caso contrário devolve a string original — assim, enquanto
 *  o ficheiro ainda não estiver no formato data, mostra-se o valor tal como está
 *  e, depois de corrigido, passa automaticamente a data. */
export function garantiaToIso(v: unknown): string {
  const d = toDate(v);
  return d ? d.toISOString().slice(0, 10) : str(v);
}

/** Lê a sheet CONTROL do ficheiro VU e devolve os registos (FATURA/CARTEIRA). */
export function parseVuControl(buffer: ArrayBuffer): VuRecord[] {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheetName = wb.SheetNames.find(n => n.trim().toUpperCase() === 'CONTROL') ?? wb.SheetNames[0];
  if (!sheetName) throw new Error('O ficheiro não tem nenhuma sheet.');
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '', raw: true, cellDates: true });

  // Encontrar a linha de cabeçalho (a que contém "STATUS").
  const headerIdx = rows.findIndex(r => Array.isArray(r) && r.some(c => norm(c) === 'STATUS'));
  if (headerIdx === -1) {
    throw new Error('Não foi encontrado o cabeçalho (coluna STATUS) na sheet CONTROL do ficheiro VU.');
  }
  const header = rows[headerIdx] as unknown[];
  const idx: Record<string, number> = {};
  header.forEach((c, i) => { const k = norm(c); if (k && !(k in idx)) idx[k] = i; });

  const at = (row: unknown[], ...names: string[]): unknown => {
    for (const n of names) { const i = idx[norm(n)]; if (i != null) return row[i]; }
    return '';
  };

  const out: VuRecord[] = [];
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r] as unknown[];
    if (!Array.isArray(row)) continue;
    const status = norm(at(row, 'STATUS'));
    const resp = str(at(row, 'RESP'));
    const cliente = str(at(row, 'CLIENTE'));
    // Ignora linhas sem conteúdo real (ex.: linhas de listas/validação).
    if (!status && !resp && !cliente) continue;
    if (status !== 'FATURA' && status !== 'CARTEIRA') continue;

    out.push({
      status,
      dtFecho: toDate(at(row, 'DT FECHO', 'DTFECHO')),
      mes1: str(at(row, 'MÊS1', 'MES1')),
      resp,
      cliente,
      type: str(at(row, 'TYPE')).toUpperCase(),
      biz: str(at(row, 'BIZ')),
      chassis: str(at(row, 'CHASSIS', 'CHAS')),
      mat: str(at(row, 'MAT')).toUpperCase(),
      model: str(at(row, 'MODEL')),
      version: str(at(row, 'VERSION')),
      gar: str(at(row, 'GAR')),
      prov: str(at(row, 'PROV')),
      ret: toNum(at(row, 'RET')),
      fin: str(at(row, 'FIN')),
      a360: toNum(at(row, '360º', '360')),
      recond: toNum(at(row, 'RECOND')),
      dfat: toDate(at(row, 'DFAT')),
      dgarant: garantiaToIso(at(row, 'DGARANT')),
      garant3s: garantiaToIso(at(row, 'GARANT 3S', 'GARANT3S')),
      obs: str(at(row, 'OBS')),
    });
  }
  return out;
}

/* ── DB: mapeamento linha <-> VuRecord ──────────────────────────────────────── */

interface DbRow {
  id: string;
  status: string | null; dt_fecho: string | null; mes1: string | null; resp: string | null;
  cliente: string | null; type: string | null; biz: string | null; chas: string | null;
  mat: string | null; model: string | null; version: string | null; gar: string | null;
  prov: string | null; ret: number | null; fin: string | null; a360: number | null;
  recond: number | null; dfat: string | null; dgarant: string | null; garant3s: string | null;
  obs: string | null;
}

const isoDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

function mapDbRow(r: DbRow): VuRecord {
  return {
    id: r.id,
    status: (r.status ?? '').toUpperCase(),
    dtFecho: r.dt_fecho ? new Date(r.dt_fecho) : null,
    mes1: r.mes1 ?? '',
    resp: r.resp ?? '',
    cliente: r.cliente ?? '',
    type: (r.type ?? '').toUpperCase(),
    biz: r.biz ?? '',
    chassis: r.chas ?? '',
    mat: r.mat ?? '',
    model: r.model ?? '',
    version: r.version ?? '',
    gar: r.gar ?? '',
    prov: r.prov ?? '',
    ret: r.ret == null ? 0 : Number(r.ret),
    fin: r.fin ?? '',
    a360: r.a360 == null ? 0 : Number(r.a360),
    recond: r.recond == null ? 0 : Number(r.recond),
    dfat: r.dfat ? new Date(r.dfat) : null,
    dgarant: r.dgarant ?? '',
    garant3s: r.garant3s ?? '',
    obs: r.obs ?? '',
  };
}

function recordToDbRow(v: VuRecord) {
  return {
    status: v.status || null,
    dt_fecho: isoDate(v.dtFecho),
    mes1: v.mes1 || null,
    resp: v.resp || null,
    cliente: v.cliente || null,
    type: v.type || null,
    biz: v.biz || null,
    chas: v.chassis || null,
    mat: v.mat || null,
    model: v.model || null,
    version: v.version || null,
    gar: v.gar || null,
    prov: v.prov || null,
    ret: v.ret,
    fin: v.fin || null,
    a360: v.a360,
    recond: v.recond,
    dfat: isoDate(v.dfat),
    dgarant: v.dgarant || null,
    garant3s: v.garant3s || null,
    obs: v.obs || null,
  };
}

/** Carrega todos os registos VU. O ficheiro VU já vem apenas com dados de usados
 *  (VU/VD), por isso não há filtro por tipo. */
export async function loadControlVuFromDb(): Promise<VuRecord[]> {
  const { data, error } = await supabase.from(TABLE).select('*');
  if (error || !data) return [];
  return (data as unknown as DbRow[]).map(mapDbRow);
}

/** Substitui todos os registos VU pelos fornecidos (snapshot da sheet CONTROL). */
export async function replaceControlRecordsVu(records: VuRecord[]): Promise<number> {
  if (records.length === 0) {
    throw new Error('A sheet CONTROL não tem registos VU (FATURA/CARTEIRA) — importação cancelada para não apagar os dados existentes.');
  }
  const { error: delError } = await supabase.from(TABLE).delete().not('id', 'is', null);
  if (delError) throw new Error(`Erro ao limpar registos VU existentes: ${delError.message}`);

  const rows = records.map(recordToDbRow);
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const { error } = await supabase.from(TABLE).insert(chunk);
    if (error) throw new Error(`Erro ao importar registos VU (lote ${i / BATCH + 1}): ${error.message}`);
  }
  return rows.length;
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
