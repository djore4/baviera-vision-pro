import { supabase } from '@/integrations/supabase/client';
import { locaisDoPerfil } from '@/lib/locations';
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
  { key: 'apv', label: 'Transversal', style: 'normal' },
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
  { key: 'retails', label: 'WIP', path: '/retails', area: 'vn' },
  { key: 'funil', label: 'Funil', path: '/funil', area: 'vn' },
  { key: 'producao', label: 'Produção', path: '/producao', area: 'vn' },
  { key: 'carteira', label: 'Carteira', path: '/carteira', area: 'vn' },
  { key: 'end-of-term', label: 'End-of-Term', path: '/end-of-term', area: 'vn' },
  { key: 'ficha-margem', label: 'Ficha Margem', path: '/ficha-margem', area: 'vn' },
  // Oportunidades de contacto de uma campanha: o admin importa e delega; o vendedor acompanha as suas.
  { key: 'campanha-i3', label: 'Campanha i3', path: '/campanha-i3', area: 'vn' },
  { key: 'escala', label: 'Escala', path: '/escala', area: 'vn' },
  { key: 'vendedores', label: 'Performance', path: '/vendedores', area: 'vn' },
  // Visão do vendedor face aos colegas, em todos os KPIs. Só administradores "para já":
  // fora da matriz de funções até se decidir quem o pode ver (ver TabDef.adminOnly).
  { key: 'comparativo', label: 'Comparativo', path: '/comparativo', area: 'vn', adminOnly: true },
  // Parque de demonstradores (tabela `viaturas`, ainda partilhada com a plataforma Caetano).
  // Acesso pela matriz de funções; que colunas de preço cada função vê e quem gere os
  // preços do seu local também se atribuem aí (ver demoColunas.ts).
  { key: 'demos', label: 'Demos', path: '/demos', area: 'vn' },
  // Multas de equipa. 'view': consulta; 'edit': lança multas. Gerir o catálogo, reiniciar o
  // ciclo e apagar multas lançadas é só do administrador (UI e RLS: migração multas_gestao_admin).
  { key: 'multas', label: 'Multas', path: '/multas', area: 'vn' },
  // ── Vendas VU (em desenvolvimento) ──────────────────────────────────────────
  { key: 'wip', label: 'WIP', path: '/wip', area: 'vu' },
  { key: 'funil-vu', label: 'Funil', path: '/funil-vu', area: 'vu' },
  { key: 'angariacao', label: 'Angariação', path: '/angariacao', area: 'vu' },
  { key: 'stock', label: 'Stock', path: '/stock', area: 'vu' },
  { key: 'escala-vu', label: 'Escala', path: '/escala-vu', area: 'vu' },
  // ── Transversal (chave interna 'apv': é a chave que as áreas guardam) ───────
  { key: 'lavagem', label: 'Lavagem', path: '/lavagem', area: 'apv' },
  { key: 'instalacoes', label: 'Instalações', path: '/instalacoes', area: 'apv' },
  // Objetivos de Vendas VN e VU num só tab (antes: 'objetivos' no Arquivo e 'objetivos-vu' em VU).
  { key: 'objetivos', label: 'Objetivos', path: '/objetivos', area: 'apv' },
  // Catálogo BMW (dados técnicos e opcionais), migrado da plataforma Caetano.
  { key: 'produto', label: 'Produto', path: '/produto', area: 'apv' },
  // Linha do tempo dos eventos de marketing. 'view': consulta e gere só os seus convidados;
  // 'edit': gere eventos, todos os convidados e o orçamento (RLS: migração marketing_acessos).
  { key: 'marketing', label: 'Marketing', path: '/marketing', area: 'apv' },
  // ── Administração ───────────────────────────────────────────────────────────
  { key: 'dados', label: 'Dados', path: '/dados', area: 'admin' },
  { key: 'arquivo', label: 'Arquivo', path: '/arquivo', area: 'admin' },
  { key: 'utilizadores', label: 'Utilizadores', path: '/utilizadores', area: 'admin', adminOnly: true },
  // Sugestões e correções enviadas pelos utilizadores (qualquer um envia; este tab é a gestão).
  { key: 'sugestoes', label: 'Sugestões', path: '/sugestoes', area: 'admin' },
  // Quem entrou e o que usa (último login, última atividade): só administradores.
  { key: 'logs', label: 'Logs', path: '/logs', area: 'admin', adminOnly: true },
  // Arrumados dentro do Arquivo (fora da sidebar, ver ARCHIVED_TAB_KEYS).
  { key: 'pendentes', label: 'Pendentes', path: '/pendentes', area: 'admin' },
  { key: 'escala-repsol', label: 'Escala Repsol', path: '/escala-repsol', area: 'admin' },
  { key: 'emprestimos', label: 'Empréstimos', path: '/emprestimos', area: 'admin' },
  { key: 'database', label: 'Database', path: '/database', area: 'admin' },
  // Diário arquivado "para já": só o admin acede, mesmo que a função ainda tenha a
  // chave 'prospecao'. Para o reativar, voltar a pô-lo na área 'vn' sem adminOnly.
  { key: 'prospecao', label: 'Diário', path: '/prospecao', area: 'admin', adminOnly: true },
];

/* Tabs desta instalação: os desativados na configuração do cliente não existem. */
export const TABS: TabDef[] = ALL_TABS.filter(t => !client.disabledTabs.includes(t.key));

/* Área em que um tab aparece na navegação. Quase sempre é a sua área; exceção: o
 * End-of-Term é um tab de VN, mas um vendedor VU a quem foi dado acesso vê-o na
 * secção VU. "Vendedor VU" = vê algum tab VU e nenhum outro tab VN — por isso quem
 * trabalha em VN (e o administrador) continua a vê-lo em VN. */
export function navAreaFor(tab: TabDef, canView: (key: string) => boolean): AreaKey {
  if (tab.key !== 'end-of-term') return tab.area;
  const seesVu = TABS.some(t => t.area === 'vu' && canView(t.key));
  const seesOtherVn = TABS.some(t => t.area === 'vn' && t.key !== tab.key && canView(t.key));
  return seesVu && !seesOtherVn ? 'vu' : tab.area;
}

/* Tabs "arrumados" dentro do Arquivo (não aparecem diretamente na barra lateral). */
export const ARCHIVED_TAB_KEYS = ['pendentes', 'escala-repsol', 'emprestimos', 'database', 'prospecao'];

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
  /** Capacidade da base de dados que tem de existir para a permissão fazer efeito
   *  (migração aplicada); até lá não se mostra na matriz. */
  capability: keyof AppCapabilities;
}

const ALL_SUB_PERMISSIONS: SubPermissionDef[] = [
  { key: 'lavagem:reagendar', parent: 'lavagem', label: 'Reagendar e apagar',
    hint: 'Editar lavagens já existentes (arrastar na agenda) e removê-las. Quem tem edição no tab já o faz.', capability: 'lavagemGranular' },
  { key: 'lavagem:iniciar', parent: 'lavagem', label: 'Criar e iniciar',
    hint: 'Criar lavagens, iniciar as agendadas e usar "Agendar já".', capability: 'lavagemGranular' },
  { key: 'lavagem:qualidade', parent: 'lavagem', label: 'Controlo de qualidade',
    hint: 'Atribuir nota e observações de qualidade a uma lavagem.', capability: 'lavagemGranular' },
  { key: 'lavagem:registos', parent: 'lavagem', label: 'Ver registos',
    hint: 'Consultar o histórico e a auditoria de lavagens.', capability: 'lavagemGranular' },
  { key: 'end-of-term:todos', parent: 'end-of-term', label: 'Ver todos os contratos',
    hint: 'Ver e controlar os contratos de todos os vendedores, incluindo os sem responsável, e atribuir responsáveis. Sem isto, cada pessoa só vê os contratos que lhe estão afetos.',
    capability: 'eotGranular' },
  { key: 'end-of-term:local', parent: 'end-of-term', label: 'Chefe de equipa',
    hint: 'Ver os contratos da sua equipa (os responsáveis que lhe estão atribuídos no tab Responsáveis do End-of-Term), passá-los entre eles e gerir essa equipa. Não vê os contratos sem responsável. Sem isto, cada pessoa só vê os contratos que lhe estão afetos.',
    capability: 'eotResponsaveis' },
  { key: 'demos:inserir-viaturas', parent: 'demos', label: 'Inserir viaturas (do seu local)',
    hint: 'Introduzir e corrigir viaturas dos locais da pessoa (Utilizadores → Local), na Sales Force. Não vê nem altera as de outros locais e não apaga.',
    capability: 'viaturasLocal' },
  { key: 'demos:precos', parent: 'demos', label: 'Gerir preços (do seu local)',
    hint: 'Abre a janela de preço de cada viatura e grava os valores (preço base, opcionais, descontos, depreciações, PVP final) das viaturas dos locais da pessoa (Utilizadores → Local). Exige o tab Demos. Que colunas vê define-se à parte, por função.',
    capability: 'demosPrecos' },
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

/* ── Restrição por local ─────────────────────────────────────────────────────
 * Quem opera só em locais que não incluem LOCAL_ACESSO_COMPLETO (app_users.local) só vê o
 * tab End-of-Term (e as suas permissões `end-of-term:*`), com o nível que a função já lhe
 * dá — esta regra só retira acesso, nunca o dá. Sem local definido (ou sem nenhum local
 * reconhecido) não há restrição: segue-se a função. Todas as contas devem ter local (o tab
 * Utilizadores assinala as que faltam). Administradores e exceções por email ficam de fora.
 * É uma regra da INTERFACE: a RLS da base de dados continua a seguir só a matriz de funções
 * (exceto o Marketing, ver marketing_local_ok).
 * ──────────────────────────────────────────────────────────────────────────── */
export const LOCAL_ACESSO_COMPLETO = 'Aveiro';
export const TAB_FORA_DO_LOCAL = 'end-of-term';

export const restritoPeloLocal = (user: { local?: unknown } | null | undefined): boolean => {
  const locais = locaisDoPerfil(user?.local);
  return locais.length > 0 && !locais.includes(LOCAL_ACESSO_COMPLETO);
};

/** Este tab (ou permissão `tab:ação`) continua disponível a quem está fora do local?
 *  `tabsPorLocal`: tabs abertos a todos os locais com âmbito por linha na RLS
 *  (tabela app_tabs_por_local; ver getTabsPorLocal). */
export const tabLivreForaDoLocal = (tab: string, tabsPorLocal: readonly string[] = []): boolean =>
  tab === TAB_FORA_DO_LOCAL || tab.startsWith(`${TAB_FORA_DO_LOCAL}:`)
  // Inserir viaturas: o âmbito já é o local da pessoa (RLS viaturas_local_ok).
  || tab === 'demos:inserir-viaturas'
  || tabsPorLocal.includes(tab.split(':')[0]);

/* Tabs abertos fora de Aveiro, cada um limitado ao local da pessoa (função tabs_por_local,
 * migração 20261109140000). Sem a função (migração por aplicar): nenhum — a interface
 * mantém a regra antiga e nunca abre mais do que a base de dados abre. */
export async function getTabsPorLocal(): Promise<string[]> {
  const { data, error } = await supabase.rpc('tabs_por_local');
  if (error || !Array.isArray(data)) return [];
  return (data as unknown[]).filter((t): t is string => typeof t === 'string');
}

export interface AppUser {
  id: number | string;
  nome: string | null;
  email: string | null;
  perfil: string | null;
  local: unknown;
  negocio: unknown;
  marca: unknown;
  /** Só na resposta de createUser: o email já tinha login (p.ex. da Sales Force) e foi reutilizado. */
  existing_login?: boolean;
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
 * dados (migração por aplicar), usa-se a cópia legada do config do cliente
 * (`legacyTabAccessExceptions`), SÓ para essa situação: assim a edição que um
 * utilizador tinha não desaparece entre o deploy e a migração. Noutros erros não
 * há exceções: nunca eleva acesso por engano. */
export async function getMyAccessExceptions(email?: string | null): Promise<Record<string, AccessLevel>> {
  const { data, error } = await supabase.rpc('my_access_exceptions');
  if (error) {
    if ((error as { code?: string }).code === 'PGRST202') {
      console.warn('my_access_exceptions em falta na base de dados: a usar as exceções legadas do config. Aplicar a migração 20261003130000.');
      return (email && client.legacyTabAccessExceptions?.[email.toLowerCase()]) || {};
    }
    console.warn('Exceções de acesso indisponíveis:', error.message);
    return {};
  }
  const out: Record<string, AccessLevel> = {};
  Object.entries((data ?? {}) as Record<string, string>).forEach(([tab, lvl]) => {
    if (lvl === 'view' || lvl === 'edit') out[tab] = lvl;
  });
  return out;
}

/* Capacidades que a base de dados já tem (função app_capabilities, migração
 * lavagem_permissoes_granulares). Sem a função, nenhuma: a interface mantém as
 * regras antigas até a migração ser aplicada. */
export interface AppCapabilities { lavagemGranular: boolean; eotGranular: boolean; eotResponsaveis: boolean; viaturasLocal: boolean; demosPrecos: boolean }

export const NO_CAPABILITIES: AppCapabilities = { lavagemGranular: false, eotGranular: false, eotResponsaveis: false, viaturasLocal: false, demosPrecos: false };

export async function getAppCapabilities(): Promise<AppCapabilities> {
  const { data, error } = await supabase.rpc('app_capabilities');
  if (error) return { ...NO_CAPABILITIES };
  const caps = (data ?? {}) as Record<string, unknown>;
  return {
    lavagemGranular: caps.lavagem_granular === true,
    eotGranular: caps.eot_granular === true,
    eotResponsaveis: caps.eot_responsaveis === true,
    viaturasLocal: caps.viaturas_local === true,
    demosPrecos: caps.demos_precos === true,
  };
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

/** Erro da edge function admin-users; `code` distingue casos que a interface trata (ex.: 'shared_login'). */
export class AdminError extends Error {
  constructor(message: string, public code?: string) { super(message); this.name = 'AdminError'; }
}

/* Sessão terminada: o token que o browser ainda tem já não corresponde a uma sessão ativa
 * (entrou-se noutro separador ou dispositivo, ou a sessão foi revogada). A interface
 * continua a ler dados enquanto o token não expira, mas as operações de administração
 * validam a sessão a sério e respondem 401. */
export const SESSAO_TERMINADA = 'A tua sessão terminou (entraste noutro separador ou dispositivo, ou expirou). Sai e volta a entrar; depois repete a operação.';

async function invokeAdmin<T = unknown>(body: Record<string, unknown>, jaRenovou = false): Promise<T> {
  const { data, error } = await supabase.functions.invoke('admin-users', { body });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    if (ctx?.status === 401) {
      // Token expirado: renova-se uma vez e repete-se. Se não der, a sessão acabou mesmo.
      if (!jaRenovou) {
        const { data: renovada, error: rErr } = await supabase.auth.refreshSession();
        if (!rErr && renovada?.session) return invokeAdmin<T>(body, true);
      }
      throw new AdminError(SESSAO_TERMINADA, 'session_expired');
    }
    let msg = error.message;
    let code: string | undefined;
    // A edge function devolve { error, code? } em respostas não-2xx.
    try {
      const parsed = ctx && typeof ctx.json === 'function' ? await ctx.json() : null;
      if (parsed?.error) msg = parsed.error;
      if (typeof parsed?.code === 'string') code = parsed.code;
    } catch { /* ignora */ }
    throw new AdminError(msg, code);
  }
  if (data && (data as { error?: string }).error) {
    throw new AdminError((data as { error: string }).error, (data as { code?: string }).code);
  }
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
  const res = await invokeAdmin<{ user: AppUser; existing_login?: boolean }>({ action: 'create', ...input });
  return { ...res.user, existing_login: !!res.existing_login };
}

export async function updateUser(
  id: number | string,
  patch: Partial<Pick<AppUser, 'nome' | 'perfil' | 'local' | 'negocio' | 'marca'>>,
  password?: string,
  /** Confirma repor a password de um login partilhado com a Sales Force (muda o acesso às duas apps). */
  allowShared = false,
): Promise<AppUser> {
  const res = await invokeAdmin<{ user: AppUser }>({ action: 'update', id, patch, password, ...(allowShared ? { allow_shared: true } : {}) });
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

/* Renomeia uma função: os utilizadores que a têm passam para o novo nome. */
export async function renameRole(name: string, newName: string): Promise<AppRole> {
  try {
    const res = await invokeAdmin<{ role: AppRole }>({ action: 'rename_role', name, new_name: newName });
    return res.role;
  } catch (e) {
    // A edge function ainda não foi atualizada no Supabase (não conhece a ação).
    if (e instanceof Error && e.message === 'Ação desconhecida.') {
      throw new Error('Falta publicar a versão nova da função admin-users no Supabase (supabase functions deploy admin-users).');
    }
    throw e;
  }
}

export async function deleteRole(name: string): Promise<void> {
  await invokeAdmin({ action: 'delete_role', name });
}
