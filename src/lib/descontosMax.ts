import type { Tipo } from '@/lib/demoPricing';

/* ── Descontos máximos por modelo (máx. total e acumulação mensal) ────────────
 * `sem` = com/sem incorporação de 19% de opcionais; quando só há `com`, o valor é o mesmo nos
 * dois casos. `mensal` = null → sem acumulação mensal (o máximo aplica-se logo).
 * Mostra-se na janela de preço da viatura, a quem gere preços.
 * ──────────────────────────────────────────────────────────────────────────── */

export const INCORPORACAO_OPCIONAIS = 0.19;

export interface DescMax { max: number; mensal: number | null }
export interface LinhaDescMax { modelos: string[]; com: DescMax; sem?: DescMax }
export interface GrupoDescMax { titulo: 'BEV' | 'PHEV' | 'ICE (Motor Combustão)'; linhas: LinhaDescMax[] }

const d = (max: number, mensal: number | null = null): DescMax => ({ max, mensal });

export const GRUPOS_DESC_MAX: GrupoDescMax[] = [
  {
    titulo: 'BEV',
    linhas: [
      { modelos: ['iX1', 'iX2'], com: d(0.13, 0.0216), sem: d(0.10, 0.0166) },
      { modelos: ['iX3'], com: d(0.10), sem: d(0.07) },
      { modelos: ['i4', 'iX'], com: d(0.15, 0.025) },
      { modelos: ['i5', 'i7'], com: d(0.18, 0.03) },
    ],
  },
  {
    titulo: 'PHEV',
    linhas: [
      { modelos: ['Série 2'], com: d(0.14, 0.0233), sem: d(0.11, 0.0183) },
      { modelos: ['Série 3', 'X1', 'X3'], com: d(0.16, 0.0266), sem: d(0.13, 0.0216) },
      { modelos: ['Série 5', 'Série 7', 'X5', 'XM'], com: d(0.18, 0.03) },
    ],
  },
  {
    titulo: 'ICE (Motor Combustão)',
    linhas: [
      { modelos: ['Série 1', 'Série 2', 'X1', 'X2'], com: d(0.10, 0.0166), sem: d(0.07, 0.0116) },
      { modelos: ['Série 3', 'Série 4', 'Série 5', 'X3', 'Z4'], com: d(0.12, 0.02), sem: d(0.09, 0.015) },
      { modelos: ['Série 7', 'X5', 'X7', 'M & MPA'], com: d(0.18, 0.03), sem: d(0.14, 0.0233) },
    ],
  },
];

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/* O nome do modelo começa pelo da linha, sem continuar numa letra/dígito ("iX1" não é "iX"). */
function modeloCorresponde(modelo: string, item: string): boolean {
  const m = norm(modelo); const i = norm(item);
  return m === i || (m.startsWith(i) && !/[a-z0-9]/.test(m.charAt(i.length)));
}

export interface DescMaxModelo { grupo: GrupoDescMax['titulo']; linha: LinhaDescMax }

/** Linha de desconto máximo do modelo e tipologia da viatura (BEV, PHEV = xEV sem BEV, senão ICE),
 *  ou null se o modelo não consta da tabela. Os M contam na linha "M & MPA" do ICE. */
export function descontoMaxPara(modelo: string | null | undefined, tipo: Pick<Tipo, 'bev' | 'xev' | 'm'>): DescMaxModelo | null {
  const nome = (modelo ?? '').trim();
  if (!nome) return null;
  const titulo: GrupoDescMax['titulo'] = tipo.bev ? 'BEV' : tipo.xev ? 'PHEV' : 'ICE (Motor Combustão)';
  const grupo = GRUPOS_DESC_MAX.find(g => g.titulo === titulo)!;
  const linha = grupo.linhas.find(l => l.modelos.some(it => modeloCorresponde(nome, it)
    || (it === 'M & MPA' && (tipo.m || /^m\d/.test(norm(nome))))));
  return linha ? { grupo: titulo, linha } : null;
}

/** Máximo aplicável: com ou sem 19% de opcionais (penetração OPC/PVB). */
export function descMaxAplicavel(linha: LinhaDescMax, penetracao: number): { valor: DescMax; comIncorporacao: boolean } {
  const com = penetracao >= INCORPORACAO_OPCIONAIS;
  return { valor: com || !linha.sem ? linha.com : linha.sem, comIncorporacao: com };
}

/** Acumulado ao fim de `periodos` períodos de 30 dias: mensal × períodos, limitado ao máximo
 *  (sem acumulação mensal, o máximo aplica-se logo). */
export const descMaxAcumulado = (v: DescMax, periodos: number): number =>
  v.mensal === null ? v.max : Math.min(v.max, v.mensal * Math.max(0, periodos));
