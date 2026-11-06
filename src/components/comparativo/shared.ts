import type { Baseline, SellerRow, TeamStats } from '@/lib/comparativo';

/* Cores do tab: o vendedor em foco, a base de comparação e o colega escolhido. */
export const C = {
  focus: '#1C69D4',
  base: '#94A3B8',
  rival: '#F59E0B',
  good: '#16A34A',
  bad: '#DC2626',
};

export interface CompareCtx {
  sellers: SellerRow[];
  team: TeamStats;
  focus: string;
  rival: string | null;
  baseline: Baseline;
  setFocus: (resp: string) => void;
  setRival: (resp: string | null) => void;
}

export const BASE_LABEL: Record<Baseline, string> = {
  media: 'Média da equipa',
  mediana: 'Mediana da equipa',
  melhor: 'Melhor da equipa',
};

export const tooltipStyle = {
  fontSize: 11,
  background: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
};

/** Verde (melhor) → âmbar → vermelho (pior) para a nota 0–100 de uma célula. */
export function heat(score: number | null): string | undefined {
  if (score == null) return undefined;
  const hue = Math.round((score / 100) * 130);   // 0 = vermelho, 130 = verde
  return `hsl(${hue} 70% 45% / 0.22)`;
}
