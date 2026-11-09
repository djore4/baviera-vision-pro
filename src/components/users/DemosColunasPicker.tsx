import { useMemo } from 'react';
import { Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DEMO_COL_DEFS, DEMO_COL_GROUPS, demoColPerm, demoColRequires, toggleDemoCol, coherentDemoCols,
  type DemoColKey,
} from '@/lib/demoColunas';
import type { AccessLevel } from '@/lib/permissions';

/* Colunas de preço do tab Demos visíveis para uma função. Cada coluna é uma chave
 * 'demos:col:<coluna>' (valor 'view'). Uma coluna calculada exige as colunas de que
 * depende (ligar traz-as, desligar uma leva as que dependem dela): ver demoColunas.ts. */
export function DemosColunasPicker({ perms, onChange }: {
  perms: Record<string, AccessLevel>;
  /** Altera as chaves indicadas ('view' liga, 'none' desliga). */
  onChange: (patch: Record<string, AccessLevel>) => void;
}) {
  const granted = useMemo(
    () => new Set(DEMO_COL_DEFS.filter(c => (perms[demoColPerm(c.key)] ?? 'none') !== 'none').map(c => c.key)),
    [perms],
  );
  // Dados antigos podem ter uma coluna sem as suas dependências: o que a base de dados envia é a união.
  const effective = useMemo(() => coherentDemoCols(granted), [granted]);

  const apply = (next: ReadonlySet<DemoColKey>) => {
    const patch: Record<string, AccessLevel> = {};
    DEMO_COL_DEFS.forEach(c => { patch[demoColPerm(c.key)] = next.has(c.key) ? 'view' : 'none'; });
    onChange(patch);
  };

  return (
    <div className="mt-1 ml-3 border-l-2 border-border pl-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground" title="Só as colunas escolhidas são enviadas ao browser desta função. O administrador vê sempre tudo.">
          Colunas de preço visíveis <span className="tabular-nums">({effective.size}/{DEMO_COL_DEFS.length})</span>
        </span>
        <div className="flex items-center gap-1 text-[11px]">
          <button type="button" onClick={() => apply(new Set(DEMO_COL_DEFS.map(c => c.key)))} className="rounded border border-border bg-background px-1.5 py-0.5 hover:bg-accent">Todas</button>
          <button type="button" onClick={() => apply(new Set())} className="rounded border border-border bg-background px-1.5 py-0.5 hover:bg-accent">Nenhuma</button>
        </div>
      </div>
      {DEMO_COL_GROUPS.map(g => (
        <div key={g.key} className="flex flex-wrap items-center gap-1.5">
          <span className="w-32 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{g.label}</span>
          {DEMO_COL_DEFS.filter(c => c.group === g.key).map(c => {
            const on = effective.has(c.key);
            // Está ligada só por ser pré-requisito de outra? Não se pode desligar sem desligar essa.
            const requiredBy = on ? DEMO_COL_DEFS.filter(o => o.key !== c.key && effective.has(o.key) && demoColRequires(o.key).includes(c.key)) : [];
            return (
              <button
                key={c.key} type="button" aria-pressed={on}
                onClick={() => apply(toggleDemoCol(effective, c.key, !on))}
                title={`${c.hint}${requiredBy.length ? ` — necessária para ${requiredBy.map(o => o.label).join(', ')}` : ''}`}
                className={cn(
                  'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold transition-colors',
                  on ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground hover:text-foreground',
                )}
              >
                {c.label}
                {requiredBy.length > 0 && <Lock className="h-2.5 w-2.5 opacity-70" aria-label="necessária para outras colunas" />}
              </button>
            );
          })}
        </div>
      ))}
      <p className="text-[11px] text-muted-foreground leading-snug">
        Colunas calculadas (PVP, DSC €, P Custo, Margem…) trazem consigo as de que dependem — caso contrário os valores de base chegariam ao browser na mesma.
      </p>
    </div>
  );
}
