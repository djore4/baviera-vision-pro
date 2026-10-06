import {
  ACT_TIPOS, FASES, TEMPERATURAS, daysToEnd, toIsoMonth,
  type ActTipo, type EotContract,
} from '@/lib/eot';

/* Report do End-of-Term: oportunidades cruzadas com uma régua temporal (fim de
 * contrato). Lógica pura — a página só desenha o resultado. */

export type ReportDim = 'fase' | 'acao' | 'temperatura' | 'responsavel';
export type ReportBuckets = 'mes' | 'prazo';
export type ReportMetric = 'n' | 'valor';

export const REPORT_DIMS: { value: ReportDim; label: string }[] = [
  { value: 'fase',        label: 'Fase' },
  { value: 'acao',        label: 'Próxima ação' },
  { value: 'temperatura', label: 'Temperatura' },
  { value: 'responsavel', label: 'Responsável' },
];

export interface ReportBucket { key: string; label: string }
export interface ReportRow { key: string; label: string; cells: number[]; total: number }
export interface Report {
  buckets: ReportBucket[];
  rows: ReportRow[];
  colTotals: number[];
  grandTotal: number;
  /** Maior célula (para a intensidade da cor). */
  max: number;
}

const PAST = 'past', LATER = 'later', NONE = 'none';
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MONTHS_AHEAD = 12;

/** Os 12 meses a contar do mês de `today` (inclusive). */
function monthKeys(today: Date): ReportBucket[] {
  const out: ReportBucket[] = [];
  for (let i = 0; i < MONTHS_AHEAD; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
    const yy = String(d.getFullYear()).slice(2);
    out.push({ key: toIsoMonth(d), label: `${MESES[d.getMonth()]} ${yy}` });
  }
  return out;
}

const PRAZO_BUCKETS: ReportBucket[] = [
  { key: '0-30',    label: '0–30 d' },
  { key: '31-60',   label: '31–60 d' },
  { key: '61-90',   label: '61–90 d' },
  { key: '91-180',  label: '91–180 d' },
  { key: '181+',    label: '> 180 d' },
];

/** Em que coluna da régua cai o contrato (null = sem data de fim). */
export function bucketOf(data_fim: string | null, mode: ReportBuckets, months: ReportBucket[]): string {
  const d = daysToEnd(data_fim);
  if (d == null) return NONE;
  if (d < 0) return PAST;
  if (mode === 'prazo') {
    return d <= 30 ? '0-30' : d <= 60 ? '31-60' : d <= 90 ? '61-90' : d <= 180 ? '91-180' : '181+';
  }
  const key = (data_fim as string).slice(0, 7);
  return months.some(m => m.key === key) ? key : LATER;
}

/* Linha (valor da dimensão) a que o contrato pertence. */
function rowOf(c: EotContract, dim: ReportDim, nextTipo: (contrato: string) => ActTipo | null): string {
  switch (dim) {
    case 'fase':        return c.fase;
    case 'acao':        return nextTipo(c.contrato) ?? NONE;
    case 'temperatura': return c.temperatura ?? NONE;
    case 'responsavel': return c.owner_email?.toLowerCase() || NONE;
  }
}

/** Ordem e etiquetas fixas das dimensões enumeradas; o responsável é dinâmico. */
function fixedRows(dim: ReportDim): { key: string; label: string }[] | null {
  switch (dim) {
    case 'fase':        return FASES.map(f => ({ key: f.value, label: f.label }));
    case 'acao':        return [...ACT_TIPOS.map(a => ({ key: a.value, label: a.label })), { key: NONE, label: 'Sem ação agendada' }];
    // Do mais quente para o mais frio: é o que o chefe quer ver primeiro.
    case 'temperatura': return [
      ...[...TEMPERATURAS].reverse().map(t => ({ key: t.value as string, label: t.label })),
      { key: NONE, label: 'Sem classificação' },
    ];
    case 'responsavel': return null;
  }
}

export function buildReport(
  contracts: EotContract[],
  opts: {
    dim: ReportDim;
    buckets: ReportBuckets;
    metric: ReportMetric;
    /** Tipo da próxima ação aberta de cada contrato (a agenda). */
    nextTipo: (contrato: string) => ActTipo | null;
    today?: Date;
  },
): Report {
  const today = opts.today ?? new Date();
  const months = monthKeys(today);
  const base = opts.buckets === 'mes' ? months : PRAZO_BUCKETS;

  const weight = (c: EotContract) => (opts.metric === 'n' ? 1 : c.valor_residual ?? 0);

  // key da linha → key da coluna → valor
  const grid = new Map<string, Map<string, number>>();
  const colUsed = new Set<string>();
  const ownerLabel = new Map<string, string>();
  for (const c of contracts) {
    const r = rowOf(c, opts.dim, opts.nextTipo);
    const col = bucketOf(c.data_fim, opts.buckets, months);
    colUsed.add(col);
    if (opts.dim === 'responsavel' && r !== NONE && !ownerLabel.has(r)) ownerLabel.set(r, c.owner_nome || r);
    const row = grid.get(r) ?? new Map<string, number>();
    row.set(col, (row.get(col) ?? 0) + weight(c));
    grid.set(r, row);
  }

  // Colunas: "Terminados" e "Mais tarde"/"Sem data" só aparecem se tiverem contratos.
  const buckets: ReportBucket[] = [
    ...(colUsed.has(PAST) ? [{ key: PAST, label: 'Terminados' }] : []),
    ...base,
    ...(colUsed.has(LATER) ? [{ key: LATER, label: '> 12 meses' }] : []),
    ...(colUsed.has(NONE) ? [{ key: NONE, label: 'Sem data' }] : []),
  ];

  const defs = fixedRows(opts.dim)
    ?? [...grid.keys()]
      .map(k => ({ key: k, label: k === NONE ? 'Sem responsável' : ownerLabel.get(k) ?? k }))
      .sort((a, b) => (a.key === NONE ? 1 : b.key === NONE ? -1 : a.label.localeCompare(b.label, 'pt')));

  const rows: ReportRow[] = defs
    .map(d => {
      const cells = buckets.map(b => grid.get(d.key)?.get(b.key) ?? 0);
      return { ...d, cells, total: cells.reduce((s, v) => s + v, 0) };
    })
    .filter(r => r.total > 0);

  const colTotals = buckets.map((_, i) => rows.reduce((s, r) => s + r.cells[i], 0));
  return {
    buckets, rows, colTotals,
    grandTotal: colTotals.reduce((s, v) => s + v, 0),
    max: rows.reduce((m, r) => Math.max(m, ...r.cells), 0),
  };
}
