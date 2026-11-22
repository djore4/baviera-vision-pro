import { supabase } from '@/integrations/supabase/client';
import { toLocalIsoDay } from '@/lib/utils';
import { locaisDoPerfil } from '@/lib/locations';

/* ── Cartão Caetano Go ────────────────────────────────────────────────────────
 * Objetivo: cada 'Vendedor VN' faz OBJETIVO_MENSAL cartões por mês. Enquanto não os
 * tiver, a plataforma lembra-o (CartaoGoReminder). Só os administradores registam
 * (e apagam) cartões — o vendedor só lê os seus (RLS: migração 20261102120000_cartao_go).
 * ──────────────────────────────────────────────────────────────────────────── */

export const OBJETIVO_MENSAL = 2;   // objetivo por omissão (equipa sem objetivo definido)

/* ── Equipas / unidades de negócio ────────────────────────────────────────────
 * Tipificação dos colaboradores (app_users.equipa). Enquanto vazia, deduz-se de
 * negocio/marca (campos partilhados com a Sales Force): marca Motorrad → Motorrad,
 * VU → BMW VU, VD/VN → BMW VN. O APV não se deduz: define-se à mão. */
export const EQUIPAS = ['BMW VN', 'BMW VU', 'Motorrad', 'APV'] as const;
export type Equipa = (typeof EQUIPAS)[number];
export const isEquipa = (v: unknown): v is Equipa => (EQUIPAS as readonly string[]).includes(v as string);

const lista = (v: unknown): string[] =>
  (Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[,;|]/) : [])
    .map(x => String(x).trim().toLowerCase()).filter(Boolean);

export function equipaDeduzida(u: { negocio?: unknown; marca?: unknown } | null | undefined): Equipa | null {
  if (!u) return null;
  if (lista(u.marca).some(m => m.includes('motorrad'))) return 'Motorrad';
  const n = lista(u.negocio);
  if (n.includes('vu')) return 'BMW VU';
  if (n.includes('vd') || n.includes('vn')) return 'BMW VN';
  return null;
}

/** Equipa do colaborador: a definida; senão a deduzida; senão null (por tipificar). */
export const equipaDe = (u: { equipa?: string | null; negocio?: unknown; marca?: unknown } | null | undefined): Equipa | null =>
  isEquipa(u?.equipa) ? u!.equipa : equipaDeduzida(u);

export type Objetivos = Partial<Record<Equipa, number>>;
export const objetivoDe = (equipa: Equipa | null, objetivos: Objetivos): number =>
  (equipa && objetivos[equipa]) ?? OBJETIVO_MENSAL;

/** Estado de um colaborador no mês. Puro e testável. */
export const progresso = (feitos: number, objetivo: number) => ({
  feitos, objetivo, cumprido: feitos >= objetivo, falta: Math.max(0, objetivo - feitos),
});

/* Limite de insistência: no máximo MAX_ALERTAS_HORA pop-ups por janela de uma hora. */
export const MAX_ALERTAS_HORA = 3;
const JANELA_MS = 60 * 60 * 1000;
const chaveAlertas = (email: string) => `cartao-go-alertas:${email.toLowerCase()}`;

/** Instantes (ms) dos alertas que ainda contam na última hora. Puro e testável. */
export const alertasNaJanela = (instantes: number[], agora: number): number[] =>
  instantes.filter(t => Number.isFinite(t) && t <= agora && agora - t < JANELA_MS);

export const podeAlertar = (instantes: number[], agora: number): boolean =>
  alertasNaJanela(instantes, agora).length < MAX_ALERTAS_HORA;

/* Histórico em localStorage (partilhado entre separadores). Se não estiver disponível,
 * o limite aplica-se só enquanto o separador estiver aberto (fallback em memória). */
const emMemoria = new Map<string, number[]>();

export function lerAlertas(email: string, agora = Date.now()): number[] {
  try {
    const raw = JSON.parse(localStorage.getItem(chaveAlertas(email)) ?? '[]');
    if (Array.isArray(raw)) return alertasNaJanela(raw.map(Number), agora);
  } catch { /* indisponível ou corrompido */ }
  return alertasNaJanela(emMemoria.get(email) ?? [], agora);
}

export function registarAlerta(email: string, agora = Date.now()): void {
  const novos = [...lerAlertas(email, agora), agora];
  emMemoria.set(email, novos);
  try { localStorage.setItem(chaveAlertas(email), JSON.stringify(novos)); } catch { /* ignora */ }
}

/** Função a quem o aviso se dirige (sem distinguir maiúsculas nem espaços à volta). */
export const PERFIL_CARTAO_GO = 'Vendedor VN';

/** Local (stand) a quem o aviso se dirige, em nome canónico (app_users.local). */
export const LOCAL_CARTAO_GO = 'Aveiro';

export const isVendedorVN = (perfil: string | null | undefined) =>
  (perfil ?? '').trim().toLowerCase() === PERFIL_CARTAO_GO.toLowerCase();

/** Vendedor de BMW VN: a função antiga 'Vendedor VN', ou a função única 'Vendedor' com a equipa 'BMW VN'. */
export const isVendedorBmwVN = (u: { perfil?: string | null; equipa?: string | null } | null | undefined) =>
  !!u && (isVendedorVN(u.perfil) || ((u.perfil ?? '').trim().toLowerCase() === 'vendedor' && u.equipa === 'BMW VN'));

/** O aviso e o acompanhamento são só dos vendedores de BMW VN do local LOCAL_CARTAO_GO.
 *  Quem não tem local definido (ou tem outro) fica de fora — o local define-se em Utilizadores. */
export const aplicaCartaoGo = (u: { perfil?: string | null; equipa?: string | null; local?: unknown } | null | undefined) =>
  !!u && isVendedorBmwVN(u) && locaisDoPerfil(u.local).includes(LOCAL_CARTAO_GO);

export interface CartaoGoRegisto {
  id: string;
  vendedor_email: string;
  data: string;            // AAAA-MM-DD
  registado_por: string;
  created_at: string;
}

/** Primeiro dia do mês (inclusive) e primeiro do seguinte (exclusive), em AAAA-MM-DD. */
export function intervaloDoMes(ref: Date = new Date()): { de: string; ate: string } {
  return {
    de: toLocalIsoDay(new Date(ref.getFullYear(), ref.getMonth(), 1)),
    ate: toLocalIsoDay(new Date(ref.getFullYear(), ref.getMonth() + 1, 1)),
  };
}

/* A tabela ainda não existe (migração por aplicar): mensagem em vez de erro técnico. */
const traduzir = (e: { code?: string; message: string }): Error =>
  e.code === '42P01' || e.code === 'PGRST205'
    ? new Error('O Cartão Go ainda não está disponível (falta aplicar a migração na base de dados).')
    : new Error(e.message);

/** Registos do mês. Sem email: todos os que a base de dados deixa ver (administrador). */
export async function listarRegistosDoMes(email?: string, ref: Date = new Date()): Promise<CartaoGoRegisto[]> {
  const { de, ate } = intervaloDoMes(ref);
  let q = supabase.from('cartao_go_registos').select('*').gte('data', de).lt('data', ate)
    .order('data', { ascending: false }).order('created_at', { ascending: false });
  if (email) q = q.eq('vendedor_email', email.toLowerCase());
  const { data, error } = await q;
  if (error) throw traduzir(error);
  return (data ?? []) as CartaoGoRegisto[];
}

export async function registarCartao(email: string, data?: string): Promise<void> {
  const { error } = await supabase.from('cartao_go_registos')
    .insert({ vendedor_email: email.toLowerCase(), ...(data ? { data } : {}) });
  if (error) throw traduzir(error);
}

export async function apagarRegisto(id: string): Promise<void> {
  const { error } = await supabase.from('cartao_go_registos').delete().eq('id', id);
  if (error) throw traduzir(error);
}

/** Objetivos mensais definidos por equipa (as que não aparecem usam OBJETIVO_MENSAL). */
export async function listarObjetivos(): Promise<Objetivos> {
  const { data, error } = await supabase.from('ccgo_objetivos').select('equipa, objetivo');
  if (error) throw traduzir(error);
  const out: Objetivos = {};
  for (const r of (data ?? []) as { equipa: string; objetivo: number }[]) if (isEquipa(r.equipa)) out[r.equipa] = r.objetivo;
  return out;
}

export async function definirObjetivo(equipa: Equipa, objetivo: number): Promise<void> {
  const { error } = await supabase.from('ccgo_objetivos')
    .upsert({ equipa, objetivo, updated_at: new Date().toISOString() });
  if (error) throw traduzir(error);
}
