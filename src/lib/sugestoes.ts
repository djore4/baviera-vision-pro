import { supabase } from '@/integrations/supabase/client';

/* ── Sugestões e correções da plataforma ──────────────────────────────────────
 * Qualquer utilizador regista e vê as suas; quem tem o tab 'sugestoes' vê todas e,
 * com edição, responde e muda o estado (RLS: migração 20261028120000_sugestoes).
 * O autor, o estado inicial e a data vêm da base de dados, não do browser.
 * ──────────────────────────────────────────────────────────────────────────── */

export type Tipo = 'ideia' | 'correcao' | 'problema';
export type Estado = 'nova' | 'em_analise' | 'planeada' | 'feita' | 'recusada';

export const TIPOS: { value: Tipo; label: string; hint: string; cls: string }[] = [
  { value: 'ideia', label: 'Ideia', hint: 'Algo novo que ajudava', cls: 'bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-200' },
  { value: 'correcao', label: 'Correção', hint: 'Algo que podia estar melhor', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200' },
  { value: 'problema', label: 'Problema', hint: 'Algo que não funciona', cls: 'bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-200' },
];

export const ESTADOS: { value: Estado; label: string; cls: string }[] = [
  { value: 'nova', label: 'Nova', cls: 'bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300' },
  { value: 'em_analise', label: 'Em análise', cls: 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300' },
  { value: 'planeada', label: 'Planeada', cls: 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300' },
  { value: 'feita', label: 'Feita', cls: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300' },
  { value: 'recusada', label: 'Recusada', cls: 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300' },
];

export const tipoDef = (t: string) => TIPOS.find(x => x.value === t) ?? TIPOS[0];
export const estadoDef = (e: string) => ESTADOS.find(x => x.value === e) ?? ESTADOS[0];

export const TITULO_MAX = 120;
export const DESCRICAO_MAX = 2000;

export interface Sugestao {
  id: string;
  tipo: Tipo;
  titulo: string;
  descricao: string | null;
  pagina: string | null;
  estado: Estado;
  resposta: string | null;
  autor_email: string;
  autor_nome: string | null;
  created_at: string;
  updated_at: string;
}

export interface NovaSugestao {
  tipo: Tipo;
  titulo: string;
  descricao?: string;
  /** Rota em que o utilizador estava ao enviar. */
  pagina?: string | null;
}

/* A tabela ainda não existe (migração por aplicar): mensagem em vez de erro técnico. */
const traduzir = (e: { code?: string; message: string }): Error =>
  e.code === '42P01' || e.code === 'PGRST205'
    ? new Error('As sugestões ainda não estão disponíveis (falta aplicar a migração na base de dados).')
    : new Error(e.message);

export async function criarSugestao(s: NovaSugestao): Promise<void> {
  const titulo = s.titulo.trim().slice(0, TITULO_MAX);
  if (!titulo) throw new Error('Escreve um título.');
  const { error } = await supabase.from('sugestoes').insert({
    tipo: s.tipo,
    titulo,
    descricao: s.descricao?.trim().slice(0, DESCRICAO_MAX) || null,
    pagina: s.pagina ?? null,
  });
  if (error) throw traduzir(error);
}

/* Todas as que a base de dados deixa ver: as próprias, ou todas para a gestão. */
export async function listarSugestoes(): Promise<Sugestao[]> {
  const { data, error } = await supabase.from('sugestoes').select('*').order('created_at', { ascending: false });
  if (error) throw traduzir(error);
  return (data ?? []) as Sugestao[];
}

/* Só as do utilizador (também para quem as vê todas). */
export async function listarMinhas(email: string): Promise<Sugestao[]> {
  const { data, error } = await supabase.from('sugestoes').select('*')
    .eq('autor_email', email.toLowerCase()).order('created_at', { ascending: false });
  if (error) throw traduzir(error);
  return (data ?? []) as Sugestao[];
}

export async function atualizarSugestao(id: string, patch: { estado: Estado; resposta: string | null }): Promise<void> {
  const { error } = await supabase.from('sugestoes').update(patch).eq('id', id);
  if (error) throw traduzir(error);
}

export async function eliminarSugestao(id: string): Promise<void> {
  const { error } = await supabase.from('sugestoes').delete().eq('id', id);
  if (error) throw traduzir(error);
}

export const fmtData = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' });
