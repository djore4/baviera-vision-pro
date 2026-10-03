import { supabase } from '@/integrations/supabase/client';
import { client } from '@/clients';

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
export type AreaKey = 'vn' | 'vu' | 'apv' | 'admin';

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
  { key: 'admin', label: 'Administração', style: 'admin' },
];

export const AREA_BY_KEY: Record<AreaKey, AreaDef> =
  AREAS.reduce((acc, a) => { acc[a.key] = a; return acc; }, {} as Record<AreaKey, AreaDef>);

export interface TabDef {
  key: string;
  label: string;
  path: string;
  area: AreaKey;
  /* Tab de acesso restrito: visível/acessível apenas a administradores,
   * independentemente da matriz de funções. Ver PermissionsContext.access(). */
  adminOnly?: boolean;
}

/* Registo único de todos os tabs (fonte de verdade para nav e matriz).
 * A ordem dentro de cada área define a ordem dos itens na sidebar. */
const ALL_TABS: TabDef[] = [
  // ── Vendas VN ──────────────────────────────────────────────────────────────
  { key: 'prospecao', label: 'Diário', path: '/prospecao', area: 'vn' },
  { key: 'retails', label: 'WIP', path: '/retails', area: 'vn' },
  { key: 'funil', label: 'Funil', path: '/funil', area: 'vn' },
  { key: 'producao', label: 'Produção', path: '/producao', area: 'vn' },
  { key: 'carteira', label: 'Carteira', path: '/carteira', area: 'vn' },
  { key: 'end-of-term', label: 'End-of-Term', path: '/end-of-term', area: 'vn' },
  { key: 'ficha-margem', label: 'Ficha Margem', path: '/ficha-margem', area: 'vn' },
  { key: 'escala', label: 'Escala', path: '/escala', area: 'vn' },
  { key: 'vendedores', label: 'Performance', path: '/vendedores', area: 'vn' },
  // Parque de demonstradores (dados partilhados com a plataforma Caetano —
  // tabela `viaturas`). Acesso pela matriz de funções (ex.: perfil genius).
  { key: 'demos', label: 'Demos', path: '/demos', area: 'vn' },
  // ── Vendas VU (em desenvolvimento) ──────────────────────────────────────────
  { key: 'wip', label: 'WIP', path: '/wip', area: 'vu' },
  { key: 'funil-vu', label: 'Funil', path: '/funil-vu', area: 'vu' },
  { key: 'angariacao', label: 'Angariação', path: '/angariacao', area: 'vu' },
  { key: 'stock', label: 'Stock', path: '/stock', area: 'vu' },
  { key: 'escala-vu', label: 'Escala', path: '/escala-vu', area: 'vu' },
  // ── Após-Venda ──────────────────────────────────────────────────────────────
  { key: 'lavagem', label: 'Lavagem', path: '/lavagem', area: 'apv' },
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
  { key: 'objetivos', label: 'Objetivos', path: '/objetivos', area: 'admin' },
];

/* Tabs desta instalação: os desativados na configuração do cliente não existem. */
export const TABS: TabDef[] = ALL_TABS.filter(t => !client.disabledTabs.includes(t.key));

/* Tabs "arrumados" dentro do Arquivo (não aparecem diretamente na barra lateral). */
export const ARCHIVED_TAB_KEYS = ['pendentes', 'escala-repsol', 'emprestimos', 'multas', 'database', 'objetivos'];

/* Tabs atribuíveis na matriz de permissões. Ficam de fora os desativados (já não
 * estão em TABS), os arrumados no Arquivo e os de acesso restrito a admin: esses
 * estão sempre barrados e só o admin lhes acede (no Arquivo). */
export const PERMISSION_TABS: TabDef[] = TABS.filter(t => !ARCHIVED_TAB_KEYS.includes(t.key) && !t.adminOnly);

/* ── Permissões finas dentro de um tab ───────────────────────────────────────
 * Ações de um tab que se atribuem por função na matriz, em vez de dependerem do
 * NOME da função no código (antes: `roleName === 'Lavador'`). Guardam-se em
 * app_roles.permissions com a chave '<tab>:<ação>' e valor 'edit' (concedida) ou
 * ausente. Dar acesso ao tab em si continua a ser a chave '<tab>'.
 * A RLS (migração lavagem_permissoes_granulares) usa as mesmas chaves. */
export interface SubPermissionDef {
  key: string;      // '<tab>:<ação>'
  parent: string;   // chave do tab
  label: string;
  hint: string;
}

const ALL_SUB_PERMISSIONS: SubPermissionDef[] = [
  { key: 'lavagem:reagendar', parent: 'lavagem', label: 'Reagendar e apagar',
    hint: 'Editar lavagens já existentes (arrastar na agenda) e removê-las. Quem tem edição no tab já o faz.' },
  { key: 'lavagem:iniciar', parent: 'lavagem', label: 'Criar e iniciar',
    hint: 'Criar lavagens, iniciar as agendadas e usar "Agendar já".' },
  { key: 'lavagem:qualidade', parent: 'lavagem', label: 'Controlo de qualidade',
    hint: 'Atribuir nota e observações de qualidade a uma lavagem.' },
  { key: 'lavagem:registos', parent: 'lavagem', label: 'Ver registos',
    hint: 'Consultar o histórico e a auditoria de lavagens.' },
];

/* Só as dos tabs que existem nesta instalação. */
export const SUB_PERMISSIONS: SubPermissionDef[] =
  ALL_SUB_PERMISSIONS.filter(sp => TABS.some(t => t.key === sp.parent));

/* Tabs de acesso restrito a administradores (deriva de TabDef.adminOnly). */
export const ADMIN_ONLY_TAB_KEYS: string[] = TABS.filter(t => t.adminOnly).map(t => t.key);

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

/* Administrador da plataforma (email em platform_admins, via RPC). */
export async function isPlatformAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_platform_admin');
  if (error) throw error;
  return data === true;
}

/* Exceções de acesso por tab do utilizador atual (tabela app_access_exceptions,
 * única fonte — a RLS usa a mesma). Se a função ainda não existir na base de
 * dados (migração por aplicar) ou falhar, não há exceções: nunca eleva acesso
 * por engano. */
export async function getMyAccessExceptions(): Promise<Record<string, AccessLevel>> {
  const { data, error } = await supabase.rpc('my_access_exceptions');
  if (error) {
    console.warn('Exceções de acesso indisponíveis:', error.message);
    return {};
  }
  const out: Record<string, AccessLevel> = {};
  Object.entries((data ?? {}) as Record<string, string>).forEach(([tab, lvl]) => {
    if (lvl === 'view' || lvl === 'edit') out[tab] = lvl;
  });
  return out;
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
