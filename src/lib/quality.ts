import { supabase } from '@/integrations/supabase/client';

/* ── Qualidade — camada de acesso a dados ─────────────────────────────────────
 * Notas mensais do serviço (tab admin "Qualidade"). Uma linha por mês
 * (year, month), cada métrica é uma dimensão do gráfico de aranha.
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

export interface QualityRow extends QualityScores {
  year: number;
  month: number;
  updated_by: string | null;
  updated_at: string;
}

export const emptyScores = (): QualityScores =>
  QUALITY_METRICS.reduce((acc, m) => { acc[m.key] = 0; return acc; }, {} as QualityScores);

/* Lê as notas de um mês (null se ainda não existirem). */
export async function getQualityScores(year: number, month: number): Promise<QualityRow | null> {
  const { data, error } = await supabase
    .from('quality_scores')
    .select('*')
    .eq('year', year)
    .eq('month', month)
    .maybeSingle();
  if (error) throw error;
  return (data as QualityRow | null) ?? null;
}

/* Grava (upsert) as notas de um mês. */
export async function saveQualityScores(
  year: number,
  month: number,
  scores: QualityScores,
  updatedBy?: string | null,
): Promise<void> {
  const row = { year, month, ...scores, updated_by: updatedBy ?? null };
  const { error } = await supabase
    .from('quality_scores')
    .upsert(row, { onConflict: 'year,month' });
  if (error) throw error;
}
