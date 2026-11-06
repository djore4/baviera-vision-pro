import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Swords, Trophy } from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, PolarAngleAxis, PolarGrid, PolarRadiusAxis,
  Radar, RadarChart, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis,
} from 'recharts';
import {
  GROUPS, KPIS, KPI_BY_KEY, baselineValue, delta, formatKpi, headToHead, insights, monthLabel, scoreAgainst,
  standing, type MonthAgg,
} from '@/lib/comparativo';
import { BASE_LABEL, C, heat, tooltipStyle, type CompareCtx } from './shared';
import { KpiCard } from './KpiCard';

const find = (ctx: CompareCtx, resp: string | null) => (resp ? ctx.sellers.find(s => s.resp === resp) : undefined);

/* ── Visão geral ─────────────────────────────────────────────────────────── */

export function OverviewView({ ctx }: { ctx: CompareCtx }) {
  const me = find(ctx, ctx.focus);
  const rival = find(ctx, ctx.rival);
  const { strengths, weaknesses } = useMemo(() => insights(ctx.sellers, ctx.focus), [ctx.sellers, ctx.focus]);

  const radar = useMemo(() => KPIS.filter(k => k.radar).map(def => {
    const peers = ctx.sellers.map(s => s.values[def.key]);
    return {
      axis: def.short,
      focus: scoreAgainst(def, me?.values[def.key] ?? null, peers) ?? 0,
      base: scoreAgainst(def, baselineValue(ctx.team, def.key, ctx.baseline), peers) ?? 0,
      rival: rival ? scoreAgainst(def, rival.values[def.key] ?? null, peers) ?? 0 : undefined,
    };
  }), [ctx.sellers, ctx.team, ctx.baseline, me, rival]);

  // Em quantos KPIs (com sentido) o vendedor está melhor que a base.
  const tally = useMemo(() => {
    let good = 0, bad = 0;
    KPIS.forEach(def => {
      const d = delta(def, me?.values[def.key] ?? null, baselineValue(ctx.team, def.key, ctx.baseline));
      if (d?.good === true) good++;
      if (d?.good === false) bad++;
    });
    return { good, bad };
  }, [me, ctx.team, ctx.baseline]);

  const rankOf = (key: string) => standing(KPI_BY_KEY[key], me?.values[key] ?? null, ctx.sellers.map(s => s.values[key]));
  const rNeg = rankOf('neg'), rRet = rankOf('ret');
  if (!me) return <Empty text="Este vendedor não teve atividade no período selecionado." />;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
        {/* Cabeçalho do vendedor */}
        <div className="bg-card border border-border rounded-lg p-3 space-y-2.5">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-full flex items-center justify-center text-white font-bold text-sm" style={{ background: C.focus }}>
              {ctx.focus.slice(0, 3)}
            </div>
            <div className="min-w-0">
              <div className="text-base font-bold leading-tight">{ctx.focus}</div>
              <div className="text-[11px] text-muted-foreground">
                {me.values.neg ?? 0} negócios · {me.values.ret ?? 0} retails · {ctx.sellers.length} vendedores ativos
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <RankBadge label="Negócios" rank={rNeg.rank} of={rNeg.of} />
            <RankBadge label="Retails" rank={rRet.rank} of={rRet.of} />
          </div>
          <div className="rounded-md bg-muted/50 px-2.5 py-2 text-[11px]">
            Face à <strong>{BASE_LABEL[ctx.baseline].toLowerCase()}</strong>:{' '}
            <strong className="text-green-600 dark:text-green-400">{tally.good} KPIs melhores</strong> ·{' '}
            <strong className="text-red-600 dark:text-red-400">{tally.bad} piores</strong>
          </div>
          <InsightList title="Pontos fortes" tone="good" rows={strengths} ctx={ctx} />
          <InsightList title="A melhorar" tone="bad" rows={weaknesses} ctx={ctx} />
        </div>

        {/* Radar */}
        <div className="bg-card border border-border rounded-lg p-2">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-[11px] font-semibold text-muted-foreground uppercase">Perfil comparado</h3>
            <span className="text-[10px] text-muted-foreground">0 = pior da equipa · 100 = melhor (lead time invertido)</span>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <RadarChart data={radar} outerRadius="72%">
              <PolarGrid stroke="hsl(var(--border))" />
              <PolarAngleAxis dataKey="axis" tick={{ fontSize: 10, fill: 'hsl(var(--foreground))' }} />
              <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 9 }} tickCount={5} />
              <Radar name={BASE_LABEL[ctx.baseline]} dataKey="base" stroke={C.base} fill={C.base} fillOpacity={0.15} strokeDasharray="4 3" />
              {rival && <Radar name={rival.resp} dataKey="rival" stroke={C.rival} fill={C.rival} fillOpacity={0.12} />}
              <Radar name={ctx.focus} dataKey="focus" stroke={C.focus} fill={C.focus} fillOpacity={0.3} strokeWidth={2} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {GROUPS.map(g => {
        const defs = KPIS.filter(k => k.group === g.key);
        return (
          <section key={g.key}>
            <h3 className="text-[11px] font-semibold text-muted-foreground uppercase px-1 mb-1">{g.label}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
              {defs.map(def => <KpiCard key={def.key} def={def} ctx={ctx} />)}
            </div>
          </section>
        );
      })}
      <p className="text-[10px] text-muted-foreground px-1">
        Em cada cartão, a linha mostra todos os vendedores — mais à direita é sempre melhor.
        Ponto azul = {ctx.focus}; traço cinzento = {BASE_LABEL[ctx.baseline].toLowerCase()}; clicar num ponto muda o foco.
      </p>
    </div>
  );
}

function RankBadge({ label, rank, of }: { label: string; rank: number | null; of: number }) {
  return (
    <div className="rounded-md border border-border px-2.5 py-1.5">
      <div className="text-[10px] text-muted-foreground uppercase">{label}</div>
      <div className="flex items-center gap-1.5">
        {rank === 1 && <Trophy className="h-4 w-4 text-amber-500" fill="#fde68a" />}
        <span className="text-lg font-bold tabular-nums">{rank ?? '—'}.º</span>
        <span className="text-[10px] text-muted-foreground">de {of}</span>
      </div>
    </div>
  );
}

function InsightList({ title, tone, rows, ctx }: {
  title: string; tone: 'good' | 'bad'; rows: ReturnType<typeof insights>['strengths']; ctx: CompareCtx;
}) {
  if (rows.length === 0) return null;
  const color = tone === 'good' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';
  return (
    <div>
      <div className={`text-[10px] font-semibold uppercase ${color}`}>{title}</div>
      <ul className="mt-0.5 space-y-0.5">
        {rows.map(r => (
          <li key={r.def.key} className="flex items-center justify-between text-[11px]" title={r.def.hint}>
            <span>{r.def.label}</span>
            <span className="tabular-nums text-muted-foreground">
              <strong className="text-foreground">{formatKpi(r.def, r.value)}</strong> · #{r.st.rank}/{r.st.of}
            </span>
          </li>
        ))}
      </ul>
      <span className="sr-only">{ctx.focus}</span>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="bg-card border border-border rounded-lg p-8 text-center text-xs text-muted-foreground">{text}</div>;
}

/* ── Ranking (mapa de calor) ─────────────────────────────────────────────── */

export function RankingView({ ctx }: { ctx: CompareCtx }) {
  const [group, setGroup] = useState<string>('all');
  const [mode, setMode] = useState<'valor' | 'posicao'>('valor');
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'neg', dir: 'desc' });
  const cols = KPIS.filter(k => group === 'all' || k.group === group);

  const rows = useMemo(() => {
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...ctx.sellers].sort((a, b) => {
      if (sort.key === 'resp') return a.resp.localeCompare(b.resp, 'pt') * dir;
      const av = a.values[sort.key], bv = b.values[sort.key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return (av - bv) * dir;
    });
  }, [ctx.sellers, sort]);

  const toggle = (key: string) => setSort(s => s.key === key
    ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
    : { key, dir: key === 'resp' || KPI_BY_KEY[key]?.better === 'low' ? 'asc' : 'desc' });

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-2 py-1.5 border-b border-border">
        <h3 className="text-[11px] font-semibold text-muted-foreground uppercase mr-1">Mapa de calor</h3>
        <Seg value={group} onChange={setGroup}
          options={[{ key: 'all', label: 'Tudo' }, ...GROUPS.map(g => ({ key: g.key, label: g.label }))]} />
        <div className="ml-auto"><Seg value={mode} onChange={v => setMode(v as 'valor' | 'posicao')}
          options={[{ key: 'valor', label: 'Valores' }, { key: 'posicao', label: 'Posição' }]} /></div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="bg-muted/40 text-[10px] text-muted-foreground">
              <th onClick={() => toggle('resp')} className="sticky left-0 z-10 bg-muted px-2 py-1.5 text-left font-medium cursor-pointer select-none">Vendedor</th>
              {cols.map(c => {
                const active = sort.key === c.key;
                return (
                  <th key={c.key} onClick={() => toggle(c.key)} title={c.hint}
                    className="px-2 py-1.5 text-right font-medium cursor-pointer select-none whitespace-nowrap hover:text-foreground">
                    <span className="inline-flex items-center gap-0.5">
                      {c.short}
                      {active ? (sort.dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-30" />}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {rows.map(s => {
              const isFocus = s.resp === ctx.focus, isRival = s.resp === ctx.rival;
              return (
                <tr key={s.resp} onClick={() => ctx.setFocus(s.resp)} className="cursor-pointer hover:bg-muted/40">
                  <td className={`sticky left-0 z-10 px-2 py-1 font-semibold whitespace-nowrap ${isFocus ? 'bg-sky-50 dark:bg-sky-950' : 'bg-card'}`}
                    style={{ borderLeft: `3px solid ${isFocus ? C.focus : isRival ? C.rival : 'transparent'}` }}>
                    {s.resp}
                  </td>
                  {cols.map(c => {
                    const st = standing(c, s.values[c.key], ctx.sellers.map(x => x.values[c.key]));
                    return (
                      <td key={c.key} className="px-2 py-1 text-right tabular-nums" style={{ background: heat(st.score) }}>
                        {mode === 'valor' ? formatKpi(c, s.values[c.key]) : st.rank != null ? `${st.rank}.º` : '—'}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            <SummaryRow label="Equipa" cols={cols} ctx={ctx} pick={k => baselineValue(ctx.team, k, 'media')} />
            <SummaryRow label="Mediana" cols={cols} ctx={ctx} pick={k => baselineValue(ctx.team, k, 'mediana')} />
            <SummaryRow label="Melhor" cols={cols} ctx={ctx} pick={k => baselineValue(ctx.team, k, 'melhor')} />
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-muted-foreground px-2 py-1.5 border-t border-border">
        Verde = melhor da equipa, vermelho = pior (lead time e idade: menos é melhor). KPIs sem sentido (R, carteira) não são coloridos.
        Clicar numa linha muda o vendedor em foco; clicar num cabeçalho ordena.
      </p>
    </div>
  );
}

function SummaryRow({ label, cols, pick }: {
  label: string; cols: typeof KPIS; ctx: CompareCtx; pick: (key: string) => number | null;
}) {
  return (
    <tr className="bg-muted/40 text-muted-foreground font-medium">
      <td className="sticky left-0 z-10 bg-muted px-2 py-1">{label}</td>
      {cols.map(c => <td key={c.key} className="px-2 py-1 text-right tabular-nums">{formatKpi(c, pick(c.key))}</td>)}
    </tr>
  );
}

/* ── Evolução mensal ─────────────────────────────────────────────────────── */

const ratio = (a: number, b: number): number | null => (b ? Math.round((a / b) * 100) : null);
const SERIES: { key: string; label: string; unit: '' | '%'; count: boolean; get: (m: MonthAgg) => number | null }[] = [
  { key: 'neg', label: 'Negócios', unit: '', count: true, get: m => m.neg },
  { key: 'ret', label: 'Retails', unit: '', count: true, get: m => m.ret },
  { key: 'bev', label: '% BEV', unit: '%', count: false, get: m => ratio(m.bev, m.neg) },
  { key: 'qor', label: '% QoR', unit: '%', count: false, get: m => ratio(m.qor, m.neg) },
  { key: 'fs', label: '% FS', unit: '%', count: false, get: m => ratio(m.fs, m.neg) },
  { key: 'retoma', label: '% Retomas', unit: '%', count: false, get: m => ratio(m.retoma, m.ret) },
];

export function EvolutionView({ ctx }: { ctx: CompareCtx }) {
  const [serie, setSerie] = useState('ret');
  const [cumul, setCumul] = useState(false);
  const def = SERIES.find(s => s.key === serie) ?? SERIES[0];
  const me = find(ctx, ctx.focus), rival = find(ctx, ctx.rival);
  const canCumul = def.count;

  const data = useMemo(() => {
    const keys = Object.keys(ctx.team.monthly).map(Number).sort((a, b) => a - b);
    if (keys.length === 0) return [];
    const months: number[] = [];
    for (let k = keys[0]; k <= keys[keys.length - 1]; k = k % 100 === 12 ? (Math.floor(k / 100) + 1) * 100 + 1 : k + 1) months.push(k);
    const size = Math.max(1, ctx.team.size);
    let accMe = 0, accTeam = 0, accRival = 0;
    return months.map(k => {
      const mm = (src?: Partial<Record<number, MonthAgg>>) => src?.[k] ?? { neg: 0, ret: 0, bev: 0, qor: 0, fs: 0, retoma: 0 };
      const teamV = def.count ? (def.get(mm(ctx.team.monthly)) ?? 0) / size : def.get(mm(ctx.team.monthly));
      const meV = def.get(mm(me?.monthly));
      const rivalV = rival ? def.get(mm(rival.monthly)) : null;
      if (cumul && canCumul) {
        accMe += meV ?? 0; accTeam += teamV ?? 0; accRival += rivalV ?? 0;
        return { label: monthLabel(k), focus: accMe, team: +accTeam.toFixed(1), rival: rival ? accRival : null };
      }
      return { label: monthLabel(k), focus: meV, team: teamV == null ? null : +Number(teamV).toFixed(1), rival: rivalV };
    });
  }, [ctx.team, me, rival, def, cumul, canCumul]);

  return (
    <div className="bg-card border border-border rounded-lg p-2">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <h3 className="text-[11px] font-semibold text-muted-foreground uppercase mr-1">Evolução mensal</h3>
        <Seg value={serie} onChange={setSerie} options={SERIES.map(s => ({ key: s.key, label: s.label }))} />
        {canCumul && (
          <label className="ml-auto flex items-center gap-1.5 text-[11px] cursor-pointer select-none">
            <input type="checkbox" checked={cumul} onChange={e => setCumul(e.target.checked)} /> Acumulado
          </label>
        )}
      </div>
      {data.length === 0 ? <Empty text="Sem registos no período." /> : (
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} unit={def.unit} allowDecimals={false} domain={def.unit === '%' ? [0, 100] : [0, 'auto']} />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <Bar dataKey="focus" name={ctx.focus} fill={C.focus} radius={[3, 3, 0, 0]} maxBarSize={36} />
            {rival && <Bar dataKey="rival" name={rival.resp} fill={C.rival} radius={[3, 3, 0, 0]} maxBarSize={36} />}
            <Line type="monotone" dataKey="team" name={def.count ? 'Média por vendedor' : 'Equipa'} stroke="#64748B"
              strokeWidth={2} strokeDasharray="5 3" connectNulls dot={{ r: 2.5 }} />
          </ComposedChart>
        </ResponsiveContainer>
      )}
      <p className="text-[10px] text-muted-foreground px-1">
        Negócios por mês de negócio, retails por mês de retail. {def.count ? 'A linha é a média por vendedor ativo.' : 'A linha é o valor agregado da equipa; meses sem amostra ficam em branco.'}
      </p>
    </div>
  );
}

/* ── Dispersão ───────────────────────────────────────────────────────────── */

const SCATTER_DEFAULT = { x: 'neg', y: 'qorPct' };

export function ScatterView({ ctx }: { ctx: CompareCtx }) {
  const [x, setX] = useState(SCATTER_DEFAULT.x);
  const [y, setY] = useState(SCATTER_DEFAULT.y);
  const dx = KPI_BY_KEY[x], dy = KPI_BY_KEY[y];
  const pts = ctx.sellers
    .map(s => ({ resp: s.resp, x: s.values[x], y: s.values[y], z: Math.max(1, s.values.ret ?? 1) }))
    .filter((p): p is { resp: string; x: number; y: number; z: number } => p.x != null && p.y != null);
  const mx = ctx.team.pooled[x], my = ctx.team.pooled[y];

  const shape = (props: { cx?: number; cy?: number; payload?: { resp: string }; r?: number }) => {
    const { cx = 0, cy = 0, payload } = props;
    const resp = payload?.resp ?? '';
    const isFocus = resp === ctx.focus, isRival = resp === ctx.rival;
    const fill = isFocus ? C.focus : isRival ? C.rival : '#64748B';
    return (
      <g onClick={() => ctx.setFocus(resp)} style={{ cursor: 'pointer' }}>
        <circle cx={cx} cy={cy} r={isFocus ? 11 : 8} fill={fill} fillOpacity={isFocus || isRival ? 0.85 : 0.5} stroke="#fff" strokeWidth={isFocus ? 2 : 1} />
        <text x={cx} y={cy - 13} textAnchor="middle" fontSize={10} fontWeight={isFocus ? 700 : 500} fill="hsl(var(--foreground))">{resp}</text>
      </g>
    );
  };

  return (
    <div className="bg-card border border-border rounded-lg p-2">
      <div className="flex flex-wrap items-center gap-3 mb-2">
        <h3 className="text-[11px] font-semibold text-muted-foreground uppercase">Dispersão</h3>
        <KpiSelect label="Eixo X" value={x} onChange={setX} />
        <KpiSelect label="Eixo Y" value={y} onChange={setY} />
        <button className="text-[11px] text-primary hover:underline" onClick={() => { setX(y); setY(x); }}>Trocar eixos</button>
      </div>
      {pts.length === 0 ? <Empty text="Sem dados suficientes para este par de KPIs." /> : (
        <ResponsiveContainer width="100%" height={380}>
          <ScatterChart margin={{ top: 22, right: 24, bottom: 18, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis type="number" dataKey="x" name={dx.label} tick={{ fontSize: 10 }} domain={['auto', 'auto']}
              label={{ value: dx.label, position: 'insideBottom', offset: -8, fontSize: 10 }} reversed={dx.better === 'low'} />
            <YAxis type="number" dataKey="y" name={dy.label} tick={{ fontSize: 10 }} domain={['auto', 'auto']}
              label={{ value: dy.label, angle: -90, position: 'insideLeft', fontSize: 10 }} reversed={dy.better === 'low'} />
            <ZAxis type="number" dataKey="z" range={[60, 360]} name="Retails" />
            {mx != null && <ReferenceLine x={mx} stroke={C.base} strokeDasharray="4 4" />}
            {my != null && <ReferenceLine y={my} stroke={C.base} strokeDasharray="4 4" />}
            <Tooltip contentStyle={tooltipStyle} cursor={{ strokeDasharray: '3 3' }}
              formatter={(v: number, name: string) => [name === dx.label ? formatKpi(dx, v) : name === dy.label ? formatKpi(dy, v) : v, name]}
              labelFormatter={() => ''} />
            <Scatter data={pts} shape={shape as never} isAnimationActive={false} />
          </ScatterChart>
        </ResponsiveContainer>
      )}
      <p className="text-[10px] text-muted-foreground px-1">
        Cada bolha é um vendedor (tamanho = retails). Eixos orientados para que o canto superior direito seja sempre o melhor;
        linhas tracejadas = média/agregado da equipa. Clicar numa bolha passa-a a foco.
      </p>
    </div>
  );
}

function KpiSelect({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
      {label}
      <select value={value} onChange={e => onChange(e.target.value)}
        className="rounded-md border border-border bg-background px-1.5 py-1 text-[11px] text-foreground">
        {GROUPS.map(g => (
          <optgroup key={g.key} label={g.label}>
            {KPIS.filter(k => k.group === g.key).map(k => <option key={k.key} value={k.key}>{k.label}</option>)}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

/* ── Mix ─────────────────────────────────────────────────────────────────── */

type MixKey = 'models' | 'types' | 'fin';
const MIX_TABS: { key: MixKey; label: string; top: number }[] = [
  { key: 'models', label: 'Modelos', top: 8 },
  { key: 'types', label: 'Tipo de negócio', top: 6 },
  { key: 'fin', label: 'Pagamento', top: 6 },
];

export function MixView({ ctx }: { ctx: CompareCtx }) {
  const [tab, setTab] = useState<MixKey>('models');
  const me = find(ctx, ctx.focus), rival = find(ctx, ctx.rival);
  const def = MIX_TABS.find(t => t.key === tab) ?? MIX_TABS[0];

  const data = useMemo(() => {
    const total: Record<string, number> = {};
    ctx.sellers.forEach(s => Object.entries(s[tab]).forEach(([k, v]) => { total[k] = (total[k] ?? 0) + v; }));
    const share = (src: Record<string, number> | undefined, k: string) => {
      const sum = Object.values(src ?? {}).reduce((t, v) => t + v, 0);
      return sum ? Math.round(((src?.[k] ?? 0) / sum) * 1000) / 10 : 0;
    };
    return Object.keys(total).sort((a, b) => total[b] - total[a]).slice(0, def.top).map(k => ({
      name: k,
      focus: share(me?.[tab], k),
      team: share(total, k),
      rival: rival ? share(rival[tab], k) : undefined,
      n: me?.[tab][k] ?? 0,
    }));
  }, [ctx.sellers, tab, me, rival, def.top]);

  return (
    <div className="bg-card border border-border rounded-lg p-2">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <h3 className="text-[11px] font-semibold text-muted-foreground uppercase mr-1">Mix de negócios</h3>
        <Seg value={tab} onChange={v => setTab(v as MixKey)} options={MIX_TABS.map(t => ({ key: t.key, label: t.label }))} />
      </div>
      {data.length === 0 ? <Empty text="Sem negócios no período." /> : (
        <ResponsiveContainer width="100%" height={Math.max(220, data.length * (rival ? 62 : 48) + 40)}>
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 36 }} barGap={2}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 10 }} unit="%" />
            <YAxis type="category" dataKey="name" width={96} tick={{ fontSize: 10 }} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `${v}%`} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <Bar dataKey="focus" name={ctx.focus} fill={C.focus} radius={[0, 3, 3, 0]} maxBarSize={14}
              label={{ position: 'right', fontSize: 9, formatter: (v: number) => (v ? `${v}%` : '') }} />
            {rival && <Bar dataKey="rival" name={rival.resp} fill={C.rival} radius={[0, 3, 3, 0]} maxBarSize={14} />}
            <Bar dataKey="team" name="Equipa" fill={C.base} radius={[0, 3, 3, 0]} maxBarSize={14} />
          </BarChart>
        </ResponsiveContainer>
      )}
      <p className="text-[10px] text-muted-foreground px-1">% dos negócios fechados no período de cada um (a equipa é o agregado de todos).</p>
    </div>
  );
}

/* ── Frente a frente ─────────────────────────────────────────────────────── */

export function HeadToHeadView({ ctx }: { ctx: CompareCtx }) {
  const a = find(ctx, ctx.focus), b = find(ctx, ctx.rival);
  const others = ctx.sellers.filter(s => s.resp !== ctx.focus);
  if (!a) return <Empty text="Este vendedor não teve atividade no período selecionado." />;

  const picker = (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] font-semibold uppercase text-muted-foreground mr-1">Adversário</span>
      {others.map(s => (
        <Chip key={s.resp} active={s.resp === ctx.rival} color={C.rival} onClick={() => ctx.setRival(s.resp === ctx.rival ? null : s.resp)}>{s.resp}</Chip>
      ))}
    </div>
  );
  if (!b) {
    return (
      <div className="bg-card border border-border rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold"><Swords className="h-4 w-4" /> Escolhe um colega para o frente a frente com {ctx.focus}</div>
        {picker}
      </div>
    );
  }

  const h = headToHead(a, b);
  return (
    <div className="space-y-2">
      <div className="bg-card border border-border rounded-lg p-3 space-y-3">
        {picker}
        <div className="flex items-center justify-center gap-4">
          <Side name={a.resp} wins={h.winsA} color={C.focus} lead={h.winsA > h.winsB} />
          <div className="text-center">
            <Swords className="h-5 w-5 mx-auto text-muted-foreground" />
            <div className="text-[10px] text-muted-foreground">{h.ties > 0 ? `${h.ties} ${h.ties === 1 ? 'empate' : 'empates'}` : 'KPIs ganhos'}</div>
          </div>
          <Side name={b.resp} wins={h.winsB} color={C.rival} lead={h.winsB > h.winsA} />
        </div>
      </div>
      <div className="bg-card border border-border rounded-lg divide-y divide-border/60">
        {h.lines.map(l => {
          const max = Math.max(Math.abs(l.va ?? 0), Math.abs(l.vb ?? 0), 1e-9);
          return (
            <div key={l.def.key} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 py-1.5" title={l.def.hint}>
              <Bar2 value={l.va} max={max} def={l.def} color={C.focus} win={l.winner === 'a'} side="right" />
              <div className="w-28 sm:w-36 text-center text-[10px] font-medium text-muted-foreground uppercase leading-tight">{l.def.short}</div>
              <Bar2 value={l.vb} max={max} def={l.def} color={C.rival} win={l.winner === 'b'} side="left" />
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-muted-foreground px-1">KPIs sem sentido de “melhor/pior” (R, carteira) ficam fora da contagem. Em lead time e idade ganha quem tem menos dias.</p>
    </div>
  );
}

function Side({ name, wins, color, lead }: { name: string; wins: number; color: string; lead: boolean }) {
  return (
    <div className="text-center min-w-20">
      <div className="text-xs font-bold" style={{ color }}>{name}</div>
      <div className={`text-3xl font-extrabold tabular-nums ${lead ? '' : 'opacity-50'}`} style={{ color }}>{wins}</div>
    </div>
  );
}

function Bar2({ value, max, def, color, win, side }: {
  value: number | null; max: number; def: (typeof KPIS)[number]; color: string; win: boolean; side: 'left' | 'right';
}) {
  const w = value == null ? 0 : Math.max(2, (Math.abs(value) / max) * 100);
  return (
    <div className={`flex items-center gap-2 ${side === 'right' ? 'flex-row-reverse' : ''}`}>
      <span className={`text-[11px] tabular-nums w-12 ${side === 'right' ? 'text-left' : 'text-right'} ${win ? 'font-bold' : 'text-muted-foreground'}`}>
        {formatKpi(def, value)}
      </span>
      <div className={`flex-1 h-2.5 rounded bg-muted/50 flex ${side === 'right' ? 'justify-end' : ''}`}>
        <div className="h-full rounded" style={{ width: `${w}%`, background: color, opacity: win ? 1 : 0.4 }} />
      </div>
    </div>
  );
}

/* ── Controlos partilhados ───────────────────────────────────────────────── */

export function Seg({ value, onChange, options }: {
  value: string; onChange: (v: string) => void; options: { key: string; label: string }[];
}) {
  return (
    <div className="inline-flex flex-wrap rounded-md border border-border overflow-hidden" role="tablist">
      {options.map(o => (
        <button key={o.key} type="button" role="tab" aria-selected={value === o.key} onClick={() => onChange(o.key)}
          className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${value === o.key ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-accent'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chip({ active, color, onClick, children }: { active: boolean; color: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={`rounded-md border px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${active ? 'text-white' : 'bg-background text-foreground hover:bg-accent border-border'}`}
      style={active ? { background: color, borderColor: color } : undefined}>
      {children}
    </button>
  );
}

