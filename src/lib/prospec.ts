import { supabase } from '@/integrations/supabase/client';

/* ── Prospeção Comercial (CRM) — camada de acesso a dados ─────────────────────
 * CRUD para prospec_accounts / prospec_contacts / prospec_interactions /
 * prospec_tasks. As tabelas não constam dos tipos gerados do Supabase, por isso
 * os nomes são passados como string (mesmo padrão de crm.ts / control-records.ts).
 * O isolamento vendedor/diretor é feito aqui (filtro por owner_email); o diretor
 * (admin) não filtra e vê tudo.
 * ──────────────────────────────────────────────────────────────────────────── */

/* ── Enumerações e etiquetas ─────────────────────────────────────────────────── */

export type Fase =
  | 'novo' | 'contactado' | 'reuniao' | 'proposta' | 'negociacao' | 'ganho' | 'perdido';

export const FASES: { value: Fase; label: string; cls: string }[] = [
  { value: 'novo',       label: 'Novo',             cls: 'bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300' },
  { value: 'contactado', label: 'Contactado',       cls: 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300' },
  { value: 'reuniao',    label: 'Reunião marcada',  cls: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300' },
  { value: 'proposta',   label: 'Proposta enviada', cls: 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300' },
  { value: 'negociacao', label: 'Negociação',       cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300' },
  { value: 'ganho',      label: 'Ganho',            cls: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300' },
  { value: 'perdido',    label: 'Perdido',          cls: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300' },
];

export const faseLabel = (f: Fase) => FASES.find(x => x.value === f)?.label ?? f;
export const faseCls   = (f: Fase) => FASES.find(x => x.value === f)?.cls ?? '';

export type Fonte = 'geografica' | 'lookalike' | 'indicacao' | 'relacao' | 'lusha' | 'outro';

export const FONTES: { value: Fonte; label: string }[] = [
  { value: 'geografica', label: 'Prospeção' },
  { value: 'lookalike',  label: 'Perfil semelhante a cliente (lookalike)' },
  { value: 'indicacao',  label: 'Recomendação' },
  { value: 'relacao',    label: 'Relação' },
  { value: 'lusha',      label: 'Lusha' },
  { value: 'outro',      label: 'Outro' },
];

export const fonteLabel = (f: Fonte | null) => FONTES.find(x => x.value === f)?.label ?? '—';

export type TaskType = 'todo' | 'next_action';

/* Patamares da dimensão da frota (substituem a antiga escala 1–5). */
export const FLEET_TIERS: { value: number; label: string; short: string }[] = [
  { value: 0, label: 'Sem frota', short: '0' },
  { value: 1, label: '3–14 viaturas', short: '3–14' },
  { value: 2, label: '15+ viaturas', short: '15+' },
];

export const fleetLabel = (v: number | null) => FLEET_TIERS.find(t => t.value === v)?.label ?? '—';

/* Contribuição do patamar de frota para o score, na escala 1–5. */
export const fleetScoreValue = (v: number | null): number =>
  v === 2 ? 5 : v === 1 ? 3 : 0;

export type InteractionTipo = 'chamada' | 'email' | 'reuniao' | 'visita';

export const INTERACTION_TIPOS: { value: InteractionTipo; label: string }[] = [
  { value: 'chamada', label: 'Chamada' },
  { value: 'email',   label: 'Email' },
  { value: 'reuniao', label: 'Reunião' },
  { value: 'visita',  label: 'Visita' },
];

/* Pesos do score composto — espelham a coluna GENERATED em prospec_accounts.
 * (potencial 0.5 · dimensão frota 0.3 · relação 0.2) */
export const SCORE_WEIGHTS = { potencial: 0.5, dimensao_frota: 0.3, relacao: 0.2 } as const;

/* Espelha a coluna GENERATED da BD: o patamar de frota é convertido para a
 * escala 1–5 (0→0, 3–14→3, 15+→5) antes de aplicar o peso. */
export function computeScore(
  potencial?: number | null, dimensao_frota?: number | null, relacao?: number | null,
): number {
  const v = (potencial ?? 0) * SCORE_WEIGHTS.potencial
    + fleetScoreValue(dimensao_frota ?? null) * SCORE_WEIGHTS.dimensao_frota
    + (relacao ?? 0) * SCORE_WEIGHTS.relacao;
  return Math.round(v * 100) / 100;
}

/* ── Tipos ───────────────────────────────────────────────────────────────────── */

export interface Account {
  id: string;
  nome: string;
  setor: string | null;
  potencial: number | null;
  dimensao_frota: number | null;
  relacao: number | null;
  score: number | null;           // gerado pela BD
  fase: Fase;
  fonte: Fonte | null;
  owner_email: string | null;
  owner_nome: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: string;
  account_id: string;
  nome: string;
  cargo: string | null;
  email: string | null;
  telefone: string | null;
  fonte: string | null;
  created_at: string;
  updated_at: string;
}

export interface Interaction {
  id: string;
  account_id: string;
  tipo: InteractionTipo;
  occurred_at: string;
  autor: string | null;
  nota: string | null;
  created_at: string;
}

export interface Task {
  id: string;
  type: TaskType;
  account_id: string | null;
  owner_email: string | null;
  owner_nome: string | null;
  descricao: string;
  due_at: string | null;
  done: boolean;
  done_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/* Escopo de leitura: um diretor vê tudo; um vendedor só o que é seu. */
export interface Scope {
  isDirector: boolean;
  email: string | null;
}

/* ── Contas ──────────────────────────────────────────────────────────────────── */

export type NewAccount =
  & { nome: string }
  & Partial<Pick<Account,
      'setor' | 'potencial' | 'dimensao_frota' | 'relacao' | 'fase' | 'fonte'
      | 'owner_email' | 'owner_nome' | 'created_by'>>;

export type AccountPatch = Partial<Pick<Account,
  'nome' | 'setor' | 'potencial' | 'dimensao_frota' | 'relacao' | 'fase' | 'fonte'
  | 'owner_email' | 'owner_nome'>>;

export async function listAccounts(scope: Scope): Promise<Account[]> {
  let q = supabase.from('prospec_accounts').select('*');
  if (!scope.isDirector && scope.email) q = q.eq('owner_email', scope.email);
  const { data, error } = await q
    .order('score', { ascending: false, nullsFirst: false })
    .order('nome', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Account[];
}

export async function createAccount(input: NewAccount): Promise<Account> {
  const { data, error } = await supabase
    .from('prospec_accounts')
    .insert({
      nome: input.nome,
      setor: input.setor ?? null,
      potencial: input.potencial ?? null,
      dimensao_frota: input.dimensao_frota ?? null,
      relacao: input.relacao ?? null,
      fase: input.fase ?? 'novo',
      fonte: input.fonte ?? null,
      owner_email: input.owner_email ?? null,
      owner_nome: input.owner_nome ?? null,
      created_by: input.created_by ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as Account;
}

export async function updateAccount(id: string, patch: AccountPatch): Promise<Account> {
  const { data, error } = await supabase
    .from('prospec_accounts').update(patch).eq('id', id).select().single();
  if (error) throw error;
  return data as Account;
}

export async function deleteAccount(id: string): Promise<void> {
  const { error } = await supabase.from('prospec_accounts').delete().eq('id', id);
  if (error) throw error;
}

/* ── Contactos ───────────────────────────────────────────────────────────────── */

export type NewContact =
  & { account_id: string; nome: string }
  & Partial<Pick<Contact, 'cargo' | 'email' | 'telefone' | 'fonte'>>;

export async function listContacts(accountId: string): Promise<Contact[]> {
  const { data, error } = await supabase
    .from('prospec_contacts').select('*')
    .eq('account_id', accountId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Contact[];
}

export async function createContact(input: NewContact): Promise<Contact> {
  const { data, error } = await supabase
    .from('prospec_contacts')
    .insert({
      account_id: input.account_id,
      nome: input.nome,
      cargo: input.cargo ?? null,
      email: input.email ?? null,
      telefone: input.telefone ?? null,
      fonte: input.fonte ?? null,
    })
    .select().single();
  if (error) throw error;
  return data as Contact;
}

export async function deleteContact(id: string): Promise<void> {
  const { error } = await supabase.from('prospec_contacts').delete().eq('id', id);
  if (error) throw error;
}

/* ── Interações ──────────────────────────────────────────────────────────────── */

export type NewInteraction =
  & { account_id: string; tipo: InteractionTipo }
  & Partial<Pick<Interaction, 'occurred_at' | 'autor' | 'nota'>>;

export async function listInteractions(accountId: string): Promise<Interaction[]> {
  const { data, error } = await supabase
    .from('prospec_interactions').select('*')
    .eq('account_id', accountId)
    .order('occurred_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Interaction[];
}

export async function createInteraction(input: NewInteraction): Promise<Interaction> {
  const { data, error } = await supabase
    .from('prospec_interactions')
    .insert({
      account_id: input.account_id,
      tipo: input.tipo,
      occurred_at: input.occurred_at ?? new Date().toISOString(),
      autor: input.autor ?? null,
      nota: input.nota ?? null,
    })
    .select().single();
  if (error) throw error;
  return data as Interaction;
}

export async function deleteInteraction(id: string): Promise<void> {
  const { error } = await supabase.from('prospec_interactions').delete().eq('id', id);
  if (error) throw error;
}

/* ── Tarefas (to-do · próxima ação · compromisso) ────────────────────────────── */

export type NewTask =
  & { descricao: string; type: TaskType }
  & Partial<Pick<Task, 'account_id' | 'owner_email' | 'owner_nome' | 'due_at' | 'created_by'>>;

export type TaskPatch = Partial<Pick<Task, 'descricao' | 'due_at' | 'account_id' | 'type'>>;

export interface TaskFilter {
  types?: TaskType[];
  accountId?: string;
  done?: boolean;
}

export async function listTasks(scope: Scope, filter?: TaskFilter): Promise<Task[]> {
  let q = supabase.from('prospec_tasks').select('*');
  if (!scope.isDirector && scope.email) q = q.eq('owner_email', scope.email);
  if (filter?.types?.length) q = q.in('type', filter.types);
  if (filter?.accountId) q = q.eq('account_id', filter.accountId);
  if (filter?.done !== undefined) q = q.eq('done', filter.done);
  const { data, error } = await q
    .order('due_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Task[];
}

export async function createTask(input: NewTask): Promise<Task> {
  const { data, error } = await supabase
    .from('prospec_tasks')
    .insert({
      type: input.type,
      account_id: input.account_id ?? null,
      owner_email: input.owner_email ?? null,
      owner_nome: input.owner_nome ?? null,
      descricao: input.descricao,
      due_at: input.due_at ?? null,
      created_by: input.created_by ?? null,
    })
    .select().single();
  if (error) throw error;
  return data as Task;
}

export async function setTaskDone(id: string, done: boolean): Promise<Task> {
  const { data, error } = await supabase
    .from('prospec_tasks')
    .update({ done, done_at: done ? new Date().toISOString() : null })
    .eq('id', id).select().single();
  if (error) throw error;
  return data as Task;
}

export async function updateTask(id: string, patch: TaskPatch): Promise<Task> {
  const { data, error } = await supabase
    .from('prospec_tasks').update(patch).eq('id', id).select().single();
  if (error) throw error;
  return data as Task;
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await supabase.from('prospec_tasks').delete().eq('id', id);
  if (error) throw error;
}

/* Contagem de atrasados (done=false AND due_at < agora) — usada no badge da nav. */
export async function countOverdue(scope: Scope): Promise<number> {
  let q = supabase
    .from('prospec_tasks')
    .select('id', { count: 'exact', head: true })
    .eq('done', false)
    .lt('due_at', new Date().toISOString());
  if (!scope.isDirector && scope.email) q = q.eq('owner_email', scope.email);
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

/* ── Helpers de datas ────────────────────────────────────────────────────────── */

export const isOverdue = (t: Task): boolean =>
  !t.done && !!t.due_at && new Date(t.due_at).getTime() < Date.now();
