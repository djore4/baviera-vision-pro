import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { toLocalIsoDay } from '@/lib/utils';
import { canonicalLocal } from '@/lib/locations';

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

/* Temperatura do negócio (classificação do vendedor). A cor facilita a leitura
 * rápida da carteira por parte do administrador. */
export type Temperatura = 'frio' | 'morno' | 'quente';

export const TEMPERATURAS: { value: Temperatura; label: string; badge: string; row: string; dot: string }[] = [
  { value: 'frio',   label: 'Frio',   dot: 'bg-sky-500',   badge: 'bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-200',       row: 'border-l-sky-500 bg-sky-500/[0.06]' },
  { value: 'morno',  label: 'Morno',  dot: 'bg-amber-500', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200', row: 'border-l-amber-500 bg-amber-500/[0.07]' },
  { value: 'quente', label: 'Quente', dot: 'bg-red-500',   badge: 'bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-200',         row: 'border-l-red-500 bg-red-500/[0.07]' },
];

export const tempDef = (t: Temperatura | null) => TEMPERATURAS.find(x => x.value === t) ?? null;

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
  temperatura: Temperatura | null;
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

/* Escopo de leitura: o diretor (chefe de vendas) vê tudo; o chefe de equipa vê os
 * contratos da sua equipa (a base de dados já devolve só esses); o vendedor só o seu. */
export interface Scope {
  isDirector: boolean;
  isLocalLead?: boolean;
  email: string | null;
}

/* Só o vendedor comum é filtrado por responsável no cliente; o diretor e o chefe
 * de equipa confiam na RLS (que, para o chefe, devolve os contratos da equipa). */
const ownOnly = (scope: Scope) => !scope.isDirector && !scope.isLocalLead && !!scope.email;

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

const isoDate = (d: Date | null) => (d ? toLocalIsoDay(d) : null);

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
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '', raw: true, cellDates: true } as XLSX.Sheet2JSONOpts);

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

/** Junta uma linha do ficheiro ao que já existe: o ficheiro manda quando traz
 *  valor; uma célula vazia nunca apaga o valor atual (p.ex. um contacto corrigido
 *  na app). */
export function mergeEotRow(incoming: EotImportRow, existing?: Partial<EotImportRow>): EotImportRow {
  if (!existing) return incoming;
  const out = { ...incoming } as Record<string, unknown>;
  for (const [k, v] of Object.entries(existing)) {
    if (out[k] == null && v != null) out[k] = v;
  }
  return out as unknown as EotImportRow;
}

/** Importa o mapa: UPSERT por número de contrato das colunas-base. Preserva o
 *  estado de acompanhamento e o histórico dos contratos já existentes, e não
 *  apaga valores existentes com células vazias do ficheiro. Devolve o número de
 *  contratos importados. */
export async function importEotContracts(rows: EotImportRow[]): Promise<number> {
  if (rows.length === 0) {
    throw new Error('O ficheiro não tem contratos válidos — importação cancelada.');
  }
  const BATCH = 200;
  const baseCols = Object.keys(rows[0]).join(', ');
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const { data: current, error: readErr } = await supabase
      .from(TABLE).select(baseCols).in('contrato', slice.map(r => r.contrato));
    if (readErr) throw new Error(`Erro ao ler terminações existentes (lote ${i / BATCH + 1}): ${readErr.message}`);
    const byContrato = new Map(((current ?? []) as unknown as EotImportRow[]).map(c => [c.contrato, c]));
    const chunk = slice.map(r => ({ ...mergeEotRow(r, byContrato.get(r.contrato)), imported_at: new Date().toISOString() }));
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
  if (ownOnly(scope)) q = q.eq('owner_email', scope.email!);
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
  'fase' | 'temperatura' | 'resultado' | 'obs' | 'owner_email' | 'owner_nome'
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
  if (ownOnly(scope)) q = q.eq('owner_email', scope.email!);
  const { data, error } = await q;
  if (error || !data) return [];
  const set = new Set<string>();
  (data as { vendedor: string | null }[]).forEach(r => { if (r.vendedor) set.add(r.vendedor); });
  return [...set].sort((a, b) => a.localeCompare(b));
}

/* ── Responsáveis (a quem se atribuem contratos) ──────────────────────────────── */

/* `nome` é o texto que fica no contrato (owner_nome): "RD · Rui Duarte". */
export interface EotOwner {
  email: string; nome: string; iniciais?: string;
  /** Onde trabalha (só para sugerir quem atribuir). */
  locais?: string[];
  /** Chefe de equipa (email): o chefe vê os contratos da sua equipa. */
  chefe_email?: string | null;
}

/* Lista que existia no código, antes de os responsáveis passarem a ser geridos na
 * base de dados (tabela eot_owners). Só se usa enquanto a migração não estiver
 * aplicada (listEotOwners cai aqui se a tabela não existir). */
const LEGACY_OWNERS: { initials: string; email: string }[] = [
  { initials: 'BR', email: 'belmiro.resgate@caetano.pt' },
  { initials: 'FS', email: 'fernando.sousa@caetano.pt' },
  { initials: 'NC', email: 'nuno.conde@caetano.pt' },
  { initials: 'PM', email: 'paulo.j.matos@caetano.pt' },
  { initials: 'FD', email: 'francisco.dias@caetano.pt' },
  { initials: 'AL', email: 'antonio.lourenco@caetano.pt' },
  { initials: 'MP', email: 'marcos.pinto@caetano.pt' },
  { initials: 'RD', email: 'rui.duarte@caetano.pt' },
];

const ownerLabel = (iniciais: string, nome: string | null | undefined, email: string) =>
  `${iniciais} · ${nome || email}`;

async function userNames(): Promise<Map<string, string | null>> {
  const { data } = await supabase.from('app_users').select('nome, email');
  return new Map(
    ((data ?? []) as { nome: string | null; email: string | null }[])
      .filter(u => u.email).map(u => [u.email!.toLowerCase(), u.nome]),
  );
}

/** Responsáveis possíveis, com o nome resolvido na tabela de utilizadores. */
export async function listEotOwners(): Promise<EotOwner[]> {
  const [{ data, error }, names] = await Promise.all([
    supabase.from('eot_owners').select('email, iniciais, locais, chefe_email').order('iniciais'),
    userNames(),
  ]);
  if (error) {
    // Migração por aplicar: mantém a lista antiga (ignora quem não tenha conta).
    return LEGACY_OWNERS
      .filter(o => names.has(o.email))
      .map(o => ({ email: o.email, iniciais: o.initials, nome: ownerLabel(o.initials, names.get(o.email), o.email) }));
  }
  return (data ?? [])
    .filter(o => names.has(o.email))   // sem conta já não é utilizador: não se lhe atribui
    .map(o => ({
      email: o.email, iniciais: o.iniciais, locais: o.locais ?? [], chefe_email: o.chefe_email,
      nome: ownerLabel(o.iniciais, names.get(o.email), o.email),
    }));
}

/** Cria ou atualiza um responsável (iniciais, local(is) onde trabalha e chefe de equipa). */
export async function saveEotOwner(o: { email: string; iniciais: string; locais: string[]; chefe_email: string | null }): Promise<void> {
  const row = {
    email: o.email.trim().toLowerCase(),
    iniciais: o.iniciais.trim().toUpperCase(),
    locais: [...new Set(o.locais.map(l => l.trim()).filter(Boolean))],
    chefe_email: o.chefe_email ? o.chefe_email.trim().toLowerCase() : null,
    updated_at: new Date().toISOString(),
  };
  if (!row.iniciais) throw new Error('Indique as iniciais do responsável.');
  const { error } = await supabase.from('eot_owners').upsert(row, { onConflict: 'email' });
  if (error) throw new Error(`Não foi possível guardar o responsável: ${error.message}`);
}

/** Remove um responsável. Os contratos já atribuídos mantêm o responsável; os
 *  seus mapeamentos de nomes do Excel desaparecem. */
export async function deleteEotOwner(email: string): Promise<void> {
  const { error } = await supabase.from('eot_owners').delete().eq('email', email.toLowerCase());
  if (error) throw new Error(`Não foi possível remover o responsável: ${error.message}`);
}

/* ── Tabela de conversão: nome do VENDEDOR no Excel → responsável ──────────────── */

export interface EotVendedorMapRow { raw_norm: string; owner_email: string; raw_exemplo: string | null; }

/** Chave de comparação dos nomes do Excel: sem acentos, pontos nem maiúsculas e com
 *  espaços simples — "Rui M. Duarte" e "RUI  M DUARTE" dão a mesma chave. */
export function normVendedor(v: string | null | undefined): string {
  return (v ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

export async function listEotVendedorMap(): Promise<EotVendedorMapRow[]> {
  const { data, error } = await supabase.from('eot_vendedor_map').select('raw_norm, owner_email, raw_exemplo');
  if (error) return [];
  return (data ?? []) as EotVendedorMapRow[];
}

export async function addEotVendedorMap(rawExemplo: string, ownerEmail: string): Promise<void> {
  const raw_norm = normVendedor(rawExemplo);
  if (!raw_norm) throw new Error('Nome em branco.');
  const { error } = await supabase.from('eot_vendedor_map')
    .upsert({ raw_norm, owner_email: ownerEmail.toLowerCase(), raw_exemplo: rawExemplo.trim() }, { onConflict: 'raw_norm,owner_email' });
  if (error) throw new Error(`Não foi possível guardar o mapeamento: ${error.message}`);
}

export async function removeEotVendedorMap(rawNorm: string, ownerEmail: string): Promise<void> {
  const { error } = await supabase.from('eot_vendedor_map').delete()
    .eq('raw_norm', rawNorm).eq('owner_email', ownerEmail.toLowerCase());
  if (error) throw new Error(`Não foi possível remover o mapeamento: ${error.message}`);
}

/** Responsáveis sugeridos para um contrato: os mapeados para o nome do VENDEDOR. Se
 *  houver mais de um (homónimos), prefere os que trabalham no local do contrato. */
export function suggestOwners(
  contract: Pick<EotContract, 'vendedor' | 'concessionario_resp' | 'concessionario'>,
  owners: EotOwner[],
  map: EotVendedorMapRow[],
): EotOwner[] {
  const key = normVendedor(contract.vendedor);
  if (!key) return [];
  const emails = new Set(map.filter(m => m.raw_norm === key).map(m => m.owner_email.toLowerCase()));
  const found = owners.filter(o => emails.has(o.email.toLowerCase()));
  if (found.length <= 1) return found;
  const local = contractLocal(contract);
  const inLocal = found.filter(o => o.locais?.includes(local));
  return inLocal.length > 0 ? inLocal : found;
}

/** Ordena os responsáveis para atribuir: sugeridos, depois os do local do contrato, depois os restantes. */
export function groupOwnersFor(
  contract: Pick<EotContract, 'vendedor' | 'concessionario_resp' | 'concessionario'>,
  owners: EotOwner[],
  map: EotVendedorMapRow[],
): { sugeridos: EotOwner[]; doLocal: EotOwner[]; outros: EotOwner[] } {
  const sugeridos = suggestOwners(contract, owners, map);
  const taken = new Set(sugeridos.map(o => o.email));
  const local = contractLocal(contract);
  const rest = owners.filter(o => !taken.has(o.email));
  return {
    sugeridos,
    doLocal: rest.filter(o => o.locais?.includes(local)),
    outros: rest.filter(o => !o.locais?.includes(local)),
  };
}

/** Atribui (ou remove) o responsável de follow-up de um contrato. */
export async function assignEotOwner(contrato: string, owner: EotOwner | null): Promise<EotContract> {
  return updateEotContract(contrato, {
    owner_email: owner?.email ?? null,
    owner_nome: owner?.nome ?? null,
  });
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
  if (ownOnly(scope)) aq = aq.eq('owner_email', scope.email!);
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
  if (ownOnly(scope)) q = q.eq('owner_email', scope.email!);
  const { count, error } = await q;
  if (error) return 0;
  return count ?? 0;
}

/* Local (cidade) de um contrato: parte do "concessionário responsável" sem a marca
 * nem o sufixo numérico — "Baviera Aveiro 2" e "Caetano Aveiro" → "Aveiro". */
export function contractLocal(c: Pick<EotContract, 'concessionario_resp' | 'concessionario'>): string {
  const raw = (c.concessionario_resp || c.concessionario || '').trim();
  if (!raw) return '—';
  const conhecido = canonicalLocal(raw); // local do grupo (client.locais), em nome canónico
  if (conhecido) return conhecido;
  const s = raw
    .replace(/^(Caetano Baviera|Baviera|Caetano)\s*[–-]?\s*/i, '')
    .replace(/\s+\d+$/, '')
    .replace(/\s+-\s+.*$/, '')     // "Lisboa - M.G.Costa" → "Lisboa"
    .replace(/^V\.\s*N\.\s*Gaia$/i, 'Gaia')
    .trim();
  return s || raw;
}

/* Local que o filtro mostra por omissão, em vez de um fixo para toda a gente:
 *  1. os locais do perfil (escolhidos em Utilizadores): um só → esse; vários → todos;
 *  2. senão, o único local da ficha do utilizador em eot_owners;
 *  3. senão, o único local dos contratos que lhe chegam (um vendedor de outro
 *     stand só tem os seus);
 *  4. senão, todos. */
export function localPorOmissao(
  contracts: Pick<EotContract, 'concessionario_resp' | 'concessionario'>[],
  owners: Pick<EotOwner, 'email' | 'locais'>[],
  myEmail: string | null,
  perfilLocais: string[] = [],
): string {
  if (perfilLocais.length > 0) return perfilLocais.length === 1 ? perfilLocais[0] : 'all';
  const mine = owners.find(o => !!myEmail && o.email.toLowerCase() === myEmail.toLowerCase());
  if (mine?.locais?.length === 1) return mine.locais[0];
  const locais = new Set(contracts.map(contractLocal));
  return locais.size === 1 ? [...locais][0] : 'all';
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

/** Mês de uma data, 'AAAA-MM' (hora local). */
export const toIsoMonth = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

export const eur = (v: number | null): string =>
  v == null ? '—' : v.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
