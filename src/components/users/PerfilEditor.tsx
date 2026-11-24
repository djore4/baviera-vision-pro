import { PERMISSION_TABS, AREAS, SUB_PERMISSIONS, type AccessLevel, type AppCapabilities } from '@/lib/permissions';
import { linhaDe, type Onde } from '@/lib/perfil-linha';
import { cn } from '@/lib/utils';

/* Um perfil, uma lista: cada tab com 3 botões (sem acesso / consulta / edição) e, se tiver acesso,
 * "onde" vale. Pensado para ecrãs pequenos: tudo na vertical, sem scroll lateral. */

const NIVEIS: { value: AccessLevel; label: string; on: string }[] = [
  { value: 'none', label: 'Sem acesso', on: 'bg-muted text-foreground' },
  { value: 'view', label: 'Consulta', on: 'bg-sky-100 text-sky-800 dark:bg-sky-500/25 dark:text-sky-100' },
  { value: 'edit', label: 'Edição', on: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/25 dark:text-emerald-100' },
];
const ONDE: { value: Onde; label: string }[] = [
  { value: 'todos', label: 'Em todos os locais' },
  { value: 'aveiro', label: 'Só em Aveiro (e sem local)' },
  { value: 'outros', label: 'Só nos outros locais' },
];

function Seletor({ valor, nome, onChange, fina }: { valor: AccessLevel; nome: string; onChange: (v: AccessLevel) => void; fina?: boolean }) {
  const opcoes = fina ? [{ value: 'none' as const, label: 'Não', on: NIVEIS[0].on }, { value: 'edit' as const, label: 'Sim', on: NIVEIS[2].on }] : NIVEIS;
  return (
    <div role="radiogroup" aria-label={nome} className="flex w-full overflow-hidden rounded-md border border-border">
      {opcoes.map(o => (
        <button key={o.value} type="button" role="radio" aria-checked={valor === o.value} onClick={() => onChange(o.value)}
          className={cn('flex-1 px-2 py-1.5 text-xs font-medium border-l border-border first:border-l-0 transition-colors',
            valor === o.value ? o.on : 'bg-background text-muted-foreground hover:bg-accent')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function PerfilEditor({ draft, capabilities, onNivel, onOnde }: {
  draft: { completo: Record<string, AccessLevel>; outros: Record<string, AccessLevel> };
  capabilities: AppCapabilities;
  onNivel: (keys: string[], nivel: AccessLevel) => void;
  onOnde: (key: string, onde: Onde) => void;
}) {
  const linha = (key: string) => linhaDe(draft.completo[key] ?? 'none', draft.outros[key] ?? 'none');

  const controlo = (key: string, nome: string, fina = false) => {
    const l = linha(key);
    return (
      <div className="space-y-1.5">
        <Seletor valor={l.nivel} nome={nome} fina={fina} onChange={v => onNivel([key], v)} />
        {l.onde && (
          <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
            Onde
            <select aria-label={`${nome}: onde`} value={l.onde} onChange={e => onOnde(key, e.target.value as Onde)}
              className="h-7 flex-1 rounded-md border border-border bg-background px-2 text-xs text-foreground">
              {ONDE.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {l.misto && <span title="Os níveis eram diferentes em Aveiro e nos outros locais; ao alterar passam a ser iguais." className="text-amber-600">⚠</span>}
          </label>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {AREAS.map(area => {
        const tabs = PERMISSION_TABS.filter(t => t.area === area.key);
        if (tabs.length === 0) return null;
        const keys = tabs.map(t => t.key);
        const comAcesso = tabs.filter(t => linha(t.key).nivel !== 'none').length;
        return (
          <section key={area.key} data-area={area.key} className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 bg-muted/40 px-3 py-2">
              <h4 className={cn('text-xs font-bold uppercase tracking-wide', area.style === 'admin' ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground')}>
                {area.label} <span className="font-normal normal-case tracking-normal">· {comAcesso}/{tabs.length} com acesso</span>
              </h4>
              <div className="flex items-center gap-1 text-[11px]">
                <span className="text-muted-foreground">Todos:</span>
                {NIVEIS.map(n => (
                  <button key={n.value} type="button" aria-label={`${area.label}: ${n.label} em todos os tabs`} onClick={() => onNivel(keys, n.value)}
                    className="rounded border border-border bg-background px-1.5 py-0.5 hover:bg-accent">{n.label}</button>
                ))}
              </div>
            </div>
            <ul className="divide-y divide-border/60">
              {tabs.map(t => (
                <li key={t.key} className="px-3 py-2 space-y-1.5">
                  <div className="text-sm font-medium">{t.label}</div>
                  {controlo(t.key, t.label)}
                  {SUB_PERMISSIONS.filter(sp => sp.parent === t.key && capabilities[sp.capability]).map(sp => (
                    <div key={sp.key} className="ml-2 border-l-2 border-border pl-3 pt-1.5 space-y-1.5">
                      <div className="text-xs text-muted-foreground" title={sp.hint}>{sp.label}</div>
                      {controlo(sp.key, sp.label, true)}
                    </div>
                  ))}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
