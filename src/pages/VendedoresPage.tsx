import { useMemo, useState } from 'react';
import { Trophy } from 'lucide-react';
import { useData } from '@/contexts/DataContext';
import { PeriodFilter } from '@/components/PeriodFilter';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, LabelList, Legend,
  ComposedChart, Line, Tooltip, ReferenceLine,
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
    n.has(resp) ? n.delete(resp) : n.add(resp);
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
  // "R" (negócios ÷ retails) num eixo auxiliar e a linha "Carteira" com o valor
  // (nº de veículos) em aberto no fim de cada mês — a flutuação da carteira.
  const balancoCarteira = useMemo(() => {
    const map: Record<number, { neg: number; ret: number }> = {};
    const ensure = (k: number) => (map[k] ??= { neg: 0, ret: 0 });
    negocios.forEach(r => { if (r.neg) ensure(monthKey(r.neg)).neg++; });
    retails.forEach(r => { if (r.date298) ensure(monthKey(r.date298)).ret++; });

    // Universo para reconstruir o stock histórico da carteira: veículos que
    // entraram em carteira (abertos agora, ou já entregues/Retail com data).
    // A carteira é sempre o TOTAL da equipa — não filtra por vendedor.
    const stockUniverse = control.filter(r =>
      isVehicle(r.type) && r.neg &&
      (OPEN.has(r.status) || r.status === 'Retail'));
    // Carteira do mês k (AAAAMM) = total por entregar contando o próprio mês e
    // os meses seguintes: entrou até ao fecho do mês e ainda não tinha sido
    // entregue antes desse mês. Abertos agora contam sempre; os Retail contam se
    // a entrega é no mês k ou depois (inclui as entregas do próprio mês).
    const stockAt = (k: number) => {
      const monthStart = new Date(Math.floor(k / 100), (k % 100) - 1, 1).getTime(); // 1º dia do mês k
      const nextMonth = new Date(Math.floor(k / 100), k % 100, 1).getTime();        // 1º dia do mês seguinte
      return stockUniverse.reduce((n, r) => {
        if (!r.neg || r.neg.getTime() >= nextMonth) return n;
        if (OPEN.has(r.status)) return n + 1;
        if (r.status === 'Retail' && r.date298 && r.date298.getTime() >= monthStart) return n + 1;
        return n;
      }, 0);
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
          carteira: stockAt(k),      // carteira total por entregar (mês + seguintes) — linha roxa
        };
      });
  }, [negocios, retails, control, selectedResps]);

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
                  <YAxis yAxisId="left" tick={{ fontSize: 10 }} allowDecimals={false} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }}
                    domain={[0, (max: number) => Math.max(2, Math.ceil(max))]}
                    tickFormatter={(v: number) => v.toFixed(1)} />
                  <Tooltip
                    contentStyle={{ fontSize: 11, background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                    formatter={(value: number, name: string) =>
                      name === 'R' ? [value ?? '—', name] : [Math.abs(value), name]} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <ReferenceLine yAxisId="left" y={0} stroke="hsl(var(--foreground))" strokeOpacity={0.4} />
                  <ReferenceLine yAxisId="right" y={1} stroke="#1C69D4" strokeDasharray="4 4" strokeOpacity={0.5} />
                  <Bar yAxisId="left" dataKey="neg" name="Negócios" stackId="fluxo" fill="#16A34A" radius={[3, 3, 0, 0]} barSize={26}>
                    <LabelList dataKey="neg" position="top" fontSize={9} fill="hsl(var(--foreground))"
                      formatter={(v: number) => (v > 0 ? v : '')} />
                  </Bar>
                  <Bar yAxisId="left" dataKey="retNeg" name="Retails" stackId="fluxo" fill="#DC2626" radius={[0, 0, 3, 3]} barSize={26}>
                    <LabelList dataKey="retNeg" position="bottom" fontSize={9} fill="hsl(var(--foreground))"
                      formatter={(v: number) => (v < 0 ? Math.abs(v) : '')} />
                  </Bar>
                  <Line yAxisId="left" type="monotone" dataKey="carteira" name="Carteira" stroke="#8B5CF6"
                    strokeWidth={2} dot={{ r: 2.5, fill: '#8B5CF6' }}>
                    <LabelList dataKey="carteira" position="top" fontSize={9} fill="#8B5CF6"
                      formatter={(v: number) => (v > 0 ? v : '')} />
                  </Line>
                  <Line yAxisId="right" type="monotone" dataKey="r" name="R" stroke="#1C69D4"
                    strokeWidth={2} connectNulls dot={{ r: 2.5, fill: '#1C69D4' }} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
            <p className="text-[10px] text-muted-foreground mt-1 px-1">
              Barras verdes = negócios fechados (entram) · barras vermelhas = retails entregues (saem) ·
              <span className="text-[#8B5CF6]"> linha roxa = carteira total por entregar (mês + meses seguintes)</span> (sempre a equipa toda) ·
              linha azul = <strong>R</strong> (eixo dir.). Saldo acima de zero e
              <span className="text-[#1C69D4] dark:text-sky-300"> R&gt;1</span> ⇒ carteira a crescer;
              abaixo e <span className="text-amber-700 dark:text-amber-400">R&lt;1</span> ⇒ a queimar.
            </p>
          </div>

          {/* Lead time — distribuição */}
          <div className="bg-card border border-border rounded-lg p-2">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-[11px] font-semibold text-muted-foreground uppercase">Lead time Negócio → Retail (dias)</h3>
              <span className="text-[10px] text-muted-foreground">n = {lead.n}</span>
            </div>
            <ResponsiveContainer width="100%" height={180}>
              {/* Cada série no seu próprio eixo-x (1 e 2 ocultos) → todas centradas na
                  mesma categoria, sobrepondo-se. Larguras decrescentes (Retails > QoR > BEV)
                  mantêm as três sempre visíveis; preenchimento opaco. */}
              <BarChart data={lead.buckets} barCategoryGap="28%">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" xAxisId={0} tick={{ fontSize: 10 }} />
                <XAxis dataKey="label" xAxisId={1} hide />
                <XAxis dataKey="label" xAxisId={2} hide />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="Todos" name="Retails" xAxisId={0} barSize={44} fill="#1C69D4" radius={[3, 3, 0, 0]}>
                  <LabelList dataKey="Todos" position="top" fontSize={9} fill="hsl(var(--foreground))" formatter={(v: number) => v > 0 ? v : ''} />
                </Bar>
                <Bar dataKey="QoR" name="QoR" xAxisId={1} barSize={26} fill="#F59E0B" radius={[3, 3, 0, 0]} />
                <Bar dataKey="BEV" name="BEV" xAxisId={2} barSize={12} fill="#16A34A" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Desempenho por comercial */}
          <div className="bg-card border border-border rounded-lg overflow-x-auto">
            <div className="px-2 py-1.5 border-b border-border">
              <h3 className="text-[11px] font-semibold text-muted-foreground uppercase">Desempenho por Comercial</h3>
            </div>
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-[10px] text-muted-foreground bg-muted/40">
                  <th className="px-2 py-1.5 text-left font-medium">Comercial</th>
                  <th className="px-2 py-1.5 text-right font-medium" title="Negócios fechados no período">Neg</th>
                  <th className="px-2 py-1.5 text-right font-medium" title="Retails entregues no período">Ret</th>
                  <th className="px-2 py-1.5 text-right font-medium" title="Negócios ÷ Retails (fluxo)">R</th>
                  <th className="px-2 py-1.5 text-right font-medium" title="% BEV dos negócios do período">%BEV</th>
                  <th className="px-2 py-1.5 text-right font-medium" title="% QoR dos negócios do período">%QoR</th>
                  <th className="px-2 py-1.5 text-right font-medium" title="Carteira atual em aberto (Carteira + Matrícula)">Cart.</th>
                  <th className="px-2 py-1.5 text-right font-medium" title="Idade média da carteira atual (dias desde o negócio)">Idade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {rows.map(row => (
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
                {rows.length === 0 && (
                  <tr><td colSpan={8} className="px-2 py-4 text-center text-muted-foreground">Sem registos no período.</td></tr>
                )}
              </tbody>
            </table>
            <p className="text-[10px] text-muted-foreground px-2 py-1.5 border-t border-border">
              %BEV / %QoR sobre negócios do período · Cart. / Idade referem-se à carteira atual em aberto.
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
