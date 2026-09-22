import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';

/* ── End-of-Term (EoT) — controlo das terminações de contrato BMW FS ──────────
 * O ficheiro-base é o "MAPA DE CONTRATOS A TERMINAR NOS PRÓXIMOS 12 MESES"
 * (uma sheet "EOT" com cabeçalho a começar em "Concessionário … Contrato …").
 * A importação faz UPSERT por número de contrato (colunas-base do mapa) e NÃO
 * apaga o estado de acompanhamento nem o histórico — o follow-up sobrevive às
 * reimportações mensais.
 *
 * As tabelas (eot_contracts / eot_activities) não constam dos tipos gerados do
 * Supabase, por isso os nomes são passados como string e as respostas são
 * convertidas — mesmo padrão de prospec.ts / control-records-vu.ts.
 * ──────────────────────────────────────────────────────────────────────────── */

const TABLE = 'eot_contracts';
const ACT_TABLE = 'eot_activities';

/* ── Enumerações e etiquetas ─────────────────────────────────────────────────── */

export type Fase =
  | 'pendente' | 'contactado' | 'proposta_enviada' | 'negociacao'
  | 'renovado' | 'retomado' | 'perdido' | 'sem_interesse';

export const FASES: { value: Fase; label: string; cls: string }[] = [
  { value: 'pendente',         label: 'Pendente',         cls: 'bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300' },
  { value: 'contactado',       label: 'Contactado',       cls: 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300' },
  { value: 'proposta_enviada', label: 'Proposta enviada', cls: 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300' },
  { value: 'negociacao',       label: 'Negociação',       cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300' },
  { value: 'renovado',         label: 'Renovado',         cls: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300' },
  { value: 'retomado',         label: 'Retomado',         cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300' },
  { value: 'perdido',          label: 'Perdido',          cls: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300' },
  { value: 'sem_interesse',    label: 'Sem interesse',    cls: 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300' },
];

export const faseLabel = (f: Fase) => FASES.find(x => x.value === f)?.label ?? f;
export const faseCls   = (f: Fase) => FASES.find(x => x.value === f)?.cls ?? '';

/* Fases que fecham o ciclo (não pedem mais follow-up). */
export const FASES_FECHADAS: Fase[] = ['renovado', 'retomado', 'perdido', 'sem_interesse'];
export const isFechada = (f: Fase) => FASES_FECHADAS.includes(f);

export type ActTipo =
  | 'chamada' | 'email' | 'reuniao' | 'visita'
  | 'proposta_feita' | 'proposta_enviada' | 'outro';

export const ACT_TIPOS: { value: ActTipo; label: string }[] = [
  { value: 'chamada',          label: 'Chamada' },
  { value: 'email',            label: 'Email' },
  { value: 'reuniao',          label: 'Reunião' },
  { value: 'visita',           label: 'Visita' },
  { value: 'proposta_feita',   label: 'Proposta feita' },
  { value: 'proposta_enviada', label: 'Proposta enviada' },
  { value: 'outro',            label: 'Outro' },
];

export const actTipoLabel = (t: ActTipo) => ACT_TIPOS.find(x => x.value === t)?.label ?? t;

/* ── Tipos ───────────────────────────────────────────────────────────────────── */

export interface EotContract {
  contrato: string;
  concessionario: string | null;
  vendedor: string | null;
  tipo: string | null;
  cliente: string | null;
  contacto: string | null;
  telefone: string | null;
  telemovel: string | null;
  morada: string | null;
  codigo_postal: string | null;
  data_fim: string | null;          // ISO 'AAAA-MM-DD'
  prazo: number | null;
  prestacao: number | null;
  kms_contratados: number | null;
  matricula: string | null;
  marca: string | null;
  modelo: string | null;
  seguro: string | null;
  manutencao: string | null;
  manutencao_tipo: string | null;
  valor_residual: number | null;
  despesas_finais: number | null;
  valor_total: number | null;
  concessionario_resp: string | null;
  fase: Fase;
  resultado: string | null;
  obs: string | null;
  owner_email: string | null;
  owner_nome: string | null;
  imported_at: string;
  updated_at: string;
}

export interface EotActivity {
  id: string;
  contrato: string;
  tipo: ActTipo;
  descricao: string | null;
  due_at: string | null;
  done: boolean;
  done_at: string | null;
  autor: string | null;
  owner_email: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/* Escopo de leitura: o diretor (chefe de vendas) vê tudo; o vendedor só o seu. */
export interface Scope {
  isDirector: boolean;
  email: string | null;
}

/* ── Parser do ficheiro (mapa de terminações) ────────────────────────────────── */

const norm = (v: unknown) =>
  String(v ?? '').trim().toUpperCase().replace(/\s+/g, ' ');

const str = (v: unknown) => {
  const s = v == null ? '' : String(v).trim();
  return s === '' ? null : s;
};

function toDate(v: unknown): Date | null {
  if (v == null || v === '') return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === 'number') {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return isNaN(d.getTime()) ? null : d;
  }
  const s = String(v).trim();
  // Formato português DD-MM-AAAA ou DD/MM/AAAA
  const m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) {
    const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

const isoDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

function toNum(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  // Remove separadores de milhares e normaliza vírgula decimal.
  const s = String(v).replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function toInt(v: unknown): number | null {
  const n = toNum(v);
  return n == null ? null : Math.round(n);
}

/** Registo tal como sai do ficheiro (só colunas-base; sem estado). */
export type EotImportRow = Pick<EotContract,
  'contrato' | 'concessionario' | 'vendedor' | 'tipo' | 'cliente' | 'contacto'
  | 'telefone' | 'telemovel' | 'morada' | 'codigo_postal' | 'data_fim' | 'prazo'
  | 'prestacao' | 'kms_contratados' | 'matricula' | 'marca' | 'modelo' | 'seguro'
  | 'manutencao' | 'manutencao_tipo' | 'valor_residual' | 'despesas_finais'
  | 'valor_total' | 'concessionario_resp'>;

/** Lê a sheet do mapa e devolve os contratos (só colunas-base). */
export function parseEotFile(buffer: ArrayBuffer): EotImportRow[] {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheetName = wb.SheetNames.find(n => n.trim().toUpperCase() === 'EOT') ?? wb.SheetNames[0];
  if (!sheetName) throw new Error('O ficheiro não tem nenhuma sheet.');
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '', raw: true, cellDates: true });

  // Cabeçalho = a linha que contém "Contrato" e "Cliente".
  const headerIdx = rows.findIndex(r =>
    Array.isArray(r) && r.some(c => norm(c) === 'CONTRATO') && r.some(c => norm(c) === 'CLIENTE'));
  if (headerIdx === -1) {
    throw new Error('Não foi encontrado o cabeçalho do mapa (colunas "Contrato" e "Cliente"). Confirme que carregou o ficheiro de terminações.');
  }
  const header = rows[headerIdx] as unknown[];

  // Mapeia cada nome de coluna a TODAS as posições onde aparece (há duas
  // colunas "Manutenção": a 1.ª é S/N, a 2.ª é o pacote de manutenção).
  const cols: Record<string, number[]> = {};
  header.forEach((c, i) => {
    const k = norm(c);
    if (!k) return;
    (cols[k] ??= []).push(i);
  });
  const at = (row: unknown[], name: string, occ = 0): unknown => {
    const idxs = cols[norm(name)];
    if (!idxs || idxs[occ] == null) return '';
    return row[idxs[occ]];
  };

  const out: EotImportRow[] = [];
  const seen = new Set<string>();
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r] as unknown[];
    if (!Array.isArray(row)) continue;
    const contrato = str(at(row, 'CONTRATO'));
    const cliente = str(at(row, 'CLIENTE'));
    // Ignora linhas sem contrato (linhas em branco, totais, notas de rodapé).
    if (!contrato || !/\d/.test(contrato)) continue;
    if (!cliente && !str(at(row, 'MATRÍCULA'))) continue;
    if (seen.has(contrato)) continue;      // dedup dentro do ficheiro
    seen.add(contrato);

    out.push({
      contrato,
      concessionario: str(at(row, 'CONCESSIONÁRIO')),
      vendedor: str(at(row, 'VENDEDOR')),
      tipo: str(at(row, 'TIPO')),
      cliente,
      contacto: str(at(row, 'CONTACTO')),
      telefone: str(at(row, 'TELEFONE')),
      telemovel: str(at(row, 'TELEMOVEL')),
      morada: str(at(row, 'MORADA')),
      codigo_postal: str(at(row, 'CÓDIGO POSTAL')),
      data_fim: isoDate(toDate(at(row, 'DATA FIM'))),
      prazo: toInt(at(row, 'PRAZO')),
      prestacao: toNum(at(row, 'PRESTAÇÃO')),
      kms_contratados: toNum(at(row, 'KMS CONTRATADOS')),
      matricula: str(at(row, 'MATRÍCULA')),
      marca: str(at(row, 'MARCA')),
      modelo: str(at(row, 'MODELO')),
      seguro: str(at(row, 'SEGURO')),
      manutencao: str(at(row, 'MANUTENÇÃO', 0)),        // 1.ª "Manutenção" = S/N
      manutencao_tipo: str(at(row, 'MANUTENÇÃO', 1)),   // 2.ª "Manutenção" = pacote
      valor_residual: toNum(at(row, 'VALOR RESIDUAL A REFINANCIAR')),
      despesas_finais: toNum(at(row, 'DESPESAS FINAIS')),
      valor_total: toNum(at(row, 'VALOR TOTAL A PAGAR')),
      concessionario_resp: str(at(row, 'CONCESSIONÁRIO RESPONSÁVEL')),
    });
  }
  return out;
}

/** Importa o mapa: UPSERT por número de contrato das colunas-base. Preserva o
 *  estado de acompanhamento e o histórico dos contratos já existentes. Devolve
 *  o número de contratos importados. */
export async function importEotContracts(rows: EotImportRow[]): Promise<number> {
  if (rows.length === 0) {
    throw new Error('O ficheiro não tem contratos válidos — importação cancelada.');
  }
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH).map(r => ({ ...r, imported_at: new Date().toISOString() }));
    const { error } = await supabase.from(TABLE).upsert(chunk, { onConflict: 'contrato' });
    if (error) throw new Error(`Erro ao importar terminações (lote ${i / BATCH + 1}): ${error.message}`);
  }
  return rows.length;
}

/* ── Contratos ───────────────────────────────────────────────────────────────── */

export interface EotFilter {
  vendedor?: string;
  fase?: Fase;
  /** Só contratos a terminar até N dias a partir de hoje. */
  untilDays?: number;
  /** Esconde as fases fechadas (renovado/retomado/perdido/sem interesse). */
  hideClosed?: boolean;
}

export async function listEotContracts(scope: Scope, filter?: EotFilter): Promise<EotContract[]> {
  let q = supabase.from(TABLE).select('*');
  if (!scope.isDirector && scope.email) q = q.eq('owner_email', scope.email);
  if (filter?.vendedor) q = q.eq('vendedor', filter.vendedor);
  if (filter?.fase) q = q.eq('fase', filter.fase);
  const { data, error } = await q
    .order('data_fim', { ascending: true, nullsFirst: false });
  if (error) return [];
  let list = (data ?? []) as EotContract[];
  if (filter?.hideClosed) list = list.filter(c => !isFechada(c.fase));
  if (filter?.untilDays != null) {
    const limit = new Date(); limit.setHours(23, 59, 59, 999);
    limit.setDate(limit.getDate() + filter.untilDays);
    const iso = limit.toISOString().slice(0, 10);
    list = list.filter(c => c.data_fim != null && c.data_fim <= iso);
  }
  return list;
}

export type EotContractPatch = Partial<Pick<EotContract,
  'fase' | 'resultado' | 'obs' | 'owner_email' | 'owner_nome'
  | 'contacto' | 'telefone' | 'telemovel'>>;

export async function updateEotContract(contrato: string, patch: EotContractPatch): Promise<EotContract> {
  const { data, error } = await supabase
    .from(TABLE).update(patch).eq('contrato', contrato).select().single();
  if (error) throw error;
  return data as EotContract;
}

/** Lista de vendedores presentes nos contratos (para o filtro). */
export async function listEotVendedores(scope: Scope): Promise<string[]> {
  let q = supabase.from(TABLE).select('vendedor');
  if (!scope.isDirector && scope.email) q = q.eq('owner_email', scope.email);
  const { data, error } = await q;
  if (error || !data) return [];
  const set = new Set<string>();
  (data as { vendedor: string | null }[]).forEach(r => { if (r.vendedor) set.add(r.vendedor); });
  return [...set].sort((a, b) => a.localeCompare(b));
}

/* ── Atividades (agendamentos + histórico) ───────────────────────────────────── */

export type NewActivity =
  & { contrato: string; tipo: ActTipo }
  & Partial<Pick<EotActivity, 'descricao' | 'due_at' | 'done' | 'autor' | 'owner_email' | 'created_by'>>;

export async function listActivities(contrato: string): Promise<EotActivity[]> {
  const { data, error } = await supabase
    .from(ACT_TABLE).select('*')
    .eq('contrato', contrato)
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data ?? []) as EotActivity[];
}

export async function createActivity(input: NewActivity): Promise<EotActivity> {
  const done = input.done ?? false;
  const { data, error } = await supabase
    .from(ACT_TABLE)
    .insert({
      contrato: input.contrato,
      tipo: input.tipo,
      descricao: input.descricao ?? null,
      due_at: input.due_at ?? null,
      done,
      done_at: done ? new Date().toISOString() : null,
      autor: input.autor ?? null,
      owner_email: input.owner_email ?? null,
      created_by: input.created_by ?? null,
    })
    .select().single();
  if (error) throw error;
  return data as EotActivity;
}

export async function setActivityDone(id: string, done: boolean): Promise<EotActivity> {
  const { data, error } = await supabase
    .from(ACT_TABLE)
    .update({ done, done_at: done ? new Date().toISOString() : null })
    .eq('id', id).select().single();
  if (error) throw error;
  return data as EotActivity;
}

export async function deleteActivity(id: string): Promise<void> {
  const { error } = await supabase.from(ACT_TABLE).delete().eq('id', id);
  if (error) throw error;
}

/* ── Agenda / follow-up (transversal a todos os contratos) ────────────────────── */

export interface AgendaItem extends EotActivity {
  cliente: string | null;
  vendedor: string | null;
  data_fim: string | null;
}

/** Atividades por concluir com prazo, para a agenda de follow-up do chefe de
 *  vendas (e do vendedor). Junta o nome do cliente/vendedor do contrato. */
export async function listAgenda(scope: Scope): Promise<AgendaItem[]> {
  let aq = supabase.from(ACT_TABLE).select('*').eq('done', false).not('due_at', 'is', null);
  if (!scope.isDirector && scope.email) aq = aq.eq('owner_email', scope.email);
  const { data: acts, error } = await aq.order('due_at', { ascending: true });
  if (error || !acts) return [];
  const activities = acts as EotActivity[];
  if (activities.length === 0) return [];

  const contratos = [...new Set(activities.map(a => a.contrato))];
  const { data: cData } = await supabase
    .from(TABLE).select('contrato, cliente, vendedor, data_fim').in('contrato', contratos);
  const byContrato = new Map<string, { cliente: string | null; vendedor: string | null; data_fim: string | null }>();
  (cData as { contrato: string; cliente: string | null; vendedor: string | null; data_fim: string | null }[] ?? [])
    .forEach(c => byContrato.set(c.contrato, c));

  return activities.map(a => ({
    ...a,
    cliente: byContrato.get(a.contrato)?.cliente ?? null,
    vendedor: byContrato.get(a.contrato)?.vendedor ?? null,
    data_fim: byContrato.get(a.contrato)?.data_fim ?? null,
  }));
}

/* Contagem de follow-ups em atraso (done=false AND due_at < agora). Badge da nav. */
export async function countOverdue(scope: Scope): Promise<number> {
  let q = supabase
    .from(ACT_TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('done', false)
    .lt('due_at', new Date().toISOString());
  if (!scope.isDirector && scope.email) q = q.eq('owner_email', scope.email);
  const { count, error } = await q;
  if (error) return 0;
  return count ?? 0;
}

/* ── Helpers ─────────────────────────────────────────────────────────────────── */

export const isOverdue = (a: Pick<EotActivity, 'done' | 'due_at'>): boolean =>
  !a.done && !!a.due_at && new Date(a.due_at).getTime() < Date.now();

/** Dias até ao fim de contrato (negativo = já terminou). */
export function daysToEnd(data_fim: string | null): number | null {
  if (!data_fim) return null;
  const end = new Date(data_fim); end.setHours(0, 0, 0, 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((end.getTime() - today.getTime()) / 86400000);
}

export const eur = (v: number | null): string =>
  v == null ? '—' : v.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
