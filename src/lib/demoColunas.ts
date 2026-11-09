import type { PricingInputs } from '@/lib/demoPricing';

/* ── Colunas do tab Demos, por função ─────────────────────────────────────────
 * A visibilidade de cada coluna de preço atribui-se por função na matriz de
 * permissões (Utilizadores → Permissões), com a chave 'demos:col:<coluna>'.
 * As colunas de identificação (local, modelo, matrícula…) são sempre visíveis.
 *
 * A base de dados (demos_viaturas) só envia os valores de que as colunas
 * atribuídas precisam, por isso as dependências abaixo TÊM de coincidir com
 * demos_dep_colunas() (migração 20261109140000). Uma coluna calculada (ex.: Margem)
 * obriga a ter as colunas de que depende: sem elas, os valores chegariam ao browser
 * na mesma. A matriz impõe-no (toggleDemoCol).
 * ──────────────────────────────────────────────────────────────────────────── */

export type DemoColKey =
  | 'pvb' | 'opc' | 'bsi' | 'pen' | 'eco' | 'leg' | 'isv' | 'pvp'
  | 'mgb' | 'esf' | 'pac' | 'dem' | 'sup' | 'dsc'
  | 'p_custo' | 'dep' | 'margem'
  | 'pvp_desc' | 'pvp_siva';

export type DemoColGroup = 'preco' | 'desc' | 'custo' | 'venda';

export interface DemoColDef {
  key: DemoColKey;
  label: string;
  hint: string;
  group: DemoColGroup;
  /** Valores de `inputs` de que a coluna precisa. */
  deps: (keyof PricingInputs)[];
}

const BASE: (keyof PricingInputs)[] = ['pvb', 'opc'];
const DESCS: (keyof PricingInputs)[] = ['mgb', 'esf', 'pac', 'dem', 'sup'];
const CUSTO: (keyof PricingInputs)[] = [...BASE, ...DESCS, 'eco', 'leg', 'isv'];

export const DEMO_COL_GROUPS: { key: DemoColGroup; label: string }[] = [
  { key: 'preco', label: 'Preços' },
  { key: 'desc', label: 'Descontos / apoios' },
  { key: 'custo', label: 'Custo e margem' },
  { key: 'venda', label: 'Venda' },
];

export const DEMO_COL_DEFS: DemoColDef[] = [
  { key: 'pvb', label: 'PVB', hint: 'Preço base', group: 'preco', deps: ['pvb'] },
  { key: 'opc', label: 'OPC', hint: 'Opcionais', group: 'preco', deps: ['opc'] },
  { key: 'bsi', label: 'BSI', hint: 'BSI', group: 'preco', deps: ['bsi'] },
  { key: 'pen', label: '%', hint: 'Penetração de opcionais (OPC / PVB)', group: 'preco', deps: BASE },
  { key: 'eco', label: 'ECO', hint: 'Ecovalor', group: 'preco', deps: ['eco'] },
  { key: 'leg', label: 'LEG/TR', hint: 'Legalização / transporte', group: 'preco', deps: ['leg'] },
  { key: 'isv', label: 'ISV', hint: 'ISV', group: 'preco', deps: ['isv'] },
  { key: 'pvp', label: 'PVP', hint: 'Preço de tabela com IVA', group: 'preco', deps: [...BASE, 'bsi', 'eco', 'leg', 'isv'] },

  { key: 'mgb', label: 'MGB', hint: 'Margem fixa', group: 'desc', deps: ['mgb'] },
  { key: 'esf', label: 'ESF', hint: 'Margem variável', group: 'desc', deps: ['esf'] },
  { key: 'pac', label: 'PAC', hint: 'PAC', group: 'desc', deps: ['pac'] },
  { key: 'dem', label: 'DEM', hint: 'Apoio demonstração', group: 'desc', deps: ['dem'] },
  { key: 'sup', label: 'SUP', hint: 'Apoio suplementar', group: 'desc', deps: ['sup'] },
  { key: 'dsc', label: 'DSC €', hint: 'Desconto total em euros', group: 'desc', deps: [...BASE, ...DESCS] },

  { key: 'p_custo', label: 'P Custo', hint: 'Preço de custo', group: 'custo', deps: CUSTO },
  { key: 'dep', label: 'DEP', hint: 'Depreciações', group: 'custo', deps: ['depreciacoes'] },
  { key: 'margem', label: 'Margem', hint: 'PVP Desc − P Custo + DEP', group: 'custo', deps: [...CUSTO, 'pvp_desc', 'depreciacoes'] },

  { key: 'pvp_desc', label: 'PVP Desc', hint: 'Preço de venda com IVA', group: 'venda', deps: ['pvp_desc'] },
  { key: 'pvp_siva', label: 'PVP s/IVA', hint: 'Preço de venda sem IVA', group: 'venda', deps: ['pvp_desc'] },
];

export const demoColPerm = (key: DemoColKey | string) => `demos:col:${key}`;
export const DEMO_COL_PERMS: string[] = DEMO_COL_DEFS.map(c => demoColPerm(c.key));

/* Antes de existir esta parametrização (migração por aplicar): quem não é administrador
 * via os preços e a venda, sem descontos, custo nem margem. */
export const LEGACY_DEMO_COLS = new Set<string>(
  DEMO_COL_DEFS.filter(c => c.group === 'preco' || c.group === 'venda').map(c => c.key),
);

/* Valor de `inputs` → coluna que o mostra (para impor as dependências). */
const INPUT_COL: Record<keyof PricingInputs, DemoColKey> = {
  pvb: 'pvb', opc: 'opc', bsi: 'bsi', eco: 'eco', leg: 'leg', isv: 'isv',
  mgb: 'mgb', esf: 'esf', pac: 'pac', dem: 'dem', sup: 'sup',
  pvp_desc: 'pvp_desc', depreciacoes: 'dep',
};

const DEF = new Map(DEMO_COL_DEFS.map(c => [c.key, c]));

/** Colunas de que `key` depende (sem ela própria). */
export function demoColRequires(key: DemoColKey): DemoColKey[] {
  const def = DEF.get(key);
  return def ? [...new Set(def.deps.map(d => INPUT_COL[d]))].filter(k => k !== key) : [];
}

/** Liga/desliga uma coluna mantendo a coerência: ligar traz as colunas de que depende;
 *  desligar leva consigo as que dependem dela. */
export function toggleDemoCol(granted: ReadonlySet<DemoColKey>, key: DemoColKey, on: boolean): Set<DemoColKey> {
  const next = new Set(granted);
  if (on) {
    next.add(key);
    demoColRequires(key).forEach(k => next.add(k));
  } else {
    next.delete(key);
    DEMO_COL_DEFS.forEach(c => { if (demoColRequires(c.key).includes(key)) next.delete(c.key); });
  }
  return next;
}

/** Normaliza um conjunto qualquer (p. ex. vindo de dados antigos) para um conjunto coerente. */
export function coherentDemoCols(granted: Iterable<DemoColKey>): Set<DemoColKey> {
  const out = new Set<DemoColKey>();
  for (const k of granted) { out.add(k); demoColRequires(k).forEach(r => out.add(r)); }
  return out;
}

/* Valores que a janela de preço edita (os 13 de `inputs`; a base de dados recusa outros). */
export const PRICE_FIELDS: (keyof PricingInputs)[] = [
  'pvb', 'opc', 'bsi', 'eco', 'leg', 'isv', 'mgb', 'esf', 'pac', 'dem', 'sup', 'depreciacoes', 'pvp_desc',
];
