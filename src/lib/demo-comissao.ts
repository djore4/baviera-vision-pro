/* Comissão fixa de venda das demos (automatriculados), por modelo. Tabela da direção:
 *   125 €  S1, S2, X1, X2
 *   175 €  S3, S4, M1
 *   225 €  S5, X3, X4, Z4
 *   350 €  S6, S7, S8, X5, X6, X7, iX, M2, M3, M4, M5
 *   500 €  M6, M7, M8, X5 M, X6 M, X7 M, XM
 * O modelo da viatura vem da plataforma ("Série 5", "X1", "iX", "M"…) e a versão traz o detalhe
 * (p.ex. modelo "M" + versão "M3 CS Touring"; modelo "X1" + versão "iX1 20e"). */

export const COMISSAO_TABELA: { valor: number; modelos: string }[] = [
  { valor: 125, modelos: 'S1, S2, X1, X2' },
  { valor: 175, modelos: 'S3, S4, M1' },
  { valor: 225, modelos: 'S5, X3, X4, Z4' },
  { valor: 350, modelos: 'S6, S7, S8, X5, X6, X7, iX, M2, M3, M4, M5' },
  { valor: 500, modelos: 'M6, M7, M8, X5 M, X6 M, X7 M, XM' },
];

const POR_CHAVE: Record<string, number> = {
  S1: 125, S2: 125, X1: 125, X2: 125,
  S3: 175, S4: 175, M1: 175,
  S5: 225, X3: 225, X4: 225, Z4: 225,
  S6: 350, S7: 350, S8: 350, X5: 350, X6: 350, X7: 350, IX: 350, M2: 350, M3: 350, M4: 350, M5: 350,
  M6: 500, M7: 500, M8: 500, X5M: 500, X6M: 500, X7M: 500, XM: 500,
};

const limpa = (v: string | null | undefined) => (v ?? '').trim().toUpperCase().replace(/\s+/g, ' ');

/** Chave da tabela ("S5", "X3", "M3", "X5M"…) a partir do modelo e da versão, ou null se não houver. */
export function chaveComissao(modelo: string | null | undefined, versao: string | null | undefined): string | null {
  const m = limpa(modelo);
  const v = limpa(versao);
  if (!m && !v) return null;

  // Modelos M e X M identificam-se pela versão: "M3 CS Touring", "XM 50e", "X5 M60i", "X6M".
  // (M240i, M135, M440d, M35i são versões M Performance de uma série: ficam na série.)
  if (/^XM\b/.test(v) || m === 'XM') return 'XM';
  const xm = v.match(/^X([5-7]) ?M(?!\d)/) ?? (m.match(/^X([5-7]) ?M$/));
  if (xm) return `X${xm[1]}M`;
  const mm = v.match(/^M([1-8])(?!\d)/);
  if (mm) return `M${mm[1]}`;
  const mModelo = m.match(/^M([1-8])$/);
  if (mModelo) return `M${mModelo[1]}`;

  const serie = m.match(/^S[ÉE]RIE ?(\d)$/);
  if (serie) return `S${serie[1]}`;
  if (m === 'IX') return 'IX';
  if (m === 'Z4') return 'Z4';
  const x = m.match(/^I?X([1-7])$/); // iX1/iX2/iX3 são as versões elétricas do X1/X2/X3
  if (x) return `X${x[1]}`;
  return null;
}

/** Comissão fixa (€) da viatura, ou null se o modelo não consta da tabela. */
export function comissaoFixa(modelo: string | null | undefined, versao: string | null | undefined): number | null {
  const k = chaveComissao(modelo, versao);
  return k && k in POR_CHAVE ? POR_CHAVE[k] : null;
}
