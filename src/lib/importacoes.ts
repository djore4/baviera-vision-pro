import { supabase } from '@/integrations/supabase/client';

/* ── Registo de importações ───────────────────────────────────────────────────
 * Cada importação de um snapshot (control VN, control VU, angariações) fica registada
 * na base de dados, com uma cópia do que foi substituído (as últimas 10 por tabela),
 * para a desfazer. As regras de validação vivem na base de dados (migração
 * 20261030130000_importacoes); aqui só se mostram e se pede confirmação.
 * ──────────────────────────────────────────────────────────────────────────── */

export type TabelaImportacao = 'control_records' | 'control_records_vu' | 'angariacoes_vu';

export const TABELAS_IMPORTACAO: Record<TabelaImportacao, string> = {
  control_records: 'Control VN',
  control_records_vu: 'Control VU',
  angariacoes_vu: 'Angariações VU',
};

export interface Importacao {
  id: number;
  tabela: TabelaImportacao;
  origem: 'manual' | 'automatica' | 'restauro';
  por: string;
  ficheiro: string | null;
  linhas: number;
  linhas_anteriores: number;
  avisos: string[];
  forcada: boolean;
  created_at: string;
  /** Há cópia do que foi substituído (as últimas 10 por tabela). */
  temCopia: boolean;
}

export interface Validacao {
  anteriores: number;
  linhas: number;
  /** Motivos para recusar; só passa quem "importa mesmo assim". */
  bloqueios: string[];
  avisos: string[];
}

export interface Carimbo {
  tabela: TabelaImportacao;
  created_at: string;
  linhas: number;
  origem: Importacao['origem'];
}

/** A base de dados recusou o ficheiro por ser suspeito (não por erro técnico). */
export const isImportacaoSuspeita = (e: unknown) =>
  e instanceof Error && e.message.includes('IMPORTACAO_SUSPEITA:');

/** Texto de uma recusa, sem o prefixo técnico. */
export const motivoSuspeita = (e: unknown) =>
  e instanceof Error ? (e.message.split('IMPORTACAO_SUSPEITA:')[1] ?? e.message).trim() : '';

const emFalta = (e: { code?: string }) => e.code === 'PGRST202' || e.code === 'PGRST205' || e.code === '42P01';
const traduzir = (e: { code?: string; message: string }): Error =>
  emFalta(e)
    ? new Error('O registo de importações ainda não está disponível (falta aplicar a migração na base de dados).')
    : new Error(e.message);

/**
 * Compara o número de registos do ficheiro com o que existe. Devolve null se a base de
 * dados ainda não tem a validação (migração por aplicar): importa-se como antes.
 */
export async function validarImportacao(tabela: TabelaImportacao, linhas: number): Promise<Validacao | null> {
  const { data, error } = await supabase.rpc('importacao_validar', { p_tabela: tabela, p_linhas: linhas });
  if (error) {
    if (emFalta(error)) return null;
    throw traduzir(error);
  }
  return data as unknown as Validacao;
}

export async function listarImportacoes(limite = 30): Promise<Importacao[]> {
  const { data, error } = await supabase.from('importacoes').select('*')
    .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(limite);
  if (error) throw traduzir(error);
  const { data: copias } = await supabase.from('importacoes_snapshot').select('importacao_id');
  const comCopia = new Set((copias ?? []).map(c => Number(c.importacao_id)));
  return (data ?? []).map(r => ({
    ...(r as unknown as Importacao),
    id: Number(r.id),
    avisos: Array.isArray(r.avisos) ? (r.avisos as string[]) : [],
    temCopia: comCopia.has(Number(r.id)),
  }));
}

/** Volta ao estado anterior a uma importação. Devolve o nº de registos repostos. */
export async function restaurarImportacao(id: number): Promise<number> {
  const { data, error } = await supabase.rpc('restaurar_importacao', { p_importacao_id: id });
  if (error) throw traduzir(error);
  return Number(data ?? 0);
}

/** Última importação de cada tabela (visível a todos; não diz quem importou). */
export async function ultimosCarimbos(): Promise<Carimbo[]> {
  try {
    const { data, error } = await supabase.rpc('ultimas_importacoes');
    if (error || !data) return [];
    return data as unknown as Carimbo[];
  } catch {
    return [];   // o carimbo é acessório
  }
}
