import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Loader2, Building2, TrendingUp } from 'lucide-react';
import {
  FASES, faseLabel, faseCls,
  listAccounts, listTasks, isOverdue,
  type Account, type Task, type Scope,
} from '@/lib/prospec';

const fmt = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
const typeLabel: Record<Task['type'], string> = { todo: 'Tarefa', next_action: 'Próxima ação', appointment: 'Compromisso' };

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
      setOverdue(openTasks.filter(isOverdue));
    } catch (e) { toast.error((e as Error).message); setAccounts([]); }
  }, [scope]);
  useEffect(() => { load(); }, [load]);

  const funnel = useMemo(() => {
    const counts = new Map<string, number>();
    (accounts ?? []).forEach(a => counts.set(a.fase, (counts.get(a.fase) ?? 0) + 1));
    const max = Math.max(1, ...FASES.map(f => counts.get(f.value) ?? 0));
    return FASES.map(f => ({ ...f, n: counts.get(f.value) ?? 0, pct: ((counts.get(f.value) ?? 0) / max) * 100 }));
  }, [accounts]);

  const accountName = (id: string | null) => id ? accounts?.find(a => a.id === id)?.nome ?? null : null;

  if (accounts === null) {
    return <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" />A carregar…</div>;
  }

  const total = accounts.length;

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi label="Contas totais" value={total} />
        <Kpi label="Ganhas" value={accounts.filter(a => a.fase === 'ganho').length} tone="green" />
        <Kpi label="Em negociação" value={accounts.filter(a => ['reuniao', 'proposta', 'negociacao'].includes(a.fase)).length} tone="amber" />
        <Kpi label="Atrasados (equipa)" value={overdue.length} tone={overdue.length ? 'red' : undefined} />
      </div>

      {/* Funil consolidado */}
      <div className="rounded-lg border border-border p-3">
        <div className="flex items-center gap-2 mb-3"><TrendingUp className="h-4 w-4 text-bmw-blue" /><h3 className="font-semibold text-sm">Funil consolidado</h3></div>
        <div className="space-y-1.5">
          {funnel.map(f => (
            <div key={f.value} className="flex items-center gap-2">
              <span className="w-32 text-xs shrink-0">{faseLabel(f.value)}</span>
              <div className="flex-1 h-5 rounded bg-muted overflow-hidden">
                <div className={`h-full ${faseCls(f.value)} flex items-center`} style={{ width: `${Math.max(f.pct, f.n ? 6 : 0)}%` }} />
              </div>
              <span className="w-8 text-right text-sm font-semibold">{f.n}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Atrasados de toda a equipa */}
      <div className={`rounded-lg border p-3 ${overdue.length ? 'border-destructive/40 bg-destructive/5' : 'border-border'}`}>
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className={`h-4 w-4 ${overdue.length ? 'text-destructive' : 'text-muted-foreground'}`} />
          <h3 className="font-semibold text-sm">Atrasados — toda a equipa</h3>
          {overdue.length > 0 && <span className="rounded-full bg-destructive text-destructive-foreground text-xs px-2 py-0.5 font-semibold">{overdue.length}</span>}
        </div>
        {overdue.length === 0
          ? <p className="text-xs text-muted-foreground">Nada em atraso na equipa.</p>
          : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left font-medium px-2 py-1">Descrição</th>
                    <th className="text-left font-medium px-2 py-1">Tipo</th>
                    <th className="text-left font-medium px-2 py-1 hidden sm:table-cell">Conta</th>
                    <th className="text-left font-medium px-2 py-1">Vendedor</th>
                    <th className="text-left font-medium px-2 py-1">Prazo</th>
                  </tr>
                </thead>
                <tbody>
                  {overdue.map(t => (
                    <tr key={t.id} className="border-t border-border">
                      <td className="px-2 py-1.5">{t.descricao}</td>
                      <td className="px-2 py-1.5 text-muted-foreground">{typeLabel[t.type]}</td>
                      <td className="px-2 py-1.5 text-muted-foreground hidden sm:table-cell">
                        {accountName(t.account_id) ? <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" />{accountName(t.account_id)}</span> : '—'}
                      </td>
                      <td className="px-2 py-1.5 text-muted-foreground">{t.owner_nome ?? t.owner_email ?? '—'}</td>
                      <td className="px-2 py-1.5 text-destructive font-medium">{fmt(t.due_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone?: 'green' | 'amber' | 'red' }) {
  const cls = tone === 'green' ? 'text-green-600' : tone === 'amber' ? 'text-amber-600' : tone === 'red' ? 'text-destructive' : 'text-foreground';
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold ${cls}`}>{value}</div>
    </div>
  );
}
