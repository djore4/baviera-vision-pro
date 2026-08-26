import { useMemo, useState, useCallback } from 'react';
import { Trophy, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { useData } from '@/contexts/DataContext';
import { PeriodFilter } from '@/components/PeriodFilter';
import { QualityRadarCard } from '@/components/QualityRadarCard';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, LabelList, Legend,
  ComposedChart, Line, Tooltip, ReferenceLine, Customized,
} from 'recharts';

/* ── Tab Vendedores (admin) ──────────────────────────────────────────────────
 * Indicadores centrados no comercial:
 *  - "R" = negócios fechados ÷ retails entregues (fluxo do período).
 *          R>1 → carteira a crescer (angariar); R<1 → carteira a queimar.
 *  - Desempenho por comercial: R + mix (%BEV, %QoR) + estado da carteira.
 *  - Lead time Negócio→Retail: dias entre data de negócio e data de retail.
 * ──────────────────────────────────────────────────────────────────────────── */

const isVehicle = (t: string) => t === 'VN' || t === 'VD';
const CLOSED = new Set(['Carteira', 'Matricula', 'Retail']); // negócio fechado (entrou em carteira ou além)
const OPEN = new Set(['Carteira', 'Matricula']); // carteira ainda por entregar

/* Colunas ordenáveis da tabela "Desempenho por Comercial". */
type SortKey = 'resp' | 'neg' | 'ret' | 'r' | 'bevPct' | 'qorPct' | 'open' | 'age';
const PERF_COLS: { key: SortKey; label: string; align: 'left' | 'right'; title?: string }[] = [
  { key: 'resp', label: 'Comercial', align: 'left' },
  { key: 'neg', label: 'Neg', align: 'right', title: 'Negócios fechados no período' },
  { key: 'ret', label: 'Ret', align: 'right', title: 'Retails entregues no período' },
  { key: 'r', label: 'R', align: 'right', title: 'Negócios ÷ Retails (fluxo)' },
  { key: 'bevPct', label: '%BEV', align: 'right', title: '% BEV dos negócios do período' },
  { key: 'qorPct', label: '%QoR', align: 'right', title: '% QoR dos negócios do período' },
  { key: 'open', label: 'Cart.', align: 'right', title: 'Carteira atual em aberto (Carteira + Matrícula)' },
  { key: 'age', label: 'Idade', align: 'right', title: 'Idade média da carteira atual (dias desde o negócio)' },
];

/* Método de pagamento (campo `fin`): ordem de empilhamento e cores. */
const FIN_ORDER = ['PP', 'FS', 'Fint', 'Fext', 'N/A'] as const;
const FIN_COLORS: Record<string, string> = {
  PP: '#1C69D4', FS: '#16A34A', Fint: '#8B5CF6', Fext: '#F59E0B', 'N/A': '#94A3B8',
};
const finColor = (m: string) => FIN_COLORS[m] ?? '#94A3B8';

/* Overlay "series lines": liga o topo de cada série de barra para barra (estilo
 * Excel). Lê os retângulos reais das barras (formattedGraphicalItems) para ter a
 * geometria exata. Recebe os props internos do recharts via <Customized>. */
type BarRect = { x: number; y: number; width: number; height: number };
interface FinItem { props: { data?: BarRect[] }; item?: { props?: { dataKey?: string | number } } }
interface FinSeriesLinesProps {
  formattedGraphicalItems?: FinItem[];
}
function FinSeriesLines({ formattedGraphicalItems }: FinSeriesLinesProps) {
  const items = formattedGraphicalItems ?? [];
  if (items.length === 0) return null;
  // Mapeia cada série (dataKey do <Bar> original) aos seus retângulos.
  const byKey = new Map(items.map(it => [String(it.item?.props?.dataKey), it.props.data ?? []]));
  const stack = FIN_ORDER.map(m => byKey.get(m)).filter((d): d is BarRect[] => !!d && d.length > 0);
  if (stack.length < 2) return null;
  const months = stack[0].length;
  const lines: React.ReactNode[] = [];
  // Divisórias internas: topo da série k (k de 0..n-2), entre meses adjacentes.
  for (let k = 0; k < stack.length - 1; k++) {
    for (let i = 0; i < months - 1; i++) {
      const a = stack[k][i];
      const b = stack[k][i + 1];
      if (!a || !b) continue;
      lines.push(
        <line
          key={`${k}-${i}`}
          x1={a.x + a.width} y1={a.y}
          x2={b.x} y2={b.y}
          stroke={finColor(FIN_ORDER[k])}
          strokeOpacity={0.5}
          strokeWidth={1.25}
        />,
      );
    }
  }
  return <g>{lines}</g>;
}

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);
const fmtR = (r: number | null) => (r === null ? '—' : r.toFixed(2));
const DAY = 1000 * 60 * 60 * 24;

function median(arr: number[]): number | null {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const PT_MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const monthKey = (d: Date) => d.getFullYear() * 100 + (d.getMonth() + 1); // AAAAMM
const monthLabel = (k: number) => `${PT_MONTHS[(k % 100) - 1]}/${String(Math.floor(k / 100)).slice(2)}`;

export default function VendedoresPage() {
  const { data, filter } = useData();
  const [selectedResps, setSelectedResps] = useState<Set<string>>(new Set());
  const toggleResp = (resp: string) => setSelectedResps(prev => {
    const n = new Set(prev);
    if (n.has(resp)) n.delete(resp); else n.add(resp);
    return n;
  });

  /** Pertence ao período selecionado (anos / trimestres / meses) pela data indicada. */
  const inPeriod = useMemo(() => {
    return (d: Date | null) => {
      if (!d) return false;
      const y = d.getFullYear(), m = d.getMonth() + 1;
      if (filter.months.length > 0) return filter.months.some(fm => Math.floor(fm / 100) === y && fm % 100 === m);
      if (filter.quarters.length > 0) return filter.years.includes(y) && filter.quarters.includes(Math.ceil(m / 3));
      if (filter.years.length > 0) return filter.years.includes(y);
      return true;
    };
  }, [filter]);

  const control = data?.control ?? [];

  // Universo de vendedores (para o filtro).
  const allResps = useMemo(
    () => Array.from(new Set(control.filter(r => isVehicle(r.type) && r.resp).map(r => r.resp))).sort(),
    [control]);
  const respOk = (resp: string) => selectedResps.size === 0 || selectedResps.has(resp);

  // Negócios fechados no período (numerador do R) e retails entregues no período (denominador).
  const negocios = useMemo(
    () => control.filter(r => isVehicle(r.type) && CLOSED.has(r.status) && inPeriod(r.neg) && respOk(r.resp)),
    [control, inPeriod, selectedResps]);
  const retails = useMemo(
    () => control.filter(r => isVehicle(r.type) && r.status === 'Retail' && inPeriod(r.date298) && respOk(r.resp)),
    [control, inPeriod, selectedResps]);

  const teamR = retails.length ? negocios.length / retails.length : null;

  // Balanço de Carteira — série mensal: negócios fechados (entram, +) vs retails
  // entregues (saem, −). Barra verde para cima, barra vermelha para baixo, linha
  // "R" (negócios ÷ retails) num eixo auxiliar e a linha "Carteira" com o stock
  // total da equipa ao longo do tempo — a flutuação da carteira.
  const balancoCarteira = useMemo(() => {
    const map: Record<number, { neg: number; ret: number }> = {};
    const ensure = (k: number) => (map[k] ??= { neg: 0, ret: 0 });
    negocios.forEach(r => { if (r.neg) ensure(monthKey(r.neg)).neg++; });
    retails.forEach(r => { if (r.date298) ensure(monthKey(r.date298)).ret++; });

    // Carteira TOTAL da equipa: ancorada no valor real de agora (nº de veículos
    // em aberto — Carteira/Matrícula) e reconstruída para trás pelos fluxos
    // globais. Muitos registos em aberto não têm data de negócio, por isso não
    // dá para reconstruir o stock histórico direto; ancorar no total atual
    // garante que o último ponto = carteira real e cada mês varia pelo net
    // (entradas por negócio − saídas por retail). Independente dos filtros.
    const vehicles = control.filter(r => isVehicle(r.type));
    const currentCarteira = vehicles.filter(r => OPEN.has(r.status)).length; // stock atual
    const net: Record<number, number> = {}; // mês → entradas (neg) − saídas (retail), equipa toda
    vehicles.forEach(r => {
      if (CLOSED.has(r.status) && r.neg) net[monthKey(r.neg)] = (net[monthKey(r.neg)] ?? 0) + 1;
      if (r.status === 'Retail' && r.date298) net[monthKey(r.date298)] = (net[monthKey(r.date298)] ?? 0) - 1;
    });
    // carteira(k) = stock atual − net de todos os meses posteriores a k.
    const carteiraAt = (k: number) => {
      let future = 0;
      for (const mk in net) if (Number(mk) > k) future += net[mk];
      return Math.max(0, currentCarteira - future);
    };

    return Object.keys(map)
      .map(Number)
      .sort((a, b) => a - b)
      .map(k => {
        const { neg, ret } = map[k];
        return {
          label: monthLabel(k),
          neg,                       // negócios fechados (barra verde, ↑)
          ret,                       // retails entregues (valor real, para tooltip)
          retNeg: -ret,              // retails (barra vermelha, ↓)
          r: ret ? +(neg / ret).toFixed(2) : null, // R do mês (linha azul)
          carteira: carteiraAt(k),   // carteira total da equipa no fim do mês — linha amarela
        };
      });
  }, [negocios, retails, control, selectedResps]);

  // Limite simétrico para o eixo (escondido) dos fluxos, para o zero ficar ao centro.
  const flowMax = useMemo(
    () => Math.max(4, ...balancoCarteira.map(d => Math.max(d.neg, d.ret))),
    [balancoCarteira]);

  // Carteira atual em aberto (estado, não limitado ao período) — para idade.
  const openCarteira = useMemo(
    () => control.filter(r => isVehicle(r.type) && OPEN.has(r.status) && respOk(r.resp)),
    [control, selectedResps]);

  // Lead time Negócio→Retail (dias), sobre retails do período com ambas as datas.
  // Corte por QoR e BEV (contagens sobrepostas, não uma partição).
  const lead = useMemo(() => {
    const defs = [
      { label: '< 30', min: 0, max: 30 },
      { label: '30–60', min: 30, max: 60 },
      { label: '60–90', min: 60, max: 90 },
      { label: '90–120', min: 90, max: 120 },
      { label: '120+', min: 120, max: Infinity },
    ];
    const buckets = defs.map(b => ({ label: b.label, Todos: 0, QoR: 0, BEV: 0 }));
    const days: number[] = [];
    retails.forEach(r => {
      if (!r.neg || !r.date298) return;
      const d = Math.round((r.date298.getTime() - r.neg.getTime()) / DAY);
      if (d < 0) return;
      days.push(d);
      const idx = defs.findIndex(b => d >= b.min && d < b.max);
      if (idx < 0) return;
      buckets[idx].Todos++;
      if (r.qor === 1) buckets[idx].QoR++;
      if (r.bev === 1) buckets[idx].BEV++;
    });
    const mean = days.length ? Math.round(days.reduce((s, d) => s + d, 0) / days.length) : null;
    return { n: days.length, median: median(days), mean, buckets };
  }, [retails]);

  // Pódios de retail (top 3 por comercial) — total, BEV e QoR.
  const podiums = useMemo(() => {
    const agg: Record<string, { total: number; bev: number; qor: number }> = {};
    retails.forEach(r => {
      const e = (agg[r.resp || '—'] ??= { total: 0, bev: 0, qor: 0 });
      e.total++;
      if (r.bev === 1) e.bev++;
      if (r.qor === 1) e.qor++;
    });
    const rank = (key: 'total' | 'bev' | 'qor') =>
      Object.entries(agg).map(([name, v]) => ({ name, value: v[key] }))
        .filter(x => x.value > 0)
        .sort((a, b) => b.value - a.value)
        .slice(0, 3);
    return { total: rank('total'), bev: rank('bev'), qor: rank('qor') };
  }, [retails]);

  // Agregação por comercial.
  const rows = useMemo(() => {
    const map: Record<string, {
      resp: string; neg: number; ret: number; bev: number; qor: number;
      openN: number; ageSum: number; ageN: number;
    }> = {};
    const ensure = (resp: string) => (map[resp] ??= {
      resp, neg: 0, ret: 0, bev: 0, qor: 0, openN: 0, ageSum: 0, ageN: 0,
    });
    negocios.forEach(r => {
      const e = ensure(r.resp || '—');
      e.neg++;
      if (r.bev === 1) e.bev++;
      if (r.qor === 1) e.qor++;
    });
    retails.forEach(r => { ensure(r.resp || '—').ret++; });
    openCarteira.forEach(r => {
      const e = ensure(r.resp || '—');
      e.openN++;
      if (r.neg) { e.ageSum += Math.round((Date.now() - r.neg.getTime()) / DAY); e.ageN++; }
    });
    return Object.values(map)
      .map(e => ({
        resp: e.resp,
        neg: e.neg,
        ret: e.ret,
        r: e.ret ? e.neg / e.ret : null,
        bevPct: pct(e.bev, e.neg),
        qorPct: pct(e.qor, e.neg),
        open: e.openN,
        age: e.ageN ? Math.round(e.ageSum / e.ageN) : null,
      }))
      .sort((a, b) => b.neg - a.neg);
  }, [negocios, retails, openCarteira]);

  // Ordenação da tabela por coluna (clique alterna asc/desc). Por defeito, Neg desc.
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'neg', dir: 'desc' });
  const toggleSort = (key: SortKey) =>
    setSort(s => s.key === key
      ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: key === 'resp' ? 'asc' : 'desc' });

  const sortedRows = useMemo(() => {
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;   // nulos (R/Idade sem valor) sempre no fim
      if (bv == null) return -1;
      if (typeof av === 'string' || typeof bv === 'string') {
        return String(av).localeCompare(String(bv)) * dir;
      }
      return (av - bv) * dir;
    });
  }, [rows, sort]);

  // Mix de método de pagamento (`fin`) por mês — contagens brutas (normalizadas a
  // 100% no gráfico via stackOffset="expand"). Base: negócios fechados no período.
  const finByMonth = useMemo(() => {
    const map: Record<number, Record<string, number>> = {};
    negocios.forEach(r => {
      if (!r.neg) return;
      const k = monthKey(r.neg);
      const method = (FIN_ORDER as readonly string[]).includes(r.fin) ? r.fin : 'N/A';
      (map[k] ??= {})[method] = (map[k][method] ?? 0) + 1;
    });
    return Object.keys(map).map(Number).sort((a, b) => a - b).map(k => {
      const counts = map[k];
      const total = FIN_ORDER.reduce((s, m) => s + (counts[m] ?? 0), 0);
      const row: Record<string, number | string> = { label: monthLabel(k), _total: total };
      FIN_ORDER.forEach(m => { row[m] = counts[m] ?? 0; });
      return row;
    });
  }, [negocios]);

  const renderFinLines = useCallback(
    (props: object) => <FinSeriesLines {...(props as FinSeriesLinesProps)} />,
    [],
  );

  const rClass = (r: number | null) =>
    r === null ? 'text-muted-foreground'
      : r > 1.02 ? 'bg-[#1C69D4]/10 text-[#1C69D4] dark:text-sky-300'
        : r < 0.98 ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
          : 'text-foreground';

  if (!data) {
    return <div className="text-sm text-muted-foreground p-4">Sem dados carregados.</div>;
  }

  return (
    <div className="space-y-3 animate-fade-in">
      <div className="flex flex-col lg:flex-row gap-3">
        {/* Filtro de período */}
        <div className="w-full lg:w-44 flex-shrink-0 space-y-2">
          <PeriodFilter>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Vendedor</p>
                {selectedResps.size > 0 && (
                  <button onClick={() => setSelectedResps(new Set())}
                    className="text-[10px] font-medium text-primary hover:underline">Limpar</button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {allResps.map(resp => {
                  const active = selectedResps.has(resp);
                  return (
                    <button key={resp} onClick={() => toggleResp(resp)}
                      className={active
                        ? 'rounded-md border border-primary bg-primary px-2.5 py-1.5 text-[11px] font-semibold text-primary-foreground'
                        : 'rounded-md border border-border bg-background px-2.5 py-1.5 text-[11px] font-medium text-foreground hover:bg-accent'
                      }>
                      {resp}
                    </button>
                  );
                })}
                {allResps.length === 0 && <span className="text-[10px] text-muted-foreground">—</span>}
              </div>
            </div>
          </PeriodFilter>
        </div>

        {/* Conteúdo */}
        <div className="flex-1 min-w-0 space-y-2">
          {/* Tiles de topo */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            <StatTile label='"R" — Equipa' value={fmtR(teamR)}
              hint={teamR === null ? 'Sem retails no período'
                : teamR < 1 ? 'Carteira a queimar' : teamR < 1.1 ? 'Em equilíbrio' : 'Carteira a crescer'}
              accent={teamR === null ? 'muted' : teamR < 1 ? 'red' : teamR < 1.1 ? 'yellow' : 'green'} />
            <StatTile label="Negócios (período)" value={String(negocios.length)} hint="Fecho no período" />
            <StatTile label="Retails (período)" value={String(retails.length)} hint="Entregues no período" />
            <StatTile label="Lead time (mediana)" value={lead.median === null ? '—' : `${lead.median} d`}
              hint={lead.mean === null ? 'Negócio → Retail' : `média ${lead.mean} d · n=${lead.n}`} />
          </div>

          {/* Nota metodológica do R */}
          <p className="text-[10px] text-muted-foreground px-1">
            <strong>R</strong> = negócios fechados ÷ retails entregues no período (fluxo).
            <span className="text-[#1C69D4] dark:text-sky-300"> R&gt;1 angaria</span> ·
            <span className="text-amber-700 dark:text-amber-400"> R&lt;1 queima</span> carteira.
          </p>

          {/* Balanço de Carteira — negócios (↑) vs retails (↓) + linha R */}
          <div className="bg-card border border-border rounded-lg p-2">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-[11px] font-semibold text-muted-foreground uppercase">Balanço de Carteira</h3>
              <span className="text-[10px] text-muted-foreground">Negócios ↑ · Retails ↓ · Carteira · R</span>
            </div>
            {balancoCarteira.length === 0 ? (
              <div className="h-[220px] flex items-center justify-center text-[11px] text-muted-foreground">
                Sem registos no período.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                {/* Barras acima de zero = entradas (negócios fechados); abaixo de zero =
                    saídas (retails entregues). Saldo positivo ⇒ carteira a crescer.
                    A linha R (eixo direito) confirma o sentido: R>1 angaria, R<1 queima. */}
                <ComposedChart data={balancoCarteira} stackOffset="sign" barCategoryGap="24%">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  {/* Eixo visível da esquerda = carteira (linha amarela), a partir do zero. */}
                  <YAxis yAxisId="cart" tick={{ fontSize: 10, fill: '#F59E0B' }} allowDecimals={false}
                    domain={[0, (max: number) => Math.ceil(max * 1.15)]} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }}
                    domain={[0, (max: number) => Math.max(2, Math.ceil(max))]}
                    tickFormatter={(v: number) => v.toFixed(1)} />
                  {/* Eixo escondido e simétrico para as barras de fluxo (zero ao centro). */}
                  <YAxis yAxisId="flow" hide domain={[-flowMax, flowMax]} />
                  <Tooltip
                    contentStyle={{ fontSize: 11, background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                    formatter={(value: number, name: string) =>
                      name === 'R' ? [value ?? '—', name] : [Math.abs(value), name]} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <ReferenceLine yAxisId="flow" y={0} stroke="hsl(var(--foreground))" strokeOpacity={0.4} />
                  <ReferenceLine yAxisId="right" y={1} stroke="#1C69D4" strokeDasharray="4 4" strokeOpacity={0.5} />
                  <Bar yAxisId="flow" dataKey="neg" name="Negócios" stackId="fluxo" fill="#16A34A"
                    radius={[3, 3, 0, 0]} barSize={26} stroke="hsl(var(--card))" strokeWidth={1}>
                    <LabelList dataKey="neg" position="top" fontSize={9} fill="hsl(var(--foreground))"
                      formatter={(v: number) => (v > 0 ? v : '')} />
                  </Bar>
                  <Bar yAxisId="flow" dataKey="retNeg" name="Retails" stackId="fluxo" fill="#DC2626"
                    radius={[0, 0, 3, 3]} barSize={26} stroke="hsl(var(--card))" strokeWidth={1}>
                    <LabelList dataKey="retNeg" position="bottom" fontSize={9} fill="hsl(var(--foreground))"
                      formatter={(v: number) => (v < 0 ? Math.abs(v) : '')} />
                  </Bar>
                  <Line yAxisId="cart" type="monotone" dataKey="carteira" name="Carteira" stroke="#F59E0B"
                    strokeWidth={2} dot={{ r: 2.5, fill: '#F59E0B' }}>
                    <LabelList dataKey="carteira" position="top" fontSize={9} fill="#F59E0B"
                      formatter={(v: number) => (v > 0 ? v : '')} />
                  </Line>
                  <Line yAxisId="right" type="monotone" dataKey="r" name="R" stroke="#1C69D4"
                    strokeWidth={2} connectNulls dot={{ r: 2.5, fill: '#1C69D4' }}>
                    <LabelList dataKey="r" position="top" fontSize={9} fill="#1C69D4"
                      formatter={(v: number | null) => (v != null ? v.toFixed(2) : '')} />
                  </Line>
                </ComposedChart>
              </ResponsiveContainer>
            )}
            <p className="text-[10px] text-muted-foreground mt-1 px-1">
              Barras verdes = negócios fechados (entram) · barras vermelhas = retails entregues (saem) ·
              <span className="text-[#F59E0B]"> linha amarela = carteira total da equipa</span> (stock em aberto, ancorado no valor atual) ·
              linha azul = <strong>R</strong> (eixo dir.). Saldo acima de zero e
              <span className="text-[#1C69D4] dark:text-sky-300"> R&gt;1</span> ⇒ carteira a crescer;
              abaixo e <span className="text-amber-700 dark:text-amber-400">R&lt;1</span> ⇒ a queimar.
            </p>
          </div>

          {/* Desempenho por comercial */}
          <div className="bg-card border border-border rounded-lg overflow-x-auto">
            <div className="px-2 py-1.5 border-b border-border">
              <h3 className="text-[11px] font-semibold text-muted-foreground uppercase">Desempenho por Comercial</h3>
            </div>
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-[10px] text-muted-foreground bg-muted/40">
                  {PERF_COLS.map(c => {
                    const active = sort.key === c.key;
                    return (
                      <th
                        key={c.key}
                        onClick={() => toggleSort(c.key)}
                        title={c.title}
                        aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                        className={`px-2 py-1.5 font-medium cursor-pointer select-none hover:text-foreground ${c.align === 'left' ? 'text-left' : 'text-right'}`}
                      >
                        <span className="inline-flex items-center gap-0.5">
                          {c.label}
                          {active
                            ? (sort.dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)
                            : <ArrowUpDown className="h-3 w-3 opacity-30" />}
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {sortedRows.map(row => (
                  <tr key={row.resp} className="hover:bg-muted/40">
                    <td className="px-2 py-1 font-medium whitespace-nowrap">{row.resp}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{row.neg}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{row.ret}</td>
                    <td className={`px-2 py-1 text-right tabular-nums font-semibold rounded ${rClass(row.r)}`}>{fmtR(row.r)}</td>
                    <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{row.neg ? `${row.bevPct}%` : '—'}</td>
                    <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{row.neg ? `${row.qorPct}%` : '—'}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{row.open}</td>
                    <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{row.age === null ? '—' : `${row.age} d`}</td>
                  </tr>
                ))}
                {sortedRows.length === 0 && (
                  <tr><td colSpan={8} className="px-2 py-4 text-center text-muted-foreground">Sem registos no período.</td></tr>
                )}
              </tbody>
            </table>
            <p className="text-[10px] text-muted-foreground px-2 py-1.5 border-t border-border">
              %BEV / %QoR sobre negócios do período · Cart. / Idade referem-se à carteira atual em aberto.
            </p>
          </div>

          {/* Qualidade do serviço — resultado (read-only); gestão no separador Qualidade */}
          <QualityRadarCard selectedResps={selectedResps} />

          {/* Método de pagamento — mix mensal (barras 100%) */}
          <div className="bg-card border border-border rounded-lg p-2">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[11px] font-semibold text-muted-foreground uppercase">Método de pagamento — mix mensal</h3>
              <span className="text-[10px] text-muted-foreground">% dos negócios · por mês</span>
            </div>
            {finByMonth.length === 0 ? (
              <div className="h-[220px] flex items-center justify-center text-[11px] text-muted-foreground">
                Sem registos no período.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                {/* Barras normalizadas a 100% (stackOffset="expand"); as linhas de
                    continuação (Customized) ligam cada método de mês para mês. */}
                <BarChart data={finByMonth} stackOffset="expand" barCategoryGap="22%">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} domain={[0, 1]} tickFormatter={(v: number) => `${Math.round(v * 100)}%`} />
                  <Tooltip
                    contentStyle={{ fontSize: 11, background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                    formatter={(value: number, name: string, item: { payload?: { _total?: number } }) => {
                      const total = item?.payload?._total ?? 0;
                      const pct = total ? Math.round((value / total) * 100) : 0;
                      return [`${value} (${pct}%)`, name];
                    }} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  {FIN_ORDER.map(m => (
                    <Bar key={m} dataKey={m} name={m} stackId="fin" fill={finColor(m)}
                      maxBarSize={44} isAnimationActive={false} />
                  ))}
                  <Customized component={renderFinLines} />
                </BarChart>
              </ResponsiveContainer>
            )}
            <p className="text-[10px] text-muted-foreground mt-1 px-1">
              Cada barra soma 100% dos negócios do mês, repartida por método de pagamento
              (<strong>PP</strong> · <strong>FS</strong> · <strong>Fint</strong> · <strong>Fext</strong> · N/A).
              As linhas ligam cada método entre meses (continuação).
            </p>
          </div>

          {/* Pódios de retail */}
          <div className="bg-card border border-border rounded-lg p-2">
            <h3 className="text-[11px] font-semibold text-muted-foreground uppercase mb-2">Pódios — Retail</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Podium title="Retail Total" color="#1C69D4" entries={podiums.total} />
              <Podium title="Retail BEV" color="#16A34A" entries={podiums.bev} />
              <Podium title="Retail QoR" color="#F59E0B" entries={podiums.qor} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Podium({ title, color, entries }: { title: string; color: string; entries: { name: string; value: number }[] }) {
  // Ordem visual: 2º (esq.) · 1º (centro, mais alto) · 3º (dir.).
  const slots = [
    {
      e: entries[1], place: 2, blockH: 'h-14', num: '2',
      grad: 'from-slate-100 via-slate-300 to-slate-400',
      badge: 'bg-slate-400', extra: '',
    },
    {
      e: entries[0], place: 1, blockH: 'h-20', num: '1',
      grad: 'from-yellow-200 via-amber-300 to-amber-500',
      badge: 'bg-amber-500', extra: 'ring-2 ring-amber-300/70 shadow-lg shadow-amber-500/30',
    },
    {
      e: entries[2], place: 3, blockH: 'h-10', num: '3',
      grad: 'from-orange-200 via-orange-400 to-orange-600',
      badge: 'bg-orange-500', extra: '',
    },
  ];
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</span>
      </div>
      <div className="flex items-end justify-center gap-1.5">
        {slots.map((s, i) => (
          <div key={i} className="flex flex-1 flex-col items-center min-w-0">
            {/* Taça no 1º lugar */}
            {s.place === 1 && (
              <Trophy
                className={`mb-0.5 h-5 w-5 drop-shadow-[0_1px_2px_rgba(245,158,11,0.55)] ${s.e ? 'text-amber-500' : 'text-muted-foreground/40'}`}
                fill={s.e ? '#fde68a' : 'none'}
                strokeWidth={2}
              />
            )}
            <span className={`text-[11px] truncate max-w-full ${s.place === 1 ? 'font-bold text-foreground' : 'font-medium text-foreground/90'}`} title={s.e?.name}>
              {s.e?.name ?? '—'}
            </span>
            <span className="text-[10px] text-muted-foreground tabular-nums mb-1">{s.e ? s.e.value : ''}</span>
            <div className={`relative w-full ${s.blockH} rounded-t-md bg-gradient-to-b flex items-start justify-center pt-1 ${s.e ? `${s.grad} ${s.extra}` : 'from-muted to-muted'}`}>
              {/* brilho superior */}
              {s.e && <span className="pointer-events-none absolute inset-x-0 top-0 h-1/3 rounded-t-md bg-white/25" />}
              <span className={`relative z-10 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-extrabold text-white ${s.e ? s.badge : 'bg-muted-foreground/30'}`}>
                {s.e ? s.num : ''}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatTile({ label, value, hint, accent = 'default' }: {
  label: string; value: string; hint?: string;
  accent?: 'default' | 'blue' | 'amber' | 'muted' | 'red' | 'yellow' | 'green';
}) {
  const ring =
    accent === 'blue' ? 'border-[#1C69D4]/40'
      : accent === 'amber' || accent === 'yellow' ? 'border-amber-500/40'
        : accent === 'red' ? 'border-red-500/40'
          : accent === 'green' ? 'border-green-500/40'
            : 'border-border';
  const val =
    accent === 'blue' ? 'text-[#1C69D4] dark:text-sky-300'
      : accent === 'amber' ? 'text-amber-700 dark:text-amber-400'
        : accent === 'yellow' ? 'text-amber-500 dark:text-amber-400'
          : accent === 'red' ? 'text-red-600 dark:text-red-400'
            : accent === 'green' ? 'text-green-600 dark:text-green-400'
              : 'text-foreground';
  return (
    <div className={`bg-card border rounded-lg p-2.5 ${ring}`}>
      <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className={`text-2xl font-bold tabular-nums ${val}`}>{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}
