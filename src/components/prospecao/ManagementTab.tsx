import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle, Loader2, TrendingUp, Trophy, Handshake, Users, CheckCircle2, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  FASES, faseLabel,
  listAccounts, listTasks, isOverdue,
  type Account, type Task, type Scope, type Fase,
} from '@/lib/prospec';
import { SectionCard, Avatar, EmptyState, relativeLabel, ScoreBadge } from './ui';

/* KPIs clicáveis do topo — cada um evidencia (em baixo) os registos a que o
 * número se refere. 'atrasados' lista tarefas; os restantes listam contas. */
type KpiKey = 'total' | 'ganho' | 'negociacao' | 'atrasados';
const NEGOCIACAO_FASES: Fase[] = ['reuniao', 'proposta', 'negociacao'];

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
  const [selected, setSelected] = useState<KpiKey | null>(null);   // KPI evidenciado

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
  const ganhas = accounts.filter(a => a.fase === 'ganho');
  const emNegociacaoAcc = accounts.filter(a => NEGOCIACAO_FASES.includes(a.fase));

  // Contas evidenciadas pelo KPI selecionado (ordenadas por score desc).
  const selectedAccounts = (
    selected === 'total' ? accounts
    : selected === 'ganho' ? ganhas
    : selected === 'negociacao' ? emNegociacaoAcc
    : []
  ).slice().sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  const toggle = (k: KpiKey) => setSelected(s => (s === k ? null : k));

  return (
    <div className="space-y-4 animate-fade-in">
      {/* KPIs — clicáveis: evidenciam em baixo os registos a que o número se refere. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi icon={Users} label="Contas totais" value={total} tone="blue"
          active={selected === 'total'} onClick={() => toggle('total')} />
        <Kpi icon={Trophy} label="Ganhas" value={ganhas.length} tone="green"
          active={selected === 'ganho'} onClick={() => toggle('ganho')} />
        <Kpi icon={Handshake} label="Em negociação" value={emNegociacaoAcc.length} tone="amber"
          active={selected === 'negociacao'} onClick={() => toggle('negociacao')} />
        <Kpi icon={AlertTriangle} label="Atrasados (equipa)" value={overdue.length} tone={overdue.length ? 'red' : 'slate'}
          active={selected === 'atrasados'} onClick={() => toggle('atrasados')} />
      </div>

      {/* Detalhe do KPI selecionado — clientes/oportunidades/leads correspondentes. */}
      {selected && (
        <SectionCard
          icon={selected === 'atrasados' ? AlertTriangle : selected === 'ganho' ? Trophy : selected === 'negociacao' ? Handshake : Users}
          title={
            selected === 'total' ? 'Contas totais'
            : selected === 'ganho' ? 'Contas ganhas'
            : selected === 'negociacao' ? 'Em negociação'
            : 'Atrasados — toda a equipa'
          }
          count={selected === 'atrasados' ? overdue.length : selectedAccounts.length}
          tone={selected === 'atrasados' ? 'danger' : 'default'}
          actions={
            <button onClick={() => setSelected(null)} title="Fechar"
              className="grid place-items-center h-7 w-7 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          }
        >
          {selected === 'atrasados' ? (
            overdue.length === 0
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
              )
          ) : selectedAccounts.length === 0 ? (
            <EmptyState icon={Users} title="Sem contas" hint="Nenhuma conta nesta categoria." />
          ) : (
            <div className="space-y-2">
              {selectedAccounts.map(a => (
                <div key={a.id} className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2">
                  <Avatar name={a.nome} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{a.nome}</div>
                    <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground mt-0.5">
                      <span>{faseLabel(a.fase)}</span>
                      {a.setor && <span>· {a.setor}</span>}
                      {(a.owner_nome ?? a.owner_email) && <span>· {a.owner_nome ?? a.owner_email}</span>}
                    </div>
                  </div>
                  <ScoreBadge score={a.score} />
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      )}

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

function Kpi({ icon: Icon, label, value, tone, active = false, onClick }: {
  icon: typeof Users; label: string; value: number; tone: 'blue' | 'green' | 'amber' | 'red' | 'slate';
  active?: boolean; onClick?: () => void;
}) {
  const tones: Record<string, string> = {
    blue: 'bg-primary/10 text-primary',
    green: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    red: 'bg-destructive/10 text-destructive',
    slate: 'bg-muted text-muted-foreground',
  };
  const rings: Record<string, string> = {
    blue: 'ring-primary', green: 'ring-emerald-500', amber: 'ring-amber-500',
    red: 'ring-destructive', slate: 'ring-muted-foreground',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={active ? 'Clique para ocultar' : 'Clique para ver os registos'}
      className={cn(
        'text-left rounded-xl border bg-card p-4 shadow-sm flex items-center gap-3 animate-fade-in',
        'transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
        active ? cn('ring-2', rings[tone]) : 'border-border',
      )}
    >
      <span className={cn('grid place-items-center h-10 w-10 rounded-lg shrink-0', tones[tone])}>
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <div className="text-2xl font-bold leading-none tabular-nums">{value}</div>
        <div className="text-xs text-muted-foreground mt-1 truncate">{label}</div>
      </div>
    </button>
  );
}
