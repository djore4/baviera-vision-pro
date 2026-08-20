import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle, Loader2, TrendingUp, Trophy, Handshake, Users, CheckCircle2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  FASES, faseLabel,
  listAccounts, listTasks, isOverdue,
  type Account, type Task, type Scope, type Fase,
} from '@/lib/prospec';
import { SectionCard, Avatar, EmptyState, relativeLabel } from './ui';

const typeLabel: Record<Task['type'], string> = { todo: 'Tarefa', next_action: 'Próxima ação' };

/* Cores sólidas por fase para as barras do funil. */
const FASE_BAR: Record<Fase, string> = {
  novo: 'bg-slate-400', contactado: 'bg-sky-500', reuniao: 'bg-indigo-500',
  proposta: 'bg-violet-500', negociacao: 'bg-amber-500', ganho: 'bg-emerald-500', perdido: 'bg-rose-500',
};

export function ManagementTab() {
  const scope: Scope = useMemo(() => ({ isDirector: true, email: null }), []);
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [overdue, setOverdue] = useState<Task[]>([]);

  const load = useCallback(async () => {
    try {
      const [acc, openTasks] = await Promise.all([
        listAccounts(scope),
        listTasks(scope, { done: false }),
      ]);
      setAccounts(acc);
      setOverdue(openTasks.filter(isOverdue).sort((a, b) => new Date(a.due_at!).getTime() - new Date(b.due_at!).getTime()));
    } catch (e) { toast.error((e as Error).message); setAccounts([]); }
  }, [scope]);
  useEffect(() => { load(); }, [load]);

  const funnel = useMemo(() => {
    const counts = new Map<string, number>();
    (accounts ?? []).forEach(a => counts.set(a.fase, (counts.get(a.fase) ?? 0) + 1));
    const max = Math.max(1, ...FASES.map(f => counts.get(f.value) ?? 0));
    const total = (accounts ?? []).length || 1;
    return FASES.map(f => {
      const n = counts.get(f.value) ?? 0;
      return { ...f, n, pct: (n / max) * 100, share: Math.round((n / total) * 100) };
    });
  }, [accounts]);

  const accountName = (id: string | null) => id ? accounts?.find(a => a.id === id)?.nome ?? null : null;

  if (accounts === null) {
    return <div className="flex items-center justify-center py-20 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" />A carregar…</div>;
  }

  const total = accounts.length;
  const emNegociacao = accounts.filter(a => ['reuniao', 'proposta', 'negociacao'].includes(a.fase)).length;

  return (
    <div className="space-y-4 animate-fade-in">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi icon={Users} label="Contas totais" value={total} tone="blue" />
        <Kpi icon={Trophy} label="Ganhas" value={accounts.filter(a => a.fase === 'ganho').length} tone="green" />
        <Kpi icon={Handshake} label="Em negociação" value={emNegociacao} tone="amber" />
        <Kpi icon={AlertTriangle} label="Atrasados (equipa)" value={overdue.length} tone={overdue.length ? 'red' : 'slate'} />
      </div>

      {/* Funil consolidado */}
      <SectionCard icon={TrendingUp} title="Funil consolidado">
        <div className="space-y-2.5">
          {funnel.map(f => (
            <div key={f.value} className="flex items-center gap-3">
              <span className="w-32 shrink-0 text-xs font-medium">{faseLabel(f.value)}</span>
              <div className="flex-1 h-6 rounded-md bg-muted/60 overflow-hidden">
                <div
                  className={cn('h-full rounded-md transition-all duration-500 flex items-center justify-end pr-2', FASE_BAR[f.value])}
                  style={{ width: `${Math.max(f.pct, f.n ? 8 : 0)}%` }}
                >
                  {f.n > 0 && <span className="text-[11px] font-bold text-white/95">{f.n}</span>}
                </div>
              </div>
              <span className="w-10 text-right text-[11px] text-muted-foreground tabular-nums">{f.share}%</span>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Atrasados de toda a equipa */}
      <SectionCard icon={AlertTriangle} title="Atrasados — toda a equipa" count={overdue.length} tone="danger">
        {overdue.length === 0
          ? <EmptyState icon={CheckCircle2} title="Equipa em dia" hint="Nenhuma tarefa em atraso em toda a equipa." />
          : (
            <div className="space-y-2">
              {overdue.map(t => {
                const rel = relativeLabel(t.due_at, t.done);
                return (
                  <div key={t.id} className="flex items-center gap-3 rounded-lg border border-destructive/20 bg-card px-3 py-2">
                    <Avatar name={t.owner_nome ?? t.owner_email ?? '—'} size="sm" rounded="full" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{t.descricao}</div>
                      <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground mt-0.5">
                        <span>{typeLabel[t.type]}</span>
                        {accountName(t.account_id) && <span>· {accountName(t.account_id)}</span>}
                        <span>· {t.owner_nome ?? t.owner_email ?? '—'}</span>
                      </div>
                    </div>
                    <span className="text-xs font-semibold text-destructive shrink-0">{rel.text}</span>
                  </div>
                );
              })}
            </div>
          )}
      </SectionCard>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, tone }: {
  icon: typeof Users; label: string; value: number; tone: 'blue' | 'green' | 'amber' | 'red' | 'slate';
}) {
  const tones: Record<string, string> = {
    blue: 'bg-primary/10 text-primary',
    green: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    red: 'bg-destructive/10 text-destructive',
    slate: 'bg-muted text-muted-foreground',
  };
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm flex items-center gap-3 animate-fade-in">
      <span className={cn('grid place-items-center h-10 w-10 rounded-lg shrink-0', tones[tone])}>
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <div className="text-2xl font-bold leading-none tabular-nums">{value}</div>
        <div className="text-xs text-muted-foreground mt-1 truncate">{label}</div>
      </div>
    </div>
  );
}
