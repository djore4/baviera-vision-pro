import { supabase } from '@/integrations/supabase/client';
import { toLocalIsoDay } from '@/lib/utils';

/* ── Registos de control das Viaturas Usadas ───────────────────────────────────
 * Layout próprio (diferente do VN): STATUS = FATURA | CARTEIRA (WIP) ou
 * FRIO | MORNO | QUENTE (funil de vendas), e campos PROV / 360º / RECOND /
 * DGARANT / GARANT 3S específicos dos usados.
 * Guardado na tabela control_records_vu; alimenta a WIP (só FATURA/CARTEIRA) e o
 * Funil (só FRIO/MORNO/QUENTE) da secção VU. NÃO se mistura com os dados VN.
 * Gerido diretamente na plataforma (ver "Gestão direta" mais abaixo).
 * ──────────────────────────────────────────────────────────────────────────── */

const TABLE = 'control_records_vu';

/** Status que entram na WIP VU. */
export const VU_WIP_STATUSES = ['FATURA', 'CARTEIRA'] as const;
/** Status do funil de vendas VU (negócios ainda não fechados). */
export const VU_FUNIL_STATUSES = ['FRIO', 'MORNO', 'QUENTE'] as const;

export const isVuWipStatus = (s: string) => (VU_WIP_STATUSES as readonly string[]).includes(s);
export const isVuFunilStatus = (s: string) => (VU_FUNIL_STATUSES as readonly string[]).includes(s);

export interface VuRecord {
  id?: string;
  status: string;      // FATURA | CARTEIRA | FRIO | MORNO | QUENTE
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

/** Carrega todos os registos VU (a tabela só tem usados, VU/VD: sem filtro por tipo). */
export async function loadControlVuFromDb(): Promise<VuRecord[]> {
  const { data, error } = await supabase.from(TABLE).select('*');
  if (error || !data) return [];
  return (data as unknown as DbRow[]).map(mapDbRow);
}

/* ── Gestão direta na plataforma ───────────────────────────────────────────────
 * Os negócios VU são criados, alterados e eliminados na plataforma (já não há
 * importação do Excel). Quem escreve é quem tem edição em Dados (RLS de
 * control_records_vu). O formulário trabalha com as colunas da tabela, com datas
 * ISO ('AAAA-MM-DD') e flags 0/1. */

/** Evento global emitido após criar/editar/eliminar um negócio VU (as vistas recarregam). */
export const VU_RECORDS_CHANGED_EVENT = 'control-records-vu-changed';

export const VU_STATUS_OPTS = [...VU_FUNIL_STATUSES, ...VU_WIP_STATUSES] as const;
export const VU_TYPE_OPTS = ['VU', 'VD'];
export const VU_GAR_OPTS = ['GAR', 'nGAR'];
export const VU_PROV_OPTS = ['REMARK', 'RETOMA', 'CONSIGN', 'LEILÃO'];
export const VU_FIN_OPTS = ['PP', 'FS', 'EXT'];

export interface VuForm {
  status: string; dt_fecho: string; mes1: string; resp: string; cliente: string;
  type: string; biz: string; chas: string; mat: string; model: string; version: string; gar: string;
  prov: string; ret: number; fin: string; a360: number; recond: number;
  dfat: string; dgarant: string; garant3s: string; obs: string;
}

export const EMPTY_VU_FORM: VuForm = {
  status: '', dt_fecho: '', mes1: '', resp: '', cliente: '',
  type: 'VU', biz: '', chas: '', mat: '', model: '', version: '', gar: '',
  prov: '', ret: 0, fin: '', a360: 0, recond: 0,
  dfat: '', dgarant: '', garant3s: '', obs: '',
};

const dia = (d: Date) => toLocalIsoDay(d);

/** Reage a uma mudança de estado no formulário, como no VN: ao fechar um negócio do
 *  funil, a data de fecho fica a de hoje; ao passar a FATURA, a data de fatura fica a
 *  de hoje (sem ela a fatura não aparece em nenhum mês da WIP). Só preenche o que
 *  está vazio — nunca sobrescreve uma data já escolhida. */
export function applyVuStatusChange(form: VuForm, status: string, hoje: Date = new Date()): VuForm {
  const prev = form.status;
  const next: VuForm = { ...form, status };
  const fechou = isVuWipStatus(status) && !isVuWipStatus(prev);
  if (fechou && !next.dt_fecho) next.dt_fecho = dia(hoje);
  if (status === 'FATURA' && prev !== 'FATURA' && !next.dfat) next.dfat = dia(hoje);
  return next;
}

/** Valida o formulário. Sem estado o negócio não apareceria em nenhuma vista. */
export function validateVuForm(f: VuForm): string | null {
  if (!VU_STATUS_OPTS.includes(f.status.trim().toUpperCase() as typeof VU_STATUS_OPTS[number])) {
    return 'Escolhe o estado do negócio (Frio, Morno, Quente, Carteira ou Fatura).';
  }
  if (f.status.trim().toUpperCase() === 'FATURA' && !f.dfat) {
    return 'Uma fatura precisa da data de fatura (DFAT).';
  }
  return null;
}

/** Colunas a gravar a partir do formulário (normaliza maiúsculas e vazios → null). */
export function vuFormToDb(f: VuForm) {
  const t = (v: string) => v.trim() || null;
  return {
    status: f.status.trim().toUpperCase(),
    dt_fecho: t(f.dt_fecho),
    mes1: t(f.mes1),
    resp: t(f.resp.toUpperCase().replace(/\s+/g, '')),
    cliente: t(f.cliente),
    type: t(f.type.toUpperCase()),
    biz: t(f.biz),
    chas: t(f.chas.toUpperCase().replace(/\s+/g, '')),
    mat: t(f.mat.toUpperCase()),
    model: t(f.model),
    version: t(f.version),
    gar: t(f.gar),
    prov: t(f.prov),
    ret: f.ret ? 1 : 0,
    fin: t(f.fin),
    a360: f.a360 ? 1 : 0,
    recond: f.recond ? 1 : 0,
    dfat: t(f.dfat),
    dgarant: t(f.dgarant),
    garant3s: t(f.garant3s),
    obs: t(f.obs),
  };
}

/** Lê um negócio VU para edição. */
export async function getControlVuForm(id: string): Promise<VuForm | null> {
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).single();
  if (error || !data) return null;
  const row = data as Record<string, unknown>;
  const out: Record<string, unknown> = { ...EMPTY_VU_FORM };
  for (const k of Object.keys(EMPTY_VU_FORM)) {
    const v = row[k];
    if (v !== undefined && v !== null) out[k] = typeof EMPTY_VU_FORM[k as keyof VuForm] === 'number' ? Number(v) : String(v);
  }
  out.status = String(out.status).toUpperCase();
  return out as unknown as VuForm;
}

/** Cria (sem id) ou atualiza (com id) um negócio VU. */
export async function saveControlVu(form: VuForm, id?: string | null): Promise<void> {
  const payload = vuFormToDb(form);
  const { error } = id
    ? await supabase.from(TABLE).update(payload).eq('id', id)
    : await supabase.from(TABLE).insert(payload);
  if (error) throw new Error(error.message);
}

/** Elimina um negócio VU. */
export async function deleteControlVu(id: string): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/* ── Objetivos de faturas VU (por mês, 'AAAA/MM') ──
 * Dois valores por mês: objetivo BMW e orçamento Caetano. Na BD o orçamento
 * Caetano é a coluna `faturas` (já existia) e o objetivo BMW a coluna `bmw`. */
export interface VuObjetivo { mes: string; bmw: number; caetano: number; }

export async function listVuObjetivos(): Promise<VuObjetivo[]> {
  const { data, error } = await supabase.from('vu_objetivos').select('mes, faturas, bmw');
  if (error) throw error;
  return ((data ?? []) as { mes: string; faturas: number; bmw: number }[])
    .map(o => ({ mes: o.mes, bmw: Number(o.bmw) || 0, caetano: Number(o.faturas) || 0 }));
}

export async function saveVuObjetivos(rows: VuObjetivo[]): Promise<void> {
  if (rows.length === 0) return;
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('vu_objetivos')
    .upsert(rows.map(o => ({ mes: o.mes, bmw: o.bmw, faturas: o.caetano, updated_at: now })), { onConflict: 'mes' });
  if (error) throw error;
}
