import { supabase } from '@/integrations/supabase/client';

/* ── Qualidade — camada de acesso a dados ─────────────────────────────────────
 * Notas mensais do serviço (tab admin "Qualidade"), agora por vendedor. Uma
 * linha por (year, month, vendedor); cada métrica é uma dimensão do gráfico de
 * aranha. Sem vendedor selecionado mostra-se a média da equipa.
 * Tal como lavagem/crm, a tabela não consta dos tipos gerados do Supabase, por
 * isso o nome é passado como string.
 * ──────────────────────────────────────────────────────────────────────────── */

/* Dimensões do gráfico (ordem = ordem à volta da teia). */
export const QUALITY_METRICS = [
  { key: 'retails', label: 'Retails' },
  { key: 'contratos', label: 'Contratos' },
  { key: 'atitude', label: 'Atitude' },
  { key: 'atendimento', label: 'Atendimento' },
  { key: 'assiduidade', label: 'Assiduidade' },
  { key: 'equipa', label: 'Equipa' },
  { key: 'nps100', label: 'NPS100' },
] as const;

export type QualityMetricKey = typeof QUALITY_METRICS[number]['key'];

export type QualityScores = Record<QualityMetricKey, number>;

/* Escala fixa das notas (ambos os eixos do gráfico vão de 0 a MAX). */
export const QUALITY_MIN = 0;
export const QUALITY_MAX = 10;

export interface QualityRow extends QualityScores {
  year: number;
  month: number;
  vendedor: string;
  updated_by: string | null;
  updated_at: string;
}

export const emptyScores = (): QualityScores =>
  QUALITY_METRICS.reduce((acc, m) => { acc[m.key] = 0; return acc; }, {} as QualityScores);

/* Média das notas de várias linhas, métrica a métrica (0 se não houver linhas). */
export function averageScores(rows: QualityRow[]): QualityScores {
  const avg = emptyScores();
  if (rows.length === 0) return avg;
  QUALITY_METRICS.forEach(m => {
    avg[m.key] = rows.reduce((s, r) => s + (Number(r[m.key]) || 0), 0) / rows.length;
  });
  return avg;
}

/* Lê as notas de todos os vendedores de um mês. */
export async function getMonthScores(year: number, month: number): Promise<QualityRow[]> {
  const { data, error } = await supabase
    .from('quality_scores')
    .select('*')
    .eq('year', year)
    .eq('month', month);
  if (error) throw error;
  return ((data as QualityRow[] | null) ?? []).filter(r => (r.vendedor ?? '') !== '');
}

/* Grava (upsert) as notas de um vendedor num mês. */
export async function saveVendedorScores(
  year: number,
  month: number,
  vendedor: string,
  scores: QualityScores,
  updatedBy?: string | null,
): Promise<void> {
  const row = { year, month, vendedor, ...scores, updated_by: updatedBy ?? null };
  const { error } = await supabase
    .from('quality_scores')
    .upsert(row, { onConflict: 'year,month,vendedor' });
  if (error) throw error;
}

/* Apaga as notas de um vendedor num mês (repor a zero / remover do cálculo). */
export async function deleteVendedorScores(
  year: number,
  month: number,
  vendedor: string,
): Promise<void> {
  const { error } = await supabase
    .from('quality_scores')
    .delete()
    .eq('year', year)
    .eq('month', month)
    .eq('vendedor', vendedor);
  if (error) throw error;
}
