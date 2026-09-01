import { supabase } from '@/integrations/supabase/client';

/* ── Permissões (RBAC) — camada de acesso a dados ─────────────────────────────
 * Acesso por função (app_roles) sobre cada tab. A função de um utilizador vem
 * de utilizadores.perfil. Escritas (criar/editar/eliminar utilizadores e gravar
 * permissões) passam pela edge function admin-users (service role, valida admin).
 * ──────────────────────────────────────────────────────────────────────────── */

export type AccessLevel = 'none' | 'view' | 'edit';

export interface TabDef {
  key: string;
  label: string;
  path: string;
  group: 'geral' | 'admin';
}

/* Registo único de todos os tabs (fonte de verdade para nav e matriz). */
export const TABS: TabDef[] = [
  { key: 'retails', label: 'Retails', path: '/retails', group: 'geral' },
  { key: 'funil', label: 'Funil', path: '/funil', group: 'geral' },
  { key: 'producao', label: 'Produção', path: '/producao', group: 'geral' },
  { key: 'carteira', label: 'Carteira', path: '/carteira', group: 'geral' },
  { key: 'pendentes', label: 'Pendentes', path: '/pendentes', group: 'admin' },
  { key: 'ficha-margem', label: 'Ficha Margem', path: '/ficha-margem', group: 'geral' },
  { key: 'escala', label: 'Escala', path: '/escala', group: 'geral' },
  { key: 'lavagem', label: 'Lavagem', path: '/lavagem', group: 'geral' },
  { key: 'escala-repsol', label: 'Escala Repsol', path: '/escala-repsol', group: 'admin' },
  { key: 'prospecao', label: 'Prospeção', path: '/prospecao', group: 'admin' },
  { key: 'vendedores', label: 'Performance', path: '/vendedores', group: 'admin' },
  { key: 'emprestimos', label: 'Empréstimos', path: '/emprestimos', group: 'admin' },
  { key: 'multas', label: 'Multas', path: '/multas', group: 'admin' },
  { key: 'dados', label: 'Dados', path: '/dados', group: 'admin' },
  { key: 'database', label: 'Database', path: '/database', group: 'admin' },
  { key: 'demos', label: 'Demos', path: '/demos', group: 'admin' },
  { key: 'objetivos', label: 'Objetivos', path: '/objetivos', group: 'admin' },
  { key: 'qualidade', label: 'Qualidade', path: '/qualidade', group: 'admin' },
  { key: 'arquivo', label: 'Arquivo', path: '/arquivo', group: 'admin' },
  { key: 'utilizadores', label: 'Utilizadores', path: '/utilizadores', group: 'admin' },
];

/* Tabs "arrumados" dentro do Arquivo (não aparecem diretamente na barra lateral). */
export const ARCHIVED_TAB_KEYS = ['pendentes', 'escala-repsol', 'emprestimos', 'multas', 'database', 'demos', 'objetivos'];

export const TAB_BY_PATH: Record<string, TabDef> =
  TABS.reduce((acc, t) => { acc[t.path] = t; return acc; }, {} as Record<string, TabDef>);

export interface AppRole {
  name: string;
  is_admin: boolean;
  permissions: Record<string, AccessLevel>;
}

export interface AppUser {
  id: number | string;
  nome: string | null;
  email: string | null;
  perfil: string | null;
  local: unknown;
  negocio: unknown;
  marca: unknown;
}

/* ── Leitura (autenticado) ────────────────────────────────────────────────── */

export async function listRoles(): Promise<AppRole[]> {
  const { data, error } = await supabase
    .from('app_roles')
    .select('name, is_admin, permissions')
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as AppRole[];
}

export async function listUsers(): Promise<AppUser[]> {
  // Tabela dedicada a esta plataforma (separada da partilhada `utilizadores`).
  const { data, error } = await supabase
    .from('app_users')
    .select('id, nome, email, perfil, local, negocio, marca')
    .order('nome', { ascending: true });
  if (error) throw error;
  return (data ?? []) as AppUser[];
}

/* ── Escrita (admin, via edge function) ───────────────────────────────────── */

async function invokeAdmin<T = unknown>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('admin-users', { body });
  if (error) {
    let msg = error.message;
    // A edge function devolve { error } em respostas não-2xx.
    try {
      const ctx = (error as { context?: Response }).context;
      const parsed = ctx && typeof ctx.json === 'function' ? await ctx.json() : null;
      if (parsed?.error) msg = parsed.error;
    } catch { /* ignora */ }
    throw new Error(msg);
  }
  if (data && (data as { error?: string }).error) throw new Error((data as { error: string }).error);
  return data as T;
}

export interface NewUser {
  nome: string;
  email: string;
  password: string;
  perfil: string;
  local?: unknown;
  negocio?: unknown;
  marca?: unknown;
}

export async function createUser(input: NewUser): Promise<AppUser> {
  const res = await invokeAdmin<{ user: AppUser }>({ action: 'create', ...input });
  return res.user;
}

export async function updateUser(
  id: number | string,
  patch: Partial<Pick<AppUser, 'nome' | 'perfil' | 'local' | 'negocio' | 'marca'>>,
  password?: string,
): Promise<AppUser> {
  const res = await invokeAdmin<{ user: AppUser }>({ action: 'update', id, patch, password });
  return res.user;
}

export async function deleteUser(id: number | string): Promise<void> {
  await invokeAdmin({ action: 'delete', id });
}

export async function saveRole(
  name: string,
  permissions: Record<string, AccessLevel>,
  is_admin: boolean,
): Promise<AppRole> {
  const res = await invokeAdmin<{ role: AppRole }>({ action: 'save_role', name, permissions, is_admin });
  return res.role;
}

export async function deleteRole(name: string): Promise<void> {
  await invokeAdmin({ action: 'delete_role', name });
}
