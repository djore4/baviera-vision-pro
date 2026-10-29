import * as XLSX from 'xlsx';
import { supabase as typedClient } from '@/integrations/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import { listRoles, listUsers } from '@/lib/permissions';

/* ── Campanha i3 (Vendas VN) ──────────────────────────────────────────────────
 * Oportunidades de contacto geradas por uma campanha. O administrador carrega-as
 * (colando a tabela ou com um ficheiro Excel/CSV, sempre no mesmo formato) e delega-as
 * em vendedores; cada vendedor acompanha as suas (estado, ponto de situação,
 * observações, próximo contacto). A RLS e os triggers da base de dados impõem quem vê
 * e altera o quê (migração campanha_i3) — aqui só se organiza e apresenta.
 * ──────────────────────────────────────────────────────────────────────────── */

/* Cliente sem tipos: as colunas de estado são texto na base de dados e aqui são uniões
 * (Estado); as respostas convertem-se para Lead. Mesmo padrão de instalacoes.ts. */
const supabase = typedClient as unknown as SupabaseClient;

export const TAB_KEY = 'campanha-i3';
const TABLE = 'campanha_i3_leads';
const HIST_TABLE = 'campanha_i3_historico';

/* ── Estados ─────────────────────────────────────────────────────────────────── */

export type Estado = 'novo' | 'em_contacto' | 'sem_resposta' | 'agendado' | 'proposta' | 'ganho' | 'perdido';

export const ESTADOS: { value: Estado; label: string; cls: string }[] = [
  { value: 'novo',         label: 'Novo',         cls: 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300' },
  { value: 'em_contacto',  label: 'Em contacto',  cls: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300' },
  { value: 'sem_resposta', label: 'Sem resposta', cls: 'bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300' },
  { value: 'agendado',     label: 'Agendado',     cls: 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300' },
  { value: 'proposta',     label: 'Proposta',     cls: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300' },
  { value: 'ganho',        label: 'Ganho',        cls: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300' },
  { value: 'perdido',      label: 'Perdido',      cls: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300' },
];

export const estadoDef = (e: Estado) => ESTADOS.find(x => x.value === e) ?? ESTADOS[0];

/* Oportunidades que ainda pedem ação (as ganhas e perdidas estão fechadas). */
export const isAtiva = (l: Pick<Lead, 'estado'>) => l.estado !== 'ganho' && l.estado !== 'perdido';

/* ── Tipos ───────────────────────────────────────────────────────────────────── */

export interface Lead {
  id: string;
  nome: string;
  email: string | null;
  contacto: string | null;
  data_contacto: string | null;   // ISO 'AAAA-MM-DD'
  polo: string | null;
  chave: string;
  owner_email: string | null;
  owner_nome: string | null;
  atribuido_em: string | null;
  atribuido_por: string | null;
  estado: Estado;
  ponto_situacao: string | null;
  observacoes: string | null;
  proximo_contacto: string | null;
  ultima_atualizacao: string | null;
  importado_por: string | null;
  created_at: string;
  updated_at: string;
}

export interface HistoricoItem {
  id: string;
  lead_id: string;
  tipo: 'importada' | 'atribuida' | 'estado' | 'ponto';
  de: string | null;
  para: string | null;
  autor: string | null;
  created_at: string;
}

/* O que se importa: os cinco campos da tabela da campanha. */
export interface LeadInput {
  nome: string;
  email: string | null;
  contacto: string | null;
  data_contacto: string | null;
  polo: string | null;
}

/* Campos do acompanhamento (o que o vendedor altera). */
export type Acompanhamento = Pick<Lead, 'estado' | 'ponto_situacao' | 'observacoes' | 'proximo_contacto'>;

export interface Vendedor { email: string; nome: string }

/* ── Datas ───────────────────────────────────────────────────────────────────── */

const pad = (n: number) => String(n).padStart(2, '0');

/** Hoje, 'AAAA-MM-DD' (hora local). */
export const hojeIso = (d: Date = new Date()): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** 'AAAA-MM-DD' → data em português; '—' se vazio. */
export const fmtDia = (iso: string | null): string =>
  iso ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('pt-PT') : '—';

/** Dias desde uma data/hora ISO (0 = hoje). `agora` injetável para testes. */
export function diasDesde(iso: string, agora: Date = new Date()): number {
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const b = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate()).getTime();
  return Math.max(0, Math.round((b - a) / 86400000));
}

const validDate = (y: number, m: number, d: number) => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};

/** Converte o que vem de uma célula (texto 'dd/mm/aaaa', 'aaaa-mm-dd', data do Excel
 *  ou número de série do Excel) em 'AAAA-MM-DD'; null se não for uma data válida.
 *  O texto lê-se sempre como dia/mês/ano (formato português). */
export function parseDia(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    // A leitura do Excel dá a meia-noite local ou UTC conforme o fuso: +12 h e partes UTC
    // dão sempre o dia certo.
    const d = new Date(v.getTime() + 12 * 3600 * 1000);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  if (typeof v === 'number') {
    if (!isFinite(v) || v < 1) return null;
    return parseDia(new Date(Math.round((v - 25569) * 86400000)));
  }
  const s = String(v).trim();
  let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(?:\s.*)?$/.exec(s);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return validDate(y, Number(m[2]), Number(m[1])) ? `${y}-${pad(Number(m[2]))}-${pad(Number(m[1]))}` : null;
  }
  m = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/.exec(s);
  if (m) return validDate(Number(m[1]), Number(m[2]), Number(m[3])) ? `${m[1]}-${m[2]}-${m[3]}` : null;
  return null;
};

/* ── Leitura da tabela colada / do ficheiro ──────────────────────────────────── */

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Divide texto em linhas e células (tabulação, ';' ou ','; aspas à CSV, como o Excel
 *  copia células com quebras de linha). */
export function splitTable(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const delim = firstLine.includes('\t') ? '\t' : firstLine.includes(';') ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === '') quoted = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      rows.push(row); row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some(x => x !== '')) rows.push(row);
  return rows.filter(r => r.some(x => x.trim() !== ''));
}

export interface ImportIssue { linha: number; msg: string }
export interface ParsedImport {
  rows: LeadInput[];
  /** Linhas ignoradas (sem nome). */
  erros: ImportIssue[];
  /** Avisos que não impedem a importação (ex.: email inválido, data ilegível). */
  avisos: ImportIssue[];
}

type Field = keyof LeadInput;
const ORDER: Field[] = ['nome', 'email', 'contacto', 'data_contacto', 'polo'];

/* Cabeçalhos aceites por campo (normalizados). */
const HEADERS: Record<Field, string[]> = {
  nome: ['nome entidade', 'nome', 'entidade', 'cliente'],
  email: ['e-mail entidade', 'email entidade', 'e-mail', 'email'],
  contacto: ['contacto entidade', 'contacto', 'telefone', 'telemovel', 'tlm'],
  data_contacto: ['data contacto', 'data de contacto', 'data'],
  polo: ['polo', 'pólo', 'local', 'concessao'],
};

function mapHeader(row: string[]): Record<Field, number> | null {
  const idx = {} as Record<Field, number>;
  let found = 0;
  for (const f of ORDER) {
    const i = row.findIndex(h => HEADERS[f].map(norm).includes(norm(String(h ?? ''))));
    idx[f] = i;
    if (i >= 0) found++;
  }
  // Cabeçalho = pelo menos o nome e mais um campo reconhecido.
  return idx.nome >= 0 && found >= 2 ? idx : null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Número de telefone para guardar/mostrar: sem espaços, pontos ou hífenes. */
export const cleanPhone = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(typeof v === 'number' ? Math.round(v) : v).replace(/[\s.\-()]/g, '');
  return s === '' ? null : s;
};

/** Só algarismos, sem o indicativo de Portugal — para comparar telefones. */
export const phoneDigits = (v: string | null | undefined): string => {
  const d = (v ?? '').replace(/\D/g, '');
  return d.length > 9 && d.startsWith('351') ? d.slice(3) : d;
};

/** Converte uma matriz de células (já lida do texto ou de um ficheiro) em oportunidades.
 *  Sem cabeçalho reconhecido, as colunas têm de vir na ordem da campanha:
 *  Nome, E-mail, Contacto, Data de contacto, Polo. */
export function rowsToLeads(matrix: unknown[][]): ParsedImport {
  const out: ParsedImport = { rows: [], erros: [], avisos: [] };
  const rows = matrix.filter(r => r.some(c => String(c ?? '').trim() !== ''));
  if (rows.length === 0) return out;

  const header = mapHeader(rows[0].map(c => String(c ?? '')));
  const idx: Record<Field, number> = header ?? { nome: 0, email: 1, contacto: 2, data_contacto: 3, polo: 4 };
  const first = header ? 1 : 0;
  const cell = (r: unknown[], f: Field) => (idx[f] >= 0 ? r[idx[f]] : undefined);
  const txt = (v: unknown) => { const s = String(v ?? '').trim(); return s === '' ? null : s; };

  rows.slice(first).forEach((r, i) => {
    const linha = first + i + 1;
    const nome = (txt(cell(r, 'nome')) ?? '').replace(/\s+/g, ' ');
    if (!nome) { out.erros.push({ linha, msg: 'Sem nome.' }); return; }

    let email = txt(cell(r, 'email'))?.toLowerCase() ?? null;
    if (email && !EMAIL_RE.test(email)) { out.avisos.push({ linha, msg: `${nome}: email inválido ignorado (${email}).` }); email = null; }

    const rawData = cell(r, 'data_contacto');
    const data = parseDia(rawData);
    if (!data && txt(rawData)) out.avisos.push({ linha, msg: `${nome}: data ilegível ignorada (${String(rawData).trim()}).` });

    out.rows.push({
      nome, email, contacto: cleanPhone(cell(r, 'contacto')), data_contacto: data, polo: txt(cell(r, 'polo')),
    });
  });
  return out;
}

export const parseLeadsText = (text: string): ParsedImport => rowsToLeads(splitTable(text));

/** Lê um ficheiro Excel (.xlsx/.xls) ou CSV: usa a primeira folha. */
export function parseLeadsFile(buffer: ArrayBuffer): ParsedImport {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error('O ficheiro não tem folhas.');
  return rowsToLeads(XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: true }));
}

/* ── Duplicados ──────────────────────────────────────────────────────────────── */

/** Chave que identifica a mesma pessoa (espelha o trigger da base de dados): o email, ou
 *  o telefone só com algarismos, ou o nome. */
export const leadKey = (l: Pick<LeadInput, 'nome' | 'email' | 'contacto'>): string =>
  (l.email ?? '').trim().toLowerCase()
  || (l.contacto ?? '').replace(/\D/g, '')
  || l.nome.trim().toLowerCase();

export interface ImportPlan {
  novas: LeadInput[];
  /** Já existem (no sistema ou repetidas na própria importação). */
  duplicadas: { lead: LeadInput; existente: string | null }[];
}

/** Separa as oportunidades novas das que já existem. Uma é duplicada se a chave, o email
 *  ou o telefone coincidirem com uma já registada — ou com outra da mesma importação. */
export function planImport(rows: LeadInput[], existentes: Pick<Lead, 'nome' | 'email' | 'contacto' | 'chave'>[]): ImportPlan {
  const byKey = new Map<string, string>();
  const byEmail = new Map<string, string>();
  const byPhone = new Map<string, string>();
  const add = (l: Pick<LeadInput, 'nome' | 'email' | 'contacto'>) => {
    byKey.set(leadKey(l), l.nome);
    if (l.email) byEmail.set(l.email.toLowerCase(), l.nome);
    const p = phoneDigits(l.contacto);
    if (p.length >= 9) byPhone.set(p, l.nome);
  };
  existentes.forEach(add);

  const plan: ImportPlan = { novas: [], duplicadas: [] };
  for (const r of rows) {
    const p = phoneDigits(r.contacto);
    const existente = byKey.get(leadKey(r)) ?? (r.email ? byEmail.get(r.email) : undefined) ?? (p.length >= 9 ? byPhone.get(p) : undefined);
    if (existente !== undefined) plan.duplicadas.push({ lead: r, existente });
    else { plan.novas.push(r); add(r); }
  }
  return plan;
}

/* ── Acesso a dados ──────────────────────────────────────────────────────────── */

export async function listLeads(): Promise<Lead[]> {
  // A RLS devolve só o que a pessoa pode ver (o administrador, tudo). Páginas de 1000.
  const out: Lead[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(TABLE).select('*')
      .order('created_at', { ascending: false }).order('id').range(from, from + 999);
    if (error) throw new Error(`Não foi possível ler as oportunidades: ${error.message}`);
    out.push(...((data ?? []) as Lead[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** Insere as oportunidades; as que já existirem (mesma chave) ficam como estão. Devolve
 *  as inseridas. */
export async function importLeads(rows: LeadInput[]): Promise<Lead[]> {
  const inserted: Lead[] = [];
  for (let i = 0; i < rows.length; i += 200) {
    const { data, error } = await supabase.from(TABLE)
      .upsert(rows.slice(i, i + 200), { onConflict: 'chave', ignoreDuplicates: true })
      .select();
    if (error) throw new Error(`Não foi possível importar: ${error.message}`);
    inserted.push(...((data ?? []) as Lead[]));
  }
  return inserted;
}

const clean = (s: string | null | undefined) => { const v = (s ?? '').trim(); return v === '' ? null : v; };

export async function updateAcompanhamento(id: string, patch: Partial<Acompanhamento>): Promise<Lead> {
  const row: Record<string, unknown> = { ...patch };
  if ('ponto_situacao' in patch) row.ponto_situacao = clean(patch.ponto_situacao);
  if ('observacoes' in patch) row.observacoes = clean(patch.observacoes);
  if ('proximo_contacto' in patch) row.proximo_contacto = patch.proximo_contacto || null;
  const { data, error } = await supabase.from(TABLE).update(row).eq('id', id).select().single();
  if (error) throw new Error(`Não foi possível guardar: ${error.message}`);
  return data as Lead;
}

/** Administrador: corrige os dados de contacto de uma oportunidade. */
export async function updateDados(id: string, patch: Partial<LeadInput>): Promise<Lead> {
  const { data, error } = await supabase.from(TABLE).update(patch).eq('id', id).select().single();
  if (error) throw new Error(`Não foi possível guardar: ${error.message}`);
  return data as Lead;
}

/** Delega (ou, com null, retira a delegação de) um conjunto de oportunidades. É uma só
 *  operação: o vendedor recebe um único aviso, seja qual for o número delegado. */
export async function assignLeads(ids: string[], vendedor: Vendedor | null): Promise<Lead[]> {
  const out: Lead[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase.from(TABLE)
      .update({ owner_email: vendedor?.email.toLowerCase() ?? null, owner_nome: vendedor?.nome ?? null })
      .in('id', ids.slice(i, i + 200)).select();
    if (error) throw new Error(`Não foi possível delegar: ${error.message}`);
    out.push(...((data ?? []) as Lead[]));
  }
  return out;
}

export async function deleteLeads(ids: string[]): Promise<void> {
  for (let i = 0; i < ids.length; i += 200) {
    const { error } = await supabase.from(TABLE).delete().in('id', ids.slice(i, i + 200));
    if (error) throw new Error(`Não foi possível apagar: ${error.message}`);
  }
}

export async function listHistorico(leadId: string): Promise<HistoricoItem[]> {
  const { data, error } = await supabase.from(HIST_TABLE).select('*').eq('lead_id', leadId)
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data ?? []) as HistoricoItem[];
}

/** Utilizadores a quem se pode delegar: os que têm o tab da campanha na sua função
 *  (e os administradores). */
export async function listVendedores(): Promise<Vendedor[]> {
  const [roles, users] = await Promise.all([listRoles(), listUsers()]);
  const ok = new Set(roles.filter(r => r.is_admin || (r.permissions?.[TAB_KEY] ?? 'none') !== 'none').map(r => r.name));
  return users
    .filter(u => u.email && u.perfil && ok.has(u.perfil))
    .map(u => ({ email: (u.email as string).toLowerCase(), nome: u.nome?.trim() || (u.email as string) }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));
}

export function historicoLabel(h: Pick<HistoricoItem, 'tipo' | 'de' | 'para'>): string {
  switch (h.tipo) {
    case 'importada': return 'Oportunidade importada';
    case 'atribuida':
      if (!h.para) return `Delegação retirada (era ${h.de})`;
      return h.de ? `Delegada a ${h.para} (antes: ${h.de})` : `Delegada a ${h.para}`;
    case 'estado': return `Estado: ${estadoDef((h.de ?? 'novo') as Estado).label} → ${estadoDef((h.para ?? 'novo') as Estado).label}`;
    case 'ponto': return `Ponto de situação: ${h.para}`;
  }
}

/* ── Derivados (puros, testáveis) ────────────────────────────────────────────── */

/** Dias sem acompanhamento a partir dos quais uma oportunidade delegada é "parada". */
export const DIAS_PARADA = 2;

/** Próximo contacto já passou e a oportunidade continua ativa. */
export const isAtrasada = (l: Lead, hoje: string = hojeIso()) =>
  isAtiva(l) && !!l.proximo_contacto && l.proximo_contacto < hoje;

/** Delegada, ativa e sem acompanhamento há ≥ DIAS_PARADA dias (desde a última atualização,
 *  ou desde a delegação se ainda ninguém lhe mexeu). */
export function isParada(l: Lead, agora: Date = new Date()): boolean {
  if (!isAtiva(l) || !l.owner_email) return false;
  const ref = l.ultima_atualizacao ?? l.atribuido_em;
  return !!ref && diasDesde(ref, agora) >= DIAS_PARADA;
}

export interface Kpis {
  total: number;
  porDelegar: number;     // ativas sem responsável
  porContactar: number;   // estado 'novo'
  emCurso: number;        // ativas
  agendados: number;
  ganhos: number;
  atrasadas: number;
  paradas: number;
}

export function kpis(list: Lead[], agora: Date = new Date()): Kpis {
  const hoje = hojeIso(agora);
  return {
    total: list.length,
    porDelegar: list.filter(l => isAtiva(l) && !l.owner_email).length,
    porContactar: list.filter(l => l.estado === 'novo').length,
    emCurso: list.filter(isAtiva).length,
    agendados: list.filter(l => l.estado === 'agendado').length,
    ganhos: list.filter(l => l.estado === 'ganho').length,
    atrasadas: list.filter(l => isAtrasada(l, hoje)).length,
    paradas: list.filter(l => isParada(l, agora)).length,
  };
}

export interface ResumoVendedor {
  email: string;
  nome: string;
  delegadas: number;
  porContactar: number;
  emCurso: number;
  agendados: number;
  ganhos: number;
  atrasadas: number;
  paradas: number;
}

/** Uma linha por vendedor com oportunidades delegadas (mais carregados primeiro). */
export function resumoPorVendedor(list: Lead[], agora: Date = new Date()): ResumoVendedor[] {
  const hoje = hojeIso(agora);
  const m = new Map<string, ResumoVendedor>();
  for (const l of list) {
    if (!l.owner_email) continue;
    let r = m.get(l.owner_email);
    if (!r) {
      r = { email: l.owner_email, nome: l.owner_nome ?? l.owner_email, delegadas: 0, porContactar: 0, emCurso: 0, agendados: 0, ganhos: 0, atrasadas: 0, paradas: 0 };
      m.set(l.owner_email, r);
    }
    r.delegadas++;
    if (l.estado === 'novo') r.porContactar++;
    if (isAtiva(l)) r.emCurso++;
    if (l.estado === 'agendado') r.agendados++;
    if (l.estado === 'ganho') r.ganhos++;
    if (isAtrasada(l, hoje)) r.atrasadas++;
    if (isParada(l, agora)) r.paradas++;
  }
  return [...m.values()].sort((a, b) => b.emCurso - a.emCurso || a.nome.localeCompare(b.nome, 'pt'));
}

export interface LeadFiltro {
  estado?: 'ativas' | 'all' | Estado;
  /** 'all' | 'none' (por delegar) | email do vendedor. */
  owner?: string;
  polo?: string;                 // 'all' ou o polo
  quick?: 'atrasadas' | 'paradas' | 'novas_hoje' | null;
  q?: string;
}

/** Filtra e ordena: ativas primeiro; atrasadas e por contactar à frente; depois as mais antigas. */
export function filtrar(list: Lead[], f: LeadFiltro, agora: Date = new Date()): Lead[] {
  const hoje = hojeIso(agora);
  const q = norm(f.q ?? '');
  const qDigits = q.replace(/\D/g, '');
  return list
    .filter(l => {
      const e = f.estado ?? 'ativas';
      return e === 'all' ? true : e === 'ativas' ? isAtiva(l) : l.estado === e;
    })
    .filter(l => !f.owner || f.owner === 'all' || (f.owner === 'none' ? !l.owner_email : l.owner_email === f.owner))
    .filter(l => !f.polo || f.polo === 'all' || l.polo === f.polo)
    .filter(l => f.quick === 'atrasadas' ? isAtrasada(l, hoje)
      : f.quick === 'paradas' ? isParada(l, agora)
      : f.quick === 'novas_hoje' ? hojeIso(new Date(l.created_at)) === hoje
      : true)
    .filter(l => !q || norm([l.nome, l.email, l.contacto, l.polo, l.owner_nome, l.ponto_situacao, l.observacoes].filter(Boolean).join(' ')).includes(q)
      || (qDigits.length >= 3 && phoneDigits(l.contacto).includes(qDigits)))
    .sort((a, b) =>
      Number(isAtiva(b)) - Number(isAtiva(a))
      || Number(isAtrasada(b, hoje)) - Number(isAtrasada(a, hoje))
      || (a.data_contacto ?? '9999').localeCompare(b.data_contacto ?? '9999')
      || a.created_at.localeCompare(b.created_at)
      || a.nome.localeCompare(b.nome, 'pt'));
}

export const polosUsados = (list: Lead[]): string[] =>
  [...new Set(list.map(l => l.polo).filter((p): p is string => !!p))].sort((a, b) => a.localeCompare(b, 'pt'));

/** Reparte as oportunidades, por ordem, pelos vendedores (volta ao primeiro depois do
 *  último): a diferença entre quem recebe mais e menos é no máximo uma. `carga` (opcional)
 *  é o que cada um já tem; os que têm menos recebem primeiro, para equilibrar o total. */
export function distribuir(ids: string[], vendedores: Vendedor[], carga: Record<string, number> = {}): Map<string, string[]> {
  const out = new Map<string, string[]>(vendedores.map(v => [v.email, []]));
  if (vendedores.length === 0) return out;
  const total = new Map(vendedores.map(v => [v.email, carga[v.email] ?? 0]));
  for (const id of ids) {
    // O vendedor com menos (já tem + acabou de receber); empate: o que aparece primeiro.
    let best = vendedores[0].email;
    for (const v of vendedores) if ((total.get(v.email) ?? 0) < (total.get(best) ?? 0)) best = v.email;
    out.get(best)!.push(id);
    total.set(best, (total.get(best) ?? 0) + 1);
  }
  return out;
}

/* ── Ligações de contacto ────────────────────────────────────────────────────── */

/** Número para ligar: 9 algarismos → +351; com indicativo, mantém-no. */
export function telHref(contacto: string | null): string | null {
  const p = phoneDigits(contacto);
  if (p.length < 9) return null;
  return `tel:${(contacto ?? '').trim().startsWith('+') ? `+${(contacto ?? '').replace(/\D/g, '')}` : p}`;
}

/** Ligação do WhatsApp (assume Portugal quando o número não traz indicativo). */
export function whatsappHref(contacto: string | null): string | null {
  const raw = (contacto ?? '').replace(/\D/g, '');
  if (raw.length < 9) return null;
  const full = raw.length === 9 ? `351${raw}` : raw.startsWith('00') ? raw.slice(2) : raw;
  return `https://wa.me/${full}`;
}

/* ── Exportar ────────────────────────────────────────────────────────────────── */

export function exportLeads(list: Lead[], fileName = `campanha-i3-${hojeIso()}.xlsx`): void {
  const rows = list.map(l => ({
    'Nome Entidade': l.nome,
    'E-mail Entidade': l.email ?? '',
    'Contacto Entidade': l.contacto ?? '',
    'Data Contacto': fmtDia(l.data_contacto) === '—' ? '' : fmtDia(l.data_contacto),
    'Polo': l.polo ?? '',
    'Responsável': l.owner_nome ?? l.owner_email ?? '',
    'Estado': estadoDef(l.estado).label,
    'Ponto de situação': l.ponto_situacao ?? '',
    'Observações': l.observacoes ?? '',
    'Próximo contacto': fmtDia(l.proximo_contacto) === '—' ? '' : fmtDia(l.proximo_contacto),
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Campanha i3');
  XLSX.writeFile(wb, fileName);
}
