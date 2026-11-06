import { AlertTriangle, ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import {
  MIN_SAMPLE, baselineValue, delta, formatDelta, formatKpi, standing, type KpiDef,
} from '@/lib/comparativo';
import { BASE_LABEL, C, type CompareCtx } from './shared';

/* Faixa de posição: todos os vendedores numa linha (clicar num ponto passa-o a
 * foco), com a marca da base de comparação e do colega escolhido. */
export function Strip({ def, ctx, baseValue }: { def: KpiDef; ctx: CompareCtx; baseValue: number | null }) {
  const pts = ctx.sellers
    .map(s => ({ resp: s.resp, v: s.values[def.key] }))
    .filter((p): p is { resp: string; v: number } => p.v != null);
  if (pts.length === 0) return <div className="h-5" />;
  const all = [...pts.map(p => p.v), ...(baseValue != null ? [baseValue] : [])];
  const min = Math.min(...all), max = Math.max(...all);
  const span = max - min || 1;
  const pos = (v: number) => 4 + ((v - min) / span) * 92;   // % dentro da linha, com margem
  // Para "menos é melhor" o melhor fica à direita (eixo invertido), para ler sempre "mais à direita = melhor".
  const x = (v: number) => (def.better === 'low' ? 100 - pos(v) : pos(v));
  return (
    <div className="relative h-5 mt-1" role="img" aria-label={`Posição dos vendedores em ${def.label}`}>
      <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
      {baseValue != null && (
        <span className="absolute top-0.5 bottom-0.5 w-0.5 rounded bg-slate-400" style={{ left: `${x(baseValue)}%` }}
          title={`${BASE_LABEL[ctx.baseline]}: ${formatKpi(def, baseValue)}`} />
      )}
      {pts.map(p => {
        const isFocus = p.resp === ctx.focus, isRival = p.resp === ctx.rival;
        return (
          <button key={p.resp} type="button" onClick={() => ctx.setFocus(p.resp)}
            title={`${p.resp}: ${formatKpi(def, p.v)}`}
            className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border transition-transform hover:scale-125 ${
              isFocus ? 'h-3.5 w-3.5 z-20 border-white shadow' : isRival ? 'h-3 w-3 z-10 border-white' : 'h-2 w-2 border-transparent opacity-70'}`}
            style={{ left: `${x(p.v)}%`, background: isFocus ? C.focus : isRival ? C.rival : '#64748B' }} />
        );
      })}
    </div>
  );
}

export function DeltaChip({ def, value, ref_ }: { def: KpiDef; value: number | null; ref_: number | null }) {
  const d = delta(def, value, ref_);
  if (!d) return <span className="text-[10px] text-muted-foreground">—</span>;
  const color = d.good === null ? 'text-muted-foreground' : d.good ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';
  const Icon = d.diff === 0 ? Minus : d.diff > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold tabular-nums ${color}`}>
      <Icon className="h-3 w-3" />{formatDelta(def, d.diff)}
    </span>
  );
}

export function KpiCard({ def, ctx }: { def: KpiDef; ctx: CompareCtx }) {
  const me = ctx.sellers.find(s => s.resp === ctx.focus);
  const rival = ctx.rival ? ctx.sellers.find(s => s.resp === ctx.rival) : undefined;
  const value = me?.values[def.key] ?? null;
  const base = baselineValue(ctx.team, def.key, ctx.baseline);
  const st = standing(def, value, ctx.sellers.map(s => s.values[def.key]));
  const n = me?.n[def.key];
  const small = def.rate && n != null && n > 0 && n < MIN_SAMPLE && def.key !== 'ating' && def.key !== 'r';
  const rivalValue = rival?.values[def.key] ?? null;
  const medal = st.rank === 1 ? 'text-amber-500' : 'text-muted-foreground';

  return (
    <div className="bg-card border border-border rounded-lg p-2.5 flex flex-col" title={def.hint}>
      <div className="flex items-start justify-between gap-2">
        <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide leading-tight">{def.label}</div>
        {st.rank != null && (
          <span className={`text-[10px] font-bold tabular-nums whitespace-nowrap ${medal}`} title={`${st.rank}.º de ${st.of}`}>
            #{st.rank}<span className="font-normal text-muted-foreground">/{st.of}</span>
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-2 mt-0.5">
        <span className="text-2xl font-bold tabular-nums" style={{ color: C.focus }}>{formatKpi(def, value)}</span>
        {small && (
          <span title={`Amostra pequena (n=${n}): ler com cautela`} className="text-amber-500 inline-flex items-center gap-0.5 text-[10px]">
            <AlertTriangle className="h-3 w-3" />n={n}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
        <DeltaChip def={def} value={value} ref_={base} />
        <span>vs {BASE_LABEL[ctx.baseline].toLowerCase()} <strong className="text-foreground/80">{formatKpi(def, base)}</strong></span>
      </div>
      {rival && (
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <DeltaChip def={def} value={value} ref_={rivalValue} />
          <span>vs <strong style={{ color: C.rival }}>{rival.resp}</strong> <strong className="text-foreground/80">{formatKpi(def, rivalValue)}</strong></span>
        </div>
      )}
      <Strip def={def} ctx={ctx} baseValue={base} />
    </div>
  );
}
