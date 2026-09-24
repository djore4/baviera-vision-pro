/* ── Pricing dos demonstradores (racional do Excel "PARQUE BMW") ──────────────
 * Replica as fórmulas da folha PREÇOS, coluna a coluna:
 *   PVP      = (PVB + OPC + BSI + ECO + LEG/TR + ISV) × 1,23
 *   %        = OPC / PVB                                  (penetração opcionais)
 *   DSC €    = (PVB + OPC) × (MGB + ESF + PAC + DEM + SUP)
 *   IVA      = (PVB + OPC − DSC € + ECO + LEG/TR + ISV) × 0,23
 *   P Custo  = (PVB + OPC − DSC € + ECO + LEG/TR + ISV) + IVA   (sem BSI)
 *   Margem   = PVP DESC − P Custo + DEP
 *   PVP s/IVA= PVP DESC / 1,23 se xEV/BEV (IVA dedutível); senão PVP DESC
 * ──────────────────────────────────────────────────────────────────────────── */

export const TAXA_IVA = 0.23;

export interface PricingInputs {
  pvb: number; opc: number; bsi: number; eco: number; leg: number; isv: number;
  mgb: number; esf: number; pac: number; dem: number; sup: number;
  pvp_desc: number; depreciacoes: number;
}

export interface Pricing {
  pvp: number;
  penetracao: number;
  desc_perc: number;
  desc_eur: number;
  iva: number;
  p_custo: number;
  margem: number;
  margem_perc: number;
  pvp_desc: number;
  pvp_sem_iva: number;
  iva_dedutivel: boolean;
}

export interface Tipo { ice: boolean; xev: boolean; bev: boolean; qor: boolean; m: boolean }

/** Flags de tipologia (ICE / xEV / BEV / QoR / M) a partir da lista guardada. */
export function tipoFlags(tipologia: string[]): Tipo {
  const t = new Set(tipologia.map(s => s.trim().toLowerCase()));
  const bev = t.has('bev');
  return {
    bev,
    // Um BEV também é xEV (no Excel as duas colunas vêm marcadas).
    xev: bev || t.has('xev') || t.has('phev'),
    ice: t.has('ice'),
    qor: t.has('qor'),
    m: t.has('m'),
  };
}

const n = (v: number | null | undefined) => (typeof v === 'number' && isFinite(v) ? v : 0);

export function calcPricing(i: PricingInputs, tipo: Pick<Tipo, 'xev' | 'bev'>): Pricing {
  const pvb = n(i.pvb); const opc = n(i.opc);
  const pvp = (pvb + opc + n(i.bsi) + n(i.eco) + n(i.leg) + n(i.isv)) * (1 + TAXA_IVA);
  const descPerc = n(i.mgb) + n(i.esf) + n(i.pac) + n(i.dem) + n(i.sup);
  const descEur = (pvb + opc) * descPerc;
  const baseCusto = pvb + opc - descEur + n(i.eco) + n(i.leg) + n(i.isv);
  const iva = baseCusto * TAXA_IVA;
  const pCusto = baseCusto + iva;
  const pvpDesc = n(i.pvp_desc);
  const margem = pvpDesc - pCusto + n(i.depreciacoes);
  const ivaDedutivel = tipo.xev || tipo.bev;
  return {
    pvp,
    penetracao: pvb > 0 ? opc / pvb : 0,
    desc_perc: descPerc,
    desc_eur: descEur,
    iva,
    p_custo: pCusto,
    margem,
    margem_perc: pvb + opc > 0 ? margem / (pvb + opc) : 0,
    pvp_desc: pvpDesc,
    pvp_sem_iva: ivaDedutivel ? pvpDesc / (1 + TAXA_IVA) : pvpDesc,
    iva_dedutivel: ivaDedutivel,
  };
}
