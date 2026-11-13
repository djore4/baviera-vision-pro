import type { ControlRecord, ObjetivoResp } from '@/types/data';
import { isRetailType } from '@/lib/excel-parser';
import type { QualityRow } from '@/lib/quality';
import { QUALITY_METRICS } from '@/lib/quality';

/* ── Comparativo de vendedores — cálculo (puro, testável) ─────────────────────
 * Tudo o que o tab "Comparativo" mostra sai daqui: um conjunto de KPIs por
 * vendedor no período, com a mesma regra de contagem dos restantes tabs
 * (Produção: negócios por data de negócio; Performance: retails por data 298).
 * ──────────────────────────────────────────────────────────────────────────── */

const DAY = 1000 * 60 * 60 * 24;
/** Negócio fechado = entrou em carteira ou além. */
export const CLOSED = new Set(['Carteira', 'Matricula', 'Retail']);
/** Carteira por entregar. */
export const OPEN = new Set(['Carteira', 'Matricula']);
/** Funil ativo (oportunidades ainda não fechadas). */
export const FUNIL = new Set(['Quente', 'Morno', 'Frio']);
/** Abaixo disto, uma taxa assenta em pouca amostra e é mostrada com aviso. */
export const MIN_SAMPLE = 5;

export type Better = 'high' | 'low' | 'neutral';
export type KpiGroup = 'volume' | 'mix' | 'ritmo' | 'carteira' | 'qualidade';
export type KpiFmt = 'int' | 'pct' | 'ratio' | 'days' | 'score';

export interface KpiDef {
  key: string;
  label: string;
  short: string;
  group: KpiGroup;
  fmt: KpiFmt;
  better: Better;
  hint: string;
  /** Taxa: assenta numa amostra (n) e a base da equipa é o valor agregado. */
  rate?: boolean;
  /** Entra no radar (precisa de sentido "melhor/pior"). */
  radar?: boolean;
}

export const GROUPS: { key: KpiGroup; label: string }[] = [
  { key: 'volume', label: 'Volume' },
  { key: 'mix', label: 'Mix de negócio' },
  { key: 'ritmo', label: 'Ritmo' },
  { key: 'carteira', label: 'Carteira e funil' },
  { key: 'qualidade', label: 'Qualidade' },
];

export const KPIS: KpiDef[] = [
  { key: 'neg', label: 'Negócios fechados', short: 'Negócios', group: 'volume', fmt: 'int', better: 'high', radar: true, hint: 'Negócios fechados no período (data de negócio).' },
  { key: 'ret', label: 'Retails entregues', short: 'Retails', group: 'volume', fmt: 'int', better: 'high', radar: true, hint: 'Viaturas entregues no período (data de retail).' },
  { key: 'ating', label: 'Atingimento do objetivo', short: 'Objetivo', group: 'volume', fmt: 'pct', better: 'high', rate: true, radar: true, hint: 'Negócios ÷ objetivo individual dos meses do período (tab Objetivos).' },
  { key: 'r', label: 'R (negócios ÷ retails)', short: 'R', group: 'ritmo', fmt: 'ratio', better: 'neutral', rate: true, hint: 'R>1 a carteira cresce; R<1 queima.' },
  { key: 'leadMed', label: 'Lead time (mediana)', short: 'Lead time', group: 'ritmo', fmt: 'days', better: 'low', rate: true, radar: true, hint: 'Dias entre negócio e retail, sobre os retails do período. Menos é melhor.' },
  { key: 'rapidos', label: 'Retails em < 60 dias', short: '< 60 d', group: 'ritmo', fmt: 'pct', better: 'high', rate: true, hint: '% dos retails entregues até 60 dias após o negócio.' },
  { key: 'bevPct', label: '% BEV', short: '% BEV', group: 'mix', fmt: 'pct', better: 'high', rate: true, radar: true, hint: '% de elétricos puros nos negócios do período.' },
  { key: 'xevPct', label: '% xEV (eletrificados)', short: '% xEV', group: 'mix', fmt: 'pct', better: 'high', rate: true, hint: '% de eletrificados (xEV) nos negócios do período.' },
  { key: 'qorPct', label: '% QoR', short: '% QoR', group: 'mix', fmt: 'pct', better: 'high', rate: true, radar: true, hint: '% de QoR nos negócios do período.' },
  { key: 'mPct', label: '% M Performance', short: '% M', group: 'mix', fmt: 'pct', better: 'high', rate: true, hint: '% de M nos negócios do período.' },
  { key: 'fsPct', label: '% BMW Financial Services', short: '% FS', group: 'mix', fmt: 'pct', better: 'high', rate: true, radar: true, hint: '% dos negócios com financiamento BMW FS.' },
  { key: 'retomaPct', label: '% Retomas', short: '% Retoma', group: 'mix', fmt: 'pct', better: 'high', rate: true, radar: true, hint: 'Retails com retoma ÷ retails do período.' },
  { key: 'open', label: 'Carteira em aberto', short: 'Carteira', group: 'carteira', fmt: 'int', better: 'neutral', hint: 'Carteira + Matrícula por entregar (estado atual, independente do período).' },
  { key: 'age', label: 'Idade da carteira', short: 'Idade', group: 'carteira', fmt: 'days', better: 'low', rate: true, hint: 'Idade média da carteira em aberto (dias desde o negócio). Menos é melhor.' },
  { key: 'funil', label: 'Funil ativo', short: 'Funil', group: 'carteira', fmt: 'int', better: 'high', hint: 'Oportunidades Quente + Morno + Frio (estado atual).' },
  { key: 'quente', label: 'Funil quente', short: 'Quente', group: 'carteira', fmt: 'int', better: 'high', hint: 'Oportunidades "Quente" (estado atual).' },
  { key: 'qualidade', label: 'Qualidade do serviço', short: 'Qualidade', group: 'qualidade', fmt: 'score', better: 'high', radar: true, hint: 'Soma das notas de qualidade do mês mais recente lançado (máx. 60).' },
];

export const KPI_BY_KEY: Record<string, KpiDef> = Object.fromEntries(KPIS.map(k => [k.key, k]));

export type KpiValues = Record<string, number | null>;
export type MonthAgg = { neg: number; ret: number; bev: number; qor: number; fs: number; retoma: number };

export interface SellerRow {
  resp: string;
  values: KpiValues;
  /** Amostra (denominador) de cada taxa, para avisar quando é pequena. */
  n: Record<string, number>;
  /** Série mensal (AAAAMM → contagens) para a evolução. */
  monthly: Record<number, MonthAgg>;
  /** Modelos / tipos / métodos de pagamento dos negócios do período. */
  models: Record<string, number>;
  types: Record<string, number>;
  fin: Record<string, number>;
}

export interface TeamStats {
  /** Taxas: valor agregado da equipa; contagens: média por vendedor. */
  pooled: KpiValues;
  median: KpiValues;
  best: KpiValues;
  monthly: Record<number, MonthAgg>;
  /** Nº de vendedores ativos (para a média mensal por vendedor). */
  size: number;
}

export interface PeriodFilterLike { years: number[]; quarters: number[]; months: number[] }

/** Pertence ao período selecionado (anos / trimestres / meses) pela data indicada. */
export function makeInPeriod(filter: PeriodFilterLike) {
  return (d: Date | null): boolean => {
    if (!d) return false;
    const y = d.getFullYear(), m = d.getMonth() + 1;
    if (filter.months.length > 0) return filter.months.some(fm => Math.floor(fm / 100) === y && fm % 100 === m);
    if (filter.quarters.length > 0) return filter.years.includes(y) && filter.quarters.includes(Math.ceil(m / 3));
    if (filter.years.length > 0) return filter.years.includes(y);
    return true;
  };
}

export const monthKey = (d: Date) => d.getFullYear() * 100 + (d.getMonth() + 1);
const PT_MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const monthLabel = (k: number) => `${PT_MONTHS[(k % 100) - 1]}/${String(Math.floor(k / 100)).slice(2)}`;

const pct = (n: number, d: number): number | null => (d ? (n / d) * 100 : null);

export function median(arr: number[]): number | null {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
const mean = (arr: number[]): number | null => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null);

/** Objetivo (negócios) do vendedor nos meses do período. */
export function objetivoDe(resp: string, objetivos: ObjetivoResp[], filter: PeriodFilterLike): number {
  let total = 0;
  for (const o of objetivos) {
    if (o.resp !== resp) continue;
    const [oy, om] = o.mes.split('/').map(Number);
    if (!oy || !om) continue;
    if (filter.months.length > 0) {
      if (!filter.months.some(fm => Math.floor(fm / 100) === oy && fm % 100 === om)) continue;
    } else if (filter.quarters.length > 0) {
      if (!filter.years.includes(oy) || !filter.quarters.includes(Math.ceil(om / 3))) continue;
    } else if (filter.years.length > 0) {
      if (!filter.years.includes(oy)) continue;
    }
    total += o.objetivo;
  }
  return total;
}

/** Nota total de qualidade (soma das métricas) por vendedor. */
export function qualityTotals(rows: QualityRow[] | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  (rows ?? []).forEach(r => {
    out[r.vendedor] = QUALITY_METRICS.reduce((s, m) => s + (Number(r[m.key]) || 0), 0);
  });
  return out;
}
export interface ComparativoInput {
  control: ControlRecord[];
  objetivos: ObjetivoResp[];
  filter: PeriodFilterLike;
  quality?: Record<string, number>;
  now?: Date;
}

export interface ComparativoResult {
  sellers: SellerRow[];
  team: TeamStats;
}

/** Calcula os KPIs de cada vendedor ativo no período e as bases de comparação da equipa. */
export function computeComparativo({ control, objetivos, filter, quality = {}, now = new Date() }: ComparativoInput): ComparativoResult {
  const inPeriod = makeInPeriod(filter);
  const vehicles = control.filter(r => isRetailType(r.type) && r.resp);

  type Acc = {
    neg: number; ret: number; bev: number; xev: number; qor: number; m: number; fs: number;
    retoma: number; leads: number[]; open: number; ageSum: number; ageN: number; funil: number; quente: number;
    monthly: Record<number, MonthAgg>; models: Record<string, number>; types: Record<string, number>; fin: Record<string, number>;
  };
  const acc: Record<string, Acc> = {};
  const get = (resp: string): Acc => (acc[resp] ??= {
    neg: 0, ret: 0, bev: 0, xev: 0, qor: 0, m: 0, fs: 0, retoma: 0, leads: [], open: 0, ageSum: 0, ageN: 0, funil: 0, quente: 0,
    monthly: {}, models: {}, types: {}, fin: {},
  });
  const mo = (a: Acc, k: number) => (a.monthly[k] ??= { neg: 0, ret: 0, bev: 0, qor: 0, fs: 0, retoma: 0 });

  for (const r of vehicles) {
    const a = get(r.resp);
    if (CLOSED.has(r.status) && r.neg && inPeriod(r.neg)) {
      a.neg++;
      const bev = r.bev === 1, qor = r.qor === 1, fs = r.fin === 'FS';
      if (bev) a.bev++;
      if (r.xev === 1) a.xev++;
      if (qor) a.qor++;
      if (r.mPerf === 1) a.m++;
      if (fs) a.fs++;
      const m = mo(a, monthKey(r.neg));
      m.neg++; if (bev) m.bev++; if (qor) m.qor++; if (fs) m.fs++;
      if (r.model) a.models[r.model] = (a.models[r.model] ?? 0) + 1;
      a.types[r.type] = (a.types[r.type] ?? 0) + 1;
      const f = r.fin || 'N/A';
      a.fin[f] = (a.fin[f] ?? 0) + 1;
    }
    if (r.status === 'Retail' && r.date298 && inPeriod(r.date298)) {
      a.ret++;
      const m = mo(a, monthKey(r.date298));
      m.ret++;
      if (r.ret === 1) { a.retoma++; m.retoma++; }
      if (r.neg) {
        const d = Math.round((r.date298.getTime() - r.neg.getTime()) / DAY);
        if (d >= 0) a.leads.push(d);
      }
    }
    if (OPEN.has(r.status)) {
      a.open++;
      if (r.neg) { a.ageSum += Math.round((now.getTime() - r.neg.getTime()) / DAY); a.ageN++; }
    }
    if (FUNIL.has(r.status)) { a.funil++; if (r.status === 'Quente') a.quente++; }
  }

  const sellers: SellerRow[] = Object.entries(acc)
    // Só quem teve atividade no período: ex-vendedores não puxam as médias para baixo.
    .filter(([, a]) => a.neg + a.ret > 0)
    .map(([resp, a]) => {
      const obj = objetivoDe(resp, objetivos, filter);
      const rapidos = a.leads.filter(d => d < 60).length;
      const values: KpiValues = {
        neg: a.neg,
        ret: a.ret,
        ating: obj > 0 ? (a.neg / obj) * 100 : null,
        r: a.ret ? a.neg / a.ret : null,
        leadMed: median(a.leads),
        rapidos: pct(rapidos, a.leads.length),
        bevPct: pct(a.bev, a.neg),
        xevPct: pct(a.xev, a.neg),
        qorPct: pct(a.qor, a.neg),
        mPct: pct(a.m, a.neg),
        fsPct: pct(a.fs, a.neg),
        retomaPct: pct(a.retoma, a.ret),
        open: a.open,
        age: a.ageN ? a.ageSum / a.ageN : null,
        funil: a.funil,
        quente: a.quente,
        qualidade: quality[resp] ?? null,
      };
      const n: Record<string, number> = {
        ating: obj, r: a.ret, leadMed: a.leads.length, rapidos: a.leads.length,
        bevPct: a.neg, xevPct: a.neg, qorPct: a.neg, mPct: a.neg, fsPct: a.neg, retomaPct: a.ret, age: a.ageN,
      };
      return { resp, values, n, monthly: a.monthly, models: a.models, types: a.types, fin: a.fin };
    })
    .sort((x, y) => (y.values.neg ?? 0) - (x.values.neg ?? 0) || x.resp.localeCompare(y.resp, 'pt'));

  return { sellers, team: teamStats(sellers, objetivos, filter) };
}

/** Bases de comparação da equipa: agregado/média, mediana e melhor. */
export function teamStats(sellers: SellerRow[], objetivos: ObjetivoResp[], filter: PeriodFilterLike): TeamStats {
  const sumN = (key: string) => sellers.reduce((t, s) => t + (s.n[key] ?? 0), 0);
  /** Nº de ocorrências implícitas numa taxa (valor% × amostra). */
  const hits = (key: string) => sellers.reduce((t, s) => t + Math.round(((s.values[key] ?? 0) / 100) * (s.n[key] ?? 0)), 0);
  const totNeg = sellers.reduce((t, s) => t + (s.values.neg ?? 0), 0);
  const totRet = sellers.reduce((t, s) => t + (s.values.ret ?? 0), 0);
  let totObj = 0, negComObj = 0;
  sellers.forEach(s => {
    const o = objetivoDe(s.resp, objetivos, filter);
    if (o > 0) { totObj += o; negComObj += s.values.neg ?? 0; }
  });

  const pooled: KpiValues = {};
  const medianV: KpiValues = {};
  const bestV: KpiValues = {};
  for (const k of KPIS) {
    const vals = sellers.map(s => s.values[k.key]).filter((v): v is number => v != null);
    pooled[k.key] = mean(vals);
    medianV[k.key] = median(vals);
    bestV[k.key] = vals.length ? (k.better === 'low' ? Math.min(...vals) : Math.max(...vals)) : null;
  }
  // Taxas: valor agregado da equipa (ponderado pelo volume), não a média das médias.
  pooled.r = totRet ? totNeg / totRet : null;
  pooled.ating = totObj > 0 ? (negComObj / totObj) * 100 : null;
  for (const key of ['bevPct', 'xevPct', 'qorPct', 'mPct', 'fsPct', 'retomaPct', 'rapidos']) {
    pooled[key] = pct(hits(key), sumN(key));
  }

  const monthly: Record<number, MonthAgg> = {};
  sellers.forEach(s => Object.entries(s.monthly).forEach(([k, v]) => {
    const m = (monthly[Number(k)] ??= { neg: 0, ret: 0, bev: 0, qor: 0, fs: 0, retoma: 0 });
    m.neg += v.neg; m.ret += v.ret; m.bev += v.bev; m.qor += v.qor; m.fs += v.fs; m.retoma += v.retoma;
  }));
  return { pooled, median: medianV, best: bestV, monthly, size: sellers.length };
}

/* ── Posição relativa ─────────────────────────────────────────────────────── */

export interface Standing {
  /** 1 = melhor. null nos KPIs sem sentido (neutros) ou sem valor. */
  rank: number | null;
  of: number;
  /** 0–100: 100 = melhor da equipa, 0 = pior (escala mín–máx; 50 se todos iguais). */
  score: number | null;
  /** 0–100: % de colegas que ficam atrás. */
  percentile: number | null;
}

/** Posição de um valor entre os pares (respeita o sentido do KPI). */
export function standing(def: KpiDef, value: number | null, peers: (number | null)[]): Standing {
  const vals = peers.filter((v): v is number => v != null);
  if (value == null || vals.length === 0) return { rank: null, of: vals.length, score: null, percentile: null };
  const low = def.better === 'low';
  const ahead = vals.filter(v => (low ? v < value : v > value)).length;
  const behind = vals.filter(v => (low ? v > value : v < value)).length;
  const min = Math.min(...vals), max = Math.max(...vals);
  const raw = max === min ? 50 : ((value - min) / (max - min)) * 100;
  const neutral = def.better === 'neutral';
  return {
    rank: neutral ? null : ahead + 1,
    of: vals.length,
    score: neutral ? null : Math.round(low ? 100 - raw : raw),
    percentile: neutral ? null : vals.length > 1 ? Math.round((behind / (vals.length - 1)) * 100) : 100,
  };
}

/** Base de comparação escolhida pelo utilizador. */
export type Baseline = 'media' | 'mediana' | 'melhor';
export const BASELINES: { key: Baseline; label: string }[] = [
  { key: 'media', label: 'Média' },
  { key: 'mediana', label: 'Mediana' },
  { key: 'melhor', label: 'Melhor' },
];

export function baselineValue(team: TeamStats, key: string, base: Baseline): number | null {
  if (base === 'melhor') return team.best[key] ?? null;
  if (base === 'mediana') return team.median[key] ?? null;
  return team.pooled[key] ?? null;
}

/** Diferença (valor − referência) e se é favorável, segundo o sentido do KPI. */
export function delta(def: KpiDef, value: number | null, ref: number | null): { diff: number; good: boolean | null } | null {
  if (value == null || ref == null) return null;
  const diff = value - ref;
  const good = def.better === 'neutral' || Math.abs(diff) < 1e-9 ? null : (def.better === 'low' ? diff < 0 : diff > 0);
  return { diff, good };
}

export function formatKpi(def: KpiDef, v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return '—';
  switch (def.fmt) {
    case 'int': return String(Math.round(v));
    case 'pct': return `${Math.round(v)}%`;
    case 'ratio': return v.toFixed(2);
    case 'days': return `${Math.round(v)} d`;
    case 'score': return v.toFixed(1);
  }
}

export function formatDelta(def: KpiDef, diff: number): string {
  const sign = diff > 0 ? '+' : diff < 0 ? '−' : '±';
  const a = Math.abs(diff);
  switch (def.fmt) {
    case 'int': return `${sign}${a % 1 && a < 10 ? a.toFixed(1) : Math.round(a)}`;
    case 'pct': return `${sign}${Math.round(a)} pp`;
    case 'ratio': return `${sign}${a.toFixed(2)}`;
    case 'days': return `${sign}${Math.round(a)} d`;
    case 'score': return `${sign}${a.toFixed(1)}`;
  }
}

/** Forças e pontos a melhorar: os KPIs com melhor/pior posição relativa (só os com sentido). */
export function insights(sellers: SellerRow[], resp: string, take = 3) {
  const me = sellers.find(s => s.resp === resp);
  if (!me) return { strengths: [], weaknesses: [] };
  const rows = KPIS.filter(k => k.better !== 'neutral').map(def => ({
    def,
    value: me.values[def.key],
    st: standing(def, me.values[def.key], sellers.map(s => s.values[def.key])),
  })).filter(r => r.st.score != null && r.st.of >= 3);
  const sorted = [...rows].sort((a, b) => (b.st.score ?? 0) - (a.st.score ?? 0));
  return {
    strengths: sorted.slice(0, take).filter(r => (r.st.score ?? 0) >= 50),
    weaknesses: sorted.slice(-take).reverse().filter(r => (r.st.score ?? 100) < 50),
  };
}

/** Confronto direto: em quantos KPIs cada um ganha. */
export function headToHead(a: SellerRow, b: SellerRow) {
  const lines = KPIS.filter(k => k.better !== 'neutral').map(def => {
    const va = a.values[def.key], vb = b.values[def.key];
    let winner: 'a' | 'b' | 'tie' | null = null;
    if (va != null && vb != null) {
      winner = Math.abs(va - vb) < 1e-9 ? 'tie' : ((def.better === 'low' ? va < vb : va > vb) ? 'a' : 'b');
    }
    return { def, va, vb, winner };
  });
  return {
    lines,
    winsA: lines.filter(l => l.winner === 'a').length,
    winsB: lines.filter(l => l.winner === 'b').length,
    ties: lines.filter(l => l.winner === 'tie').length,
  };
}

/** Nota 0–100 de um valor face aos pares (100 = melhor da equipa), cortada aos extremos.
 *  Serve para pôr KPIs de unidades diferentes no mesmo radar (inverte os "menos é melhor"). */
export function scoreAgainst(def: KpiDef, value: number | null, peers: (number | null)[]): number | null {
  const vals = peers.filter((v): v is number => v != null);
  if (value == null || vals.length === 0 || def.better === 'neutral') return null;
  const min = Math.min(...vals), max = Math.max(...vals);
  if (max === min) return 50;
  const raw = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  return Math.round(def.better === 'low' ? 100 - raw : raw);
}
