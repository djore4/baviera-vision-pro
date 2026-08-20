import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle, Plus, Check, Trash2, CalendarDays, ListChecks, Loader2, Building2, Bell,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  listTasks, listAccounts, createTask, setTaskDone, deleteTask, isOverdue,
  type Task, type Account, type Scope,
} from '@/lib/prospec';
import { TaskDialog } from './TaskDialog';

interface Props { myEmail: string | null; myNome: string | null; onCountsChanged: () => void; }

const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const fmtDay = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit', month: '2-digit' }) : 'sem data';
const fmtTime = (iso: string | null) => iso ? new Date(iso).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }) : '';

const typeLabel: Record<Task['type'], string> = { todo: 'Tarefa', next_action: 'Próxima ação' };

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
        if (!a.due_at) return 1;               // sem data por último
        if (!b.due_at) return -1;
        return new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
      });
    // agenda: tarefas com data na semana atual (seg–dom)
    const today0 = startOfDay(new Date());
    const day = today0.getDay(); // 0 dom
    const monday = addDays(today0, day === 0 ? -6 : 1 - day);
    const weekDays = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
    const dated = all.filter(t => t.due_at);
    return { overdue, openList, weekDays, dated };
  }, [tasks]);

  if (tasks === null) {
    return <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" />A carregar…</div>;
  }

  const Row = ({ t }: { t: Task }) => {
    const overdue = isOverdue(t);
    return (
      <div onClick={() => openTask(t)} className="flex items-center justify-between gap-2 rounded border border-border px-2 py-1.5 text-sm bg-card cursor-pointer hover:bg-muted/40">
        <div className="min-w-0">
          <div className="truncate">{t.descricao}</div>
          <div className="text-[11px] text-muted-foreground flex flex-wrap items-center gap-x-2">
            <span>{typeLabel[t.type]}</span>
            {t.due_at && (
              <span className={`inline-flex items-center gap-0.5 ${overdue ? 'text-destructive font-medium' : ''}`}>
                <Bell className="h-3 w-3" />{fmtDay(t.due_at)} {fmtTime(t.due_at)}
              </span>
            )}
            {accountName(t.account_id) && <span className="inline-flex items-center gap-0.5"><Building2 className="h-3 w-3" />{accountName(t.account_id)}</span>}
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          <button onClick={(e) => { e.stopPropagation(); complete(t.id); }} className="text-muted-foreground hover:text-green-600" title="Concluir"><Check className="h-4 w-4" /></button>
          <button onClick={(e) => { e.stopPropagation(); remove(t.id); }} className="text-muted-foreground hover:text-destructive" title="Eliminar"><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* ── Atrasados (destaque sempre visível) ── */}
      <div className={`rounded-lg border p-3 ${groups.overdue.length ? 'border-destructive/40 bg-destructive/5' : 'border-border'}`}>
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className={`h-4 w-4 ${groups.overdue.length ? 'text-destructive' : 'text-muted-foreground'}`} />
          <h3 className="font-semibold text-sm">Atrasados</h3>
          {groups.overdue.length > 0 && <span className="rounded-full bg-destructive text-destructive-foreground text-xs px-2 py-0.5 font-semibold">{groups.overdue.length}</span>}
        </div>
        {groups.overdue.length === 0
          ? <p className="text-xs text-muted-foreground">Nada em atraso. 👌</p>
          : <div className="space-y-1.5">{groups.overdue.map(t => <Row key={t.id} t={t} />)}</div>}
      </div>

      {/* ── As minhas tarefas (versáteis: texto + lembrete + conta) ── */}
      <div className="rounded-lg border border-border p-3">
        <div className="flex items-center gap-2 mb-2"><ListChecks className="h-4 w-4 text-bmw-blue" /><h3 className="font-semibold text-sm">As minhas tarefas</h3></div>
        <div className="flex flex-wrap gap-2 mb-3">
          <Input value={descricao} onChange={e => setDescricao(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder="Nova tarefa…" className="w-full sm:flex-1 sm:min-w-[12rem]" />
          <Input type="datetime-local" value={quando} onChange={e => setQuando(e.target.value)} className="w-full sm:w-52" title="Lembrete / prazo (opcional)" />
          <select value={contaId} onChange={e => setContaId(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm w-full sm:w-auto">
            <option value="">Sem conta</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
          </select>
          <Button onClick={add}><Plus className="h-4 w-4 mr-1" />Adicionar</Button>
        </div>
        <div className="space-y-1.5">
          {groups.openList.length === 0 && <p className="text-xs text-muted-foreground">Sem tarefas abertas.</p>}
          {groups.openList.map(t => <Row key={t.id} t={t} />)}
        </div>
      </div>

      {/* ── Agenda semanal (tarefas com data nesta semana) ── */}
      <div className="rounded-lg border border-border p-3">
        <div className="flex items-center gap-2 mb-2"><CalendarDays className="h-4 w-4 text-bmw-blue" /><h3 className="font-semibold text-sm">Agenda semanal</h3></div>
        <div className="grid grid-cols-1 sm:grid-cols-7 gap-2">
          {groups.weekDays.map(d => {
            const dayTasks = groups.dated.filter(t => startOfDay(new Date(t.due_at!)).getTime() === d.getTime())
              .sort((a, b) => new Date(a.due_at!).getTime() - new Date(b.due_at!).getTime());
            const isToday = d.getTime() === startOfDay(new Date()).getTime();
            return (
              <div key={d.toISOString()} className={`rounded border p-1.5 min-h-[70px] ${isToday ? 'border-bmw-blue bg-bmw-blue/5' : 'border-border'}`}>
                <div className="text-[10px] uppercase text-muted-foreground mb-1">{d.toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit' })}</div>
                <div className="space-y-1">
                  {dayTasks.map(t => {
                    const overdue = isOverdue(t);
                    return (
                      <div key={t.id} onClick={() => openTask(t)} className={`group text-[11px] rounded px-1 py-0.5 leading-tight cursor-pointer ${overdue ? 'bg-destructive/10 text-destructive' : 'bg-bmw-blue/10 text-bmw-blue'}`}>
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-medium">{fmtTime(t.due_at)}</span>
                          <button onClick={(e) => { e.stopPropagation(); complete(t.id); }} className="opacity-0 group-hover:opacity-100 hover:text-green-600"><Check className="h-3 w-3" /></button>
                        </div>
                        <div className="truncate" title={t.descricao}>{t.descricao}</div>
                        {accountName(t.account_id) && <div className="truncate text-[10px] opacity-70">{accountName(t.account_id)}</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <TaskDialog open={taskOpen} onOpenChange={setTaskOpen} task={selTask} accounts={accounts} onChanged={refresh} />
    </div>
  );
}
