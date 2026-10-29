import { supabase } from '@/integrations/supabase/client';

/* ── Logs da administração ────────────────────────────────────────────────────
 * Cada página aberta e cada sessão do browser ficam em `atividade` (migração
 * 20261030120000_atividade). O email e a hora vêm da base de dados, não do browser.
 * Registar nunca pode estorvar quem trabalha: falha em silêncio.
 * ──────────────────────────────────────────────────────────────────────────── */

export type TipoAtividade = 'sessao' | 'pagina';

export interface ResumoUtilizador {
  email: string;
  nome: string | null;
  perfil: string | null;
  ultimo_login: string | null;
  ultima_atividade: string | null;
  sessoes: number;
  paginas: number;
  pagina_top: string | null;
}

export interface EventoAtividade {
  id: number;
  email: string;
  tipo: TipoAtividade;
  pagina: string | null;
  created_at: string;
}

export async function registarAtividade(tipo: TipoAtividade, pagina: string): Promise<void> {
  try {
    await supabase.from('atividade').insert({ tipo, pagina });
  } catch { /* o registo é acessório */ }
}

/* A tabela ou a função ainda não existem (migração por aplicar): mensagem em vez de erro técnico. */
const traduzir = (e: { code?: string; message: string }): Error =>
  e.code === '42P01' || e.code === 'PGRST205' || e.code === 'PGRST202'
    ? new Error('Os logs ainda não estão disponíveis (falta aplicar a migração na base de dados).')
    : new Error(e.message);

export async function listarResumo(dias: number): Promise<ResumoUtilizador[]> {
  const { data, error } = await supabase.rpc('admin_atividade_resumo', { p_dias: dias });
  if (error) throw traduzir(error);
  return (data ?? []).map(r => ({ ...r, sessoes: Number(r.sessoes), paginas: Number(r.paginas) }));
}

export async function listarEventos(email: string, limite = 100): Promise<EventoAtividade[]> {
  const { data, error } = await supabase.from('atividade').select('*')
    .eq('email', email.toLowerCase()).order('created_at', { ascending: false }).limit(limite);
  if (error) throw traduzir(error);
  return (data ?? []) as EventoAtividade[];
}

/* Há quanto tempo: "agora", "há 5 min", "há 3 h", "há 4 dias"; depois a data. */
export function haQuanto(iso: string | null, agora = Date.now()): string {
  if (!iso) return '—';
  const min = Math.floor((agora - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  if (min < 60 * 24) return `há ${Math.floor(min / 60)} h`;
  const d = Math.floor(min / (60 * 24));
  if (d < 30) return `há ${d} ${d === 1 ? 'dia' : 'dias'}`;
  return fmtDataHora(iso);
}

export const fmtDataHora = (iso: string) =>
  new Date(iso).toLocaleString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
