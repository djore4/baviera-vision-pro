import { useMemo, useState } from 'react';
import { Users } from 'lucide-react';
import { useData } from '@/contexts/DataContext';
import { PeriodFilter } from '@/components/PeriodFilter';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList, Legend,
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
          <PeriodFilter />
          <div className="bg-card border border-border rounded-lg p-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Users className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-semibold text-foreground">VENDEDOR</span>
              </div>
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

          {/* Lead time — distribuição */}
          <div className="bg-card border border-border rounded-lg p-2">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-[11px] font-semibold text-muted-foreground uppercase">Lead time Negócio → Retail (dias)</h3>
              <span className="text-[10px] text-muted-foreground">n = {lead.n}</span>
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={lead.buckets} barCategoryGap="18%">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 11, background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="Todos" fill="#1C69D4" radius={[3, 3, 0, 0]}>
                  <LabelList dataKey="Todos" position="top" fontSize={9} fill="hsl(var(--foreground))" formatter={(v: number) => v > 0 ? v : ''} />
                </Bar>
                <Bar dataKey="QoR" fill="#F59E0B" radius={[3, 3, 0, 0]} />
                <Bar dataKey="BEV" fill="#16A34A" radius={[3, 3, 0, 0]} />
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
    { e: entries[1], h: 'h-12', bg: 'bg-slate-300 dark:bg-slate-500/70', rank: '2' },
    { e: entries[0], h: 'h-16', bg: 'bg-amber-300 dark:bg-amber-500/80', rank: '1' },
    { e: entries[2], h: 'h-9', bg: 'bg-orange-300 dark:bg-orange-700/70', rank: '3' },
  ];
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</span>
      </div>
      <div className="flex items-end justify-center gap-1">
        {slots.map((s, i) => (
          <div key={i} className="flex flex-col items-center w-1/3 min-w-0">
            <span className="text-[10px] font-medium truncate max-w-full" title={s.e?.name}>{s.e?.name ?? '—'}</span>
            <span className="text-[10px] text-muted-foreground tabular-nums">{s.e ? s.e.value : ''}</span>
            <div className={`w-full rounded-t flex items-start justify-center pt-1 ${s.h} ${s.e ? s.bg : 'bg-muted'}`}>
              <span className="text-xs font-bold text-foreground/80">{s.e ? s.rank : ''}</span>
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
