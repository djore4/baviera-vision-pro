import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle, Plus, Check, Trash2, CalendarDays, ListChecks, Loader2, Building2,
  Bell, CircleDot, Target, PartyPopper, CalendarCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  listTasks, listAccounts, createTask, setTaskDone, deleteTask, isOverdue,
  type Task, type Account, type Scope,
} from '@/lib/prospec';
import { SectionCard, EmptyState, relativeLabel } from './ui';
import { TaskDialog } from './TaskDialog';

interface Props { myEmail: string | null; myNome: string | null; onCountsChanged: () => void; }

const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const fmtTime = (iso: string | null) => iso ? new Date(iso).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }) : '';

const typeMeta: Record<Task['type'], { label: string; icon: typeof CircleDot }> = {
  todo: { label: 'Tarefa', icon: CircleDot },
  next_action: { label: 'Próxima ação', icon: Target },
};

export function WorkspaceTab({ myEmail, myNome, onCountsChanged }: Props) {
  const scope: Scope = useMemo(() => ({ isDirector: false, email: myEmail }), [myEmail]);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);

  // formulário: tarefa versátil (texto + data/lembrete + conta, todos opcionais menos o texto)
  const [descricao, setDescricao] = useState('');
  const [quando, setQuando] = useState('');
  const [contaId, setContaId] = useState('');

  // diálogo de edição de tarefa
  const [taskOpen, setTaskOpen] = useState(false);
  const [selTask, setSelTask] = useState<Task | null>(null);
  const openTask = (t: Task) => { setSelTask(t); setTaskOpen(true); };

  const load = useCallback(async () => {
    try {
      const [t, a] = await Promise.all([
        listTasks(scope, { done: false }),
        listAccounts(scope),
      ]);
      setTasks(t); setAccounts(a);
    } catch (e) { toast.error((e as Error).message); setTasks([]); }
  }, [scope]);
  useEffect(() => { load(); }, [load]);

  const accountName = (id: string | null) => id ? accounts.find(a => a.id === id)?.nome ?? null : null;
  const refresh = () => { load(); onCountsChanged(); };

  const add = async () => {
    if (!descricao.trim()) { toast.error('Descreve a tarefa.'); return; }
    try {
      await createTask({
        type: 'todo',
        descricao: descricao.trim(),
        due_at: quando ? new Date(quando).toISOString() : null,
        account_id: contaId || null,
        owner_email: myEmail, owner_nome: myNome, created_by: myEmail,
      });
      setDescricao(''); setQuando(''); setContaId('');
      refresh();
    } catch (e) { toast.error((e as Error).message); }
  };
  const complete = async (id: string) => { try { await setTaskDone(id, true); refresh(); } catch (e) { toast.error((e as Error).message); } };
  const remove = async (id: string) => { try { await deleteTask(id); refresh(); } catch (e) { toast.error((e as Error).message); } };

  const groups = useMemo(() => {
    const all = tasks ?? [];
    const overdue = all.filter(isOverdue).sort((a, b) => new Date(a.due_at!).getTime() - new Date(b.due_at!).getTime());
    const openList = all.filter(t => !isOverdue(t))
      .sort((a, b) => {
        if (!a.due_at && !b.due_at) return 0;
        if (!a.due_at) return 1;
        if (!b.due_at) return -1;
        return new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
      });
    const today0 = startOfDay(new Date());
    const day = today0.getDay();
    const monday = addDays(today0, day === 0 ? -6 : 1 - day);
    const weekDays = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
    const dated = all.filter(t => t.due_at);
    return { overdue, openList, weekDays, dated };
  }, [tasks]);

  if (tasks === null) {
    return <div className="flex items-center justify-center py-20 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" />A carregar…</div>;
  }

  const TaskItem = ({ t }: { t: Task }) => {
    const overdue = isOverdue(t);
    const rel = relativeLabel(t.due_at, t.done);
    const Meta = typeMeta[t.type];
    return (
      <div
        onClick={() => openTask(t)}
        className={cn(
          'group flex items-center gap-3 rounded-lg border bg-card px-3 py-2 cursor-pointer transition-all hover:shadow-sm hover:-translate-y-px',
          overdue ? 'border-destructive/30' : 'border-border',
        )}
      >
        <span className={cn(
          'grid place-items-center h-7 w-7 rounded-md shrink-0',
          overdue ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary',
        )}>
          <Meta.icon className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate">{t.descricao}</div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground mt-0.5">
            <span>{Meta.label}</span>
            {t.due_at && (
              <span className={cn('inline-flex items-center gap-1', overdue && 'text-destructive font-medium')}>
                <Bell className="h-3 w-3" />{rel.text}
              </span>
            )}
            {accountName(t.account_id) && <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" />{accountName(t.account_id)}</span>}
          </div>
        </div>
        <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={(e) => { e.stopPropagation(); complete(t.id); }} className="grid place-items-center h-7 w-7 rounded-md text-muted-foreground hover:bg-emerald-500/10 hover:text-emerald-600" title="Concluir"><Check className="h-4 w-4" /></button>
          <button onClick={(e) => { e.stopPropagation(); remove(t.id); }} className="grid place-items-center h-7 w-7 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive" title="Eliminar"><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>
    );
  };

  const today0 = startOfDay(new Date());

  return (
    <div className="space-y-4 animate-fade-in">
      {/* ── Atrasados (destaque sempre visível) ── */}
      <SectionCard icon={AlertTriangle} title="Atrasados" count={groups.overdue.length} tone="danger">
        {groups.overdue.length === 0
          ? <EmptyState icon={PartyPopper} title="Nada em atraso" hint="Estás em dia com tudo. Bom trabalho!" />
          : <div className="space-y-2">{groups.overdue.map(t => <TaskItem key={t.id} t={t} />)}</div>}
      </SectionCard>

      {/* ── As minhas tarefas ── */}
      <SectionCard icon={ListChecks} title="As minhas tarefas" count={groups.openList.length}>
        <div className="flex flex-wrap gap-2 mb-3">
          <Input value={descricao} onChange={e => setDescricao(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder="Nova tarefa…" className="w-full sm:flex-1 sm:min-w-[12rem]" />
          <Input type="datetime-local" value={quando} onChange={e => setQuando(e.target.value)} className="w-full sm:w-52" title="Lembrete / prazo (opcional)" />
          <select value={contaId} onChange={e => setContaId(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm w-full sm:w-auto">
            <option value="">Sem conta</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
          </select>
          <Button onClick={add} className="shadow-sm"><Plus className="h-4 w-4 mr-1" />Adicionar</Button>
        </div>
        {groups.openList.length === 0
          ? <EmptyState icon={CalendarCheck} title="Sem tarefas abertas" hint="Adiciona uma tarefa acima — com data, viras um lembrete." />
          : <div className="space-y-2">{groups.openList.map(t => <TaskItem key={t.id} t={t} />)}</div>}
      </SectionCard>

      {/* ── Agenda semanal ── */}
      <SectionCard icon={CalendarDays} title="Agenda semanal">
        <div className="grid grid-cols-1 sm:grid-cols-7 gap-2">
          {groups.weekDays.map(d => {
            const dayTasks = groups.dated.filter(t => startOfDay(new Date(t.due_at!)).getTime() === d.getTime())
              .sort((a, b) => new Date(a.due_at!).getTime() - new Date(b.due_at!).getTime());
            const isToday = d.getTime() === today0.getTime();
            const isWeekend = d.getDay() === 0 || d.getDay() === 6;
            return (
              <div key={d.toISOString()} className={cn(
                'rounded-lg border p-1.5 min-h-[84px] transition-colors',
                isToday ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : isWeekend ? 'border-border/60 bg-muted/30' : 'border-border',
              )}>
                <div className={cn('flex items-center justify-between mb-1', isToday && 'text-primary')}>
                  <span className="text-[10px] uppercase font-semibold tracking-wide text-muted-foreground">{d.toLocaleDateString('pt-PT', { weekday: 'short' })}</span>
                  <span className={cn('text-[11px] font-bold h-5 w-5 grid place-items-center rounded-full', isToday ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}>{d.getDate()}</span>
                </div>
                <div className="space-y-1">
                  {dayTasks.map(t => {
                    const overdue = isOverdue(t);
                    return (
                      <div key={t.id} onClick={() => openTask(t)} className={cn(
                        'group text-[11px] rounded-md px-1.5 py-1 leading-tight cursor-pointer transition-colors',
                        overdue ? 'bg-destructive/10 text-destructive hover:bg-destructive/15' : 'bg-primary/10 text-primary hover:bg-primary/15',
                      )}>
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-semibold tabular-nums">{fmtTime(t.due_at)}</span>
                          <button onClick={(e) => { e.stopPropagation(); complete(t.id); }} className="opacity-0 group-hover:opacity-100 hover:text-emerald-600"><Check className="h-3 w-3" /></button>
                        </div>
                        <div className="truncate font-medium" title={t.descricao}>{t.descricao}</div>
                        {accountName(t.account_id) && <div className="truncate opacity-70">{accountName(t.account_id)}</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>

      <TaskDialog open={taskOpen} onOpenChange={setTaskOpen} task={selTask} accounts={accounts} onChanged={refresh} />
    </div>
  );
}
