import { useMemo } from 'react';
import { useData } from '@/contexts/DataContext';
import { PeriodFilter } from '@/components/PeriodFilter';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList,
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

  // Negócios fechados no período (numerador do R) e retails entregues no período (denominador).
  const negocios = useMemo(
    () => control.filter(r => isVehicle(r.type) && CLOSED.has(r.status) && inPeriod(r.neg)),
    [control, inPeriod]);
  const retails = useMemo(
    () => control.filter(r => isVehicle(r.type) && r.status === 'Retail' && inPeriod(r.date298)),
    [control, inPeriod]);

  const teamR = retails.length ? negocios.length / retails.length : null;

  // Carteira atual em aberto (estado, não limitado ao período) — para %GAR e idade.
  const openCarteira = useMemo(
    () => control.filter(r => isVehicle(r.type) && OPEN.has(r.status)),
    [control]);

  // Lead time Negócio→Retail (dias), sobre retails do período com ambas as datas.
  const lead = useMemo(() => {
    const days: number[] = [];
    retails.forEach(r => {
      if (r.neg && r.date298) {
        const d = Math.round((r.date298.getTime() - r.neg.getTime()) / DAY);
        if (d >= 0) days.push(d);
      }
    });
    const buckets = [
      { label: '< 30', min: 0, max: 30 },
      { label: '30–60', min: 30, max: 60 },
      { label: '60–90', min: 60, max: 90 },
      { label: '90–120', min: 90, max: 120 },
      { label: '120+', min: 120, max: Infinity },
    ].map(b => ({ label: b.label, count: days.filter(d => d >= b.min && d < b.max).length }));
    const mean = days.length ? Math.round(days.reduce((s, d) => s + d, 0) / days.length) : null;
    return { n: days.length, median: median(days), mean, buckets };
  }, [retails]);

  // Agregação por comercial.
  const rows = useMemo(() => {
    const map: Record<string, {
      resp: string; neg: number; ret: number; bev: number; qor: number;
      openN: number; garCerto: number; ageSum: number; ageN: number;
    }> = {};
    const ensure = (resp: string) => (map[resp] ??= {
      resp, neg: 0, ret: 0, bev: 0, qor: 0, openN: 0, garCerto: 0, ageSum: 0, ageN: 0,
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
      if (r.gar === 'GAR') e.garCerto++;
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
        garPct: pct(e.garCerto, e.openN),
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
        </div>

        {/* Conteúdo */}
        <div className="flex-1 min-w-0 space-y-2">
          {/* Tiles de topo */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            <StatTile label='"R" — Equipa' value={fmtR(teamR)}
              hint={teamR === null ? 'Sem retails no período'
                : teamR > 1.02 ? 'Carteira a crescer' : teamR < 0.98 ? 'Carteira a queimar' : 'Em equilíbrio'}
              accent={teamR === null ? 'muted' : teamR > 1.02 ? 'blue' : teamR < 0.98 ? 'amber' : 'muted'} />
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
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={lead.buckets} barSize={40}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 11, background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                <Bar dataKey="count" fill="#1C69D4" radius={[3, 3, 0, 0]}>
                  <LabelList dataKey="count" position="top" fontSize={10} fill="hsl(var(--foreground))" formatter={(v: number) => v > 0 ? v : ''} />
                </Bar>
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
                  <th className="px-2 py-1.5 text-right font-medium" title="% GAR 'Certo' na carteira atual">%GAR</th>
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
                    <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{row.open ? `${row.garPct}%` : '—'}</td>
                    <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{row.age === null ? '—' : `${row.age} d`}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={9} className="px-2 py-4 text-center text-muted-foreground">Sem registos no período.</td></tr>
                )}
              </tbody>
            </table>
            <p className="text-[10px] text-muted-foreground px-2 py-1.5 border-t border-border">
              %BEV / %QoR sobre negócios do período · Cart. / %GAR / Idade referem-se à carteira atual em aberto.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatTile({ label, value, hint, accent = 'default' }: {
  label: string; value: string; hint?: string; accent?: 'default' | 'blue' | 'amber' | 'muted';
}) {
  const ring = accent === 'blue' ? 'border-[#1C69D4]/40' : accent === 'amber' ? 'border-amber-500/40' : 'border-border';
  const val = accent === 'blue' ? 'text-[#1C69D4] dark:text-sky-300' : accent === 'amber' ? 'text-amber-700 dark:text-amber-400' : 'text-foreground';
  return (
    <div className={`bg-card border rounded-lg p-2.5 ${ring}`}>
      <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className={`text-2xl font-bold tabular-nums ${val}`}>{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}
