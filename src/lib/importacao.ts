import { ISV_2026, type Escalao, type IsvTables, type TabelaCo2 } from '@/lib/importacao-isv-tables';

/* ── Simulador de importação de usados (origem UE) ──────────────────────────────
 * Duas partes independentes: o ISV (função da viatura) e a operação (custos,
 * IVA e margem). Tudo função pura, sem estado, para se poder testar. */

export type Combustivel = 'gasolina' | 'diesel' | 'phev' | 'eletrico';
export type Homologacao = 'WLTP' | 'NEDC';

const round2 = (v: number) => Math.round(v * 100) / 100;

/* ── Idade ───────────────────────────────────────────────────────────────────── */

/** Meses completos entre a primeira matrícula ('AAAA-MM') e `hoje`. Vazio/ inválido → null. */
export function idadeEmMeses(primeiraMatricula: string, hoje: Date = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})$/.exec(primeiraMatricula);
  if (!m) return null;
  const meses = (hoje.getFullYear() - Number(m[1])) * 12 + (hoje.getMonth() + 1 - Number(m[2]));
  return Math.max(0, meses);
}

/** Redução (0–1) do ISV por idade, segundo a tabela. Escalões "até N anos" inclusivos. */
export function reducaoPorIdade(meses: number | null, tabelas: IsvTables = ISV_2026): number {
  if (meses === null) return 0;
  const escalao = tabelas.reducaoIdade.find(r => meses <= r.ateAnos * 12);
  return escalao ? escalao.pct : 0;
}

/* ── ISV ─────────────────────────────────────────────────────────────────────── */

function escalaoPara(tabela: Escalao[], valor: number): Escalao | null {
  return tabela.find(e => valor <= e.ate) ?? null;
}

/** valor × taxa − parcela a abater, nunca negativo. */
function imposto(e: Escalao, valor: number): number {
  return Math.max(0, valor * e.taxa - e.abater);
}

export interface IsvInput {
  combustivel: Combustivel;
  homologacao: Homologacao;
  cilindradaCc: number;
  co2GKm: number;
  /** Primeira matrícula 'AAAA-MM'. */
  primeiraMatricula: string;
  /** Diesel acima do limite de partículas (aplica o agravamento). */
  dieselParticulasAcima: boolean;
  /** Valor da componente ambiental dado à mão (ex.: do Simulador da AT). Tem prioridade. */
  ambientalManual: number | null;
  /** ISV total dado à mão. Tem prioridade sobre todo o cálculo. */
  totalManual: number | null;
}

export interface IsvResultado {
  cilindrada: number;
  ambiental: number;
  /** A componente ambiental não pôde ser calculada: tabela vazia e sem valor manual. */
  ambientalEmFalta: boolean;
  reducaoIdadePct: number;
  reducaoIdade: number;
  agravamento: number;
  reducaoPhev: number;
  total: number;
  /** O total veio do valor manual. */
  manual: boolean;
}

export function calcIsv(input: IsvInput, tabelas: IsvTables = ISV_2026, hoje: Date = new Date()): IsvResultado {
  const vazio: IsvResultado = {
    cilindrada: 0, ambiental: 0, ambientalEmFalta: false, reducaoIdadePct: 0, reducaoIdade: 0,
    agravamento: 0, reducaoPhev: 0, total: 0, manual: false,
  };

  if (input.totalManual !== null) return { ...vazio, total: round2(input.totalManual), manual: true };
  if (input.combustivel === 'eletrico') return vazio;

  const escCil = escalaoPara(tabelas.cilindrada, input.cilindradaCc);
  const cilindrada = escCil && input.cilindradaCc > 0 ? imposto(escCil, input.cilindradaCc) : 0;

  // Híbridos plug-in pagam a componente ambiental como gasolina (o desconto vem à parte).
  const base = input.combustivel === 'diesel' ? 'diesel' : 'gasolina';
  const tabelaCo2 = tabelas.co2[`${base}-${input.homologacao}` as TabelaCo2];
  let ambiental = 0;
  let ambientalEmFalta = false;
  if (input.ambientalManual !== null) {
    ambiental = input.ambientalManual;
  } else if (tabelaCo2.length === 0) {
    ambientalEmFalta = true;
  } else {
    const esc = escalaoPara(tabelaCo2, input.co2GKm);
    ambiental = esc && input.co2GKm > 0 ? imposto(esc, input.co2GKm) : 0;
  }

  const subtotal = cilindrada + ambiental;
  const reducaoIdadePct = reducaoPorIdade(idadeEmMeses(input.primeiraMatricula, hoje), tabelas);
  const reducaoIdade = subtotal * reducaoIdadePct;
  const agravamento = input.combustivel === 'diesel' && input.dieselParticulasAcima ? tabelas.agravamentoParticulas : 0;
  const aposIdade = subtotal - reducaoIdade + agravamento;
  const reducaoPhev = input.combustivel === 'phev' ? aposIdade * tabelas.phevReducao : 0;

  return {
    cilindrada: round2(cilindrada),
    ambiental: round2(ambiental),
    ambientalEmFalta,
    reducaoIdadePct,
    reducaoIdade: round2(reducaoIdade),
    agravamento,
    reducaoPhev: round2(reducaoPhev),
    total: round2(aposIdade - reducaoPhev),
    manual: false,
  };
}

/* ── Operação: custos, IVA e margem ──────────────────────────────────────────── */

/** margem: revenda em regime de margem (IVA só sobre a margem; a compra não deduz IVA).
 *  normal: IVA a 23 % sobre o PVP e compra sem IVA (preço líquido). */
export type RegimeIva = 'margem' | 'normal';

export interface OperacaoInput {
  compra: number;
  transporte: number;
  legalizacao: number;
  preparacao: number;
  outros: number;
  isv: number;
  regime: RegimeIva;
  /** Taxa de IVA em percentagem (23). */
  ivaPct: number;
}

export interface Custos {
  compra: number;
  transporte: number;
  legalizacao: number;
  preparacao: number;
  outros: number;
  isv: number;
  total: number;
}

export function custosTotais(i: OperacaoInput): Custos {
  const total = i.compra + i.transporte + i.legalizacao + i.preparacao + i.outros + i.isv;
  return {
    compra: i.compra, transporte: i.transporte, legalizacao: i.legalizacao,
    preparacao: i.preparacao, outros: i.outros, isv: i.isv, total: round2(total),
  };
}

export interface AnalisePvp {
  pvp: number;
  /** IVA incluído no PVP (a entregar ao Estado). */
  iva: number;
  /** PVP sem o IVA: o que realmente fica na empresa antes de custos. */
  receitaLiquida: number;
  margemEur: number;
  /** Margem sobre o custo total (markup). null se o custo for 0. */
  margemPctCusto: number | null;
  /** Margem sobre a receita líquida. null se a receita for 0. */
  margemPctVenda: number | null;
}

/** Dado um PVP, devolve a rentabilidade. */
export function analisePvp(i: OperacaoInput, pvp: number): AnalisePvp {
  const k = i.ivaPct / 100;
  const { total } = custosTotais(i);
  // Margem: IVA só sobre (PVP − compra). Normal: IVA sobre o PVP todo.
  const iva = i.regime === 'margem'
    ? Math.max(0, pvp - i.compra) * k / (1 + k)
    : pvp * k / (1 + k);
  const receitaLiquida = pvp - iva;
  const margemEur = receitaLiquida - total;
  return {
    pvp: round2(pvp),
    iva: round2(iva),
    receitaLiquida: round2(receitaLiquida),
    margemEur: round2(margemEur),
    margemPctCusto: total > 0 ? margemEur / total : null,
    margemPctVenda: receitaLiquida > 0 ? margemEur / receitaLiquida : null,
  };
}

/** Dada uma margem alvo (fração do custo total, ex.: 0,12), devolve o PVP necessário. */
export function pvpParaMargem(i: OperacaoInput, margemAlvo: number): number {
  const k = i.ivaPct / 100;
  const { total } = custosTotais(i);
  const alvoLiquido = total * (1 + margemAlvo);
  if (i.regime === 'normal') return round2(alvoLiquido * (1 + k));
  // PVP − (PVP − compra)·k/(1+k) = alvo  →  PVP = alvo·(1+k) − compra·k
  const pvp = alvoLiquido * (1 + k) - i.compra * k;
  // Se o alvo não chega à compra, não há margem sobre que cobrar IVA: PVP = alvo.
  return round2(pvp > i.compra ? pvp : alvoLiquido);
}
