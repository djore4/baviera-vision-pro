import { supabase } from '@/integrations/supabase/client';

/* ── Permissões (RBAC) — camada de acesso a dados ─────────────────────────────
 * Acesso por função (app_roles) sobre cada tab. A função de um utilizador vem
 * de utilizadores.perfil. Escritas (criar/editar/eliminar utilizadores e gravar
 * permissões) passam pela edge function admin-users (service role, valida admin).
 * ──────────────────────────────────────────────────────────────────────────── */

export type AccessLevel = 'none' | 'view' | 'edit';

/* ── Áreas macro ──────────────────────────────────────────────────────────────
 * Camada de organização (navegação e admin), NÃO de permissão. As áreas apenas
 * agrupam os tabs em secções; o acesso continua a ser resolvido tab a tab pela
 * matriz de funções (app_roles.permissions). Um tab do APV (ex.: Lavagem) que
 * deva ser visível a VN e VU é-o simplesmente porque as funções de VN e VU têm
 * `lavagem` a view/edit — não por pertencer a várias áreas.
 * ──────────────────────────────────────────────────────────────────────────── */
export type AreaKey = 'vn' | 'vu' | 'apv' | 'resultados' | 'admin';

export interface AreaDef {
  key: AreaKey;
  label: string;                 // cabeçalho da secção na sidebar
  style: 'normal' | 'admin';     // tratamento visual (admin = destaque âmbar)
}

/* Ordem de apresentação das áreas na navegação e na matriz. */
export const AREAS: AreaDef[] = [
  { key: 'vn', label: 'Vendas VN', style: 'normal' },
  { key: 'vu', label: 'Vendas VU', style: 'normal' },
  { key: 'apv', label: 'Após-Venda', style: 'normal' },
  { key: 'resultados', label: 'Resultados', style: 'normal' },
  { key: 'admin', label: 'Administração', style: 'admin' },
];

export const AREA_BY_KEY: Record<AreaKey, AreaDef> =
  AREAS.reduce((acc, a) => { acc[a.key] = a; return acc; }, {} as Record<AreaKey, AreaDef>);

export interface TabDef {
  key: string;
  label: string;
  path: string;
  area: AreaKey;
}

/* Registo único de todos os tabs (fonte de verdade para nav e matriz).
 * A ordem dentro de cada área define a ordem dos itens na sidebar. */
export const TABS: TabDef[] = [
  // ── Vendas VN ──────────────────────────────────────────────────────────────
  { key: 'retails', label: 'WIP', path: '/retails', area: 'vn' },
  { key: 'funil', label: 'Funil', path: '/funil', area: 'vn' },
  { key: 'producao', label: 'Produção', path: '/producao', area: 'vn' },
  { key: 'carteira', label: 'Carteira', path: '/carteira', area: 'vn' },
  { key: 'ficha-margem', label: 'Ficha Margem', path: '/ficha-margem', area: 'vn' },
  { key: 'escala', label: 'Escala', path: '/escala', area: 'vn' },
  { key: 'vendedores', label: 'Performance', path: '/vendedores', area: 'vn' },
  { key: 'prospecao', label: 'Diário de Bordo', path: '/prospecao', area: 'vn' },
  // ── Vendas VU (em desenvolvimento) ──────────────────────────────────────────
  { key: 'wip', label: 'WIP', path: '/wip', area: 'vu' },
  { key: 'ficha-margem-vu', label: 'Ficha de Margem', path: '/ficha-margem-vu', area: 'vu' },
  { key: 'angariacao', label: 'Angariação', path: '/angariacao', area: 'vu' },
  { key: 'stock', label: 'Stock', path: '/stock', area: 'vu' },
  { key: 'escala-vu', label: 'Escala', path: '/escala-vu', area: 'vu' },
  // ── Após-Venda ──────────────────────────────────────────────────────────────
  { key: 'lavagem', label: 'Lavagem', path: '/lavagem', area: 'apv' },
  // ── Resultados (em desenvolvimento) ─────────────────────────────────────────
  { key: 'resultados-vn', label: 'Vendas VN', path: '/resultados-vn', area: 'resultados' },
  { key: 'resultados-vu', label: 'Vendas VU', path: '/resultados-vu', area: 'resultados' },
  { key: 'resultados-finance', label: 'Finance', path: '/resultados-finance', area: 'resultados' },
  { key: 'resultados-apv', label: 'Após-Venda', path: '/resultados-apv', area: 'resultados' },
  // ── Administração ───────────────────────────────────────────────────────────
  { key: 'dados', label: 'Dados', path: '/dados', area: 'admin' },
  { key: 'arquivo', label: 'Arquivo', path: '/arquivo', area: 'admin' },
  { key: 'utilizadores', label: 'Utilizadores', path: '/utilizadores', area: 'admin' },
  // Arrumados dentro do Arquivo (fora da sidebar, ver ARCHIVED_TAB_KEYS).
  { key: 'pendentes', label: 'Pendentes', path: '/pendentes', area: 'admin' },
  { key: 'escala-repsol', label: 'Escala Repsol', path: '/escala-repsol', area: 'admin' },
  { key: 'emprestimos', label: 'Empréstimos', path: '/emprestimos', area: 'admin' },
  { key: 'multas', label: 'Multas', path: '/multas', area: 'admin' },
  { key: 'database', label: 'Database', path: '/database', area: 'admin' },
  { key: 'demos', label: 'Demos', path: '/demos', area: 'admin' },
  { key: 'objetivos', label: 'Objetivos', path: '/objetivos', area: 'admin' },
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
