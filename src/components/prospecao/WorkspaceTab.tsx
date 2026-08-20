import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle, Plus, Check, Trash2, CalendarDays, ListTodo, CalendarClock, Loader2, Building2,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  listTasks, listAccounts, createTask, setTaskDone, deleteTask, isOverdue,
  type Task, type Account, type Scope,
} from '@/lib/prospec';

interface Props { myEmail: string | null; myNome: string | null; onCountsChanged: () => void; }

const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const fmtDay = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit', month: '2-digit' }) : 'sem data';
const fmtTime = (iso: string | null) => iso ? new Date(iso).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }) : '';

const typeLabel: Record<Task['type'], string> = { todo: 'Tarefa', next_action: 'Próxima ação', appointment: 'Compromisso' };

export function WorkspaceTab({ myEmail, myNome, onCountsChanged }: Props) {
  const scope: Scope = useMemo(() => ({ isDirector: false, email: myEmail }), [myEmail]);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);

  // formulários
  const [todo, setTodo] = useState('');
  const [apptDesc, setApptDesc] = useState('');
  const [apptWhen, setApptWhen] = useState('');
  const [apptAccount, setApptAccount] = useState('');

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

  const addTodo = async () => {
    if (!todo.trim()) return;
    try { await createTask({ type: 'todo', descricao: todo.trim(), owner_email: myEmail, owner_nome: myNome, created_by: myEmail }); setTodo(''); refresh(); }
    catch (e) { toast.error((e as Error).message); }
  };
  const addAppt = async () => {
    if (!apptDesc.trim()) { toast.error('Descreve o compromisso.'); return; }
    if (!apptWhen) { toast.error('Indica a data/hora.'); return; }
    try {
      await createTask({ type: 'appointment', descricao: apptDesc.trim(), due_at: new Date(apptWhen).toISOString(), account_id: apptAccount || null, owner_email: myEmail, owner_nome: myNome, created_by: myEmail });
      setApptDesc(''); setApptWhen(''); setApptAccount(''); refresh();
    } catch (e) { toast.error((e as Error).message); }
  };
  const complete = async (id: string) => { try { await setTaskDone(id, true); refresh(); } catch (e) { toast.error((e as Error).message); } };
  const remove = async (id: string) => { try { await deleteTask(id); refresh(); } catch (e) { toast.error((e as Error).message); } };

  const groups = useMemo(() => {
    const all = tasks ?? [];
    const overdue = all.filter(isOverdue);
    const today0 = startOfDay(new Date());
    const in7 = addDays(today0, 8);
    const todos = all.filter(t => t.type === 'todo' && !isOverdue(t));
    const upcoming = all
      .filter(t => (t.type === 'next_action' || t.type === 'todo') && !isOverdue(t) && t.due_at && new Date(t.due_at) >= today0 && new Date(t.due_at) < in7)
      .sort((a, b) => new Date(a.due_at!).getTime() - new Date(b.due_at!).getTime());
    // agenda semanal (compromissos desta semana, seg-dom)
    const day = today0.getDay(); // 0 dom
    const monday = addDays(today0, day === 0 ? -6 : 1 - day);
    const weekDays = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
    const appts = all.filter(t => t.type === 'appointment' && t.due_at && !isOverdue(t));
    return { overdue, todos, upcoming, weekDays, appts };
  }, [tasks]);

  if (tasks === null) {
    return <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" />A carregar…</div>;
  }

  const Row = ({ t, showAccount = true }: { t: Task; showAccount?: boolean }) => (
    <div className="flex items-center justify-between gap-2 rounded border border-border px-2 py-1.5 text-sm bg-card">
      <div className="min-w-0">
        <div className="truncate">{t.descricao}</div>
        <div className="text-[11px] text-muted-foreground flex items-center gap-2">
          <span>{typeLabel[t.type]}</span>
          {t.due_at && <span>· {fmtDay(t.due_at)} {fmtTime(t.due_at)}</span>}
          {showAccount && accountName(t.account_id) && <span className="inline-flex items-center gap-0.5"><Building2 className="h-3 w-3" />{accountName(t.account_id)}</span>}
        </div>
      </div>
      <div className="flex gap-1 shrink-0">
        <button onClick={() => complete(t.id)} className="text-muted-foreground hover:text-green-600" title="Concluir"><Check className="h-4 w-4" /></button>
        <button onClick={() => remove(t.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
      </div>
    </div>
  );

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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ── To-do diário ── */}
        <div className="rounded-lg border border-border p-3">
          <div className="flex items-center gap-2 mb-2"><ListTodo className="h-4 w-4 text-bmw-blue" /><h3 className="font-semibold text-sm">To-do diário</h3></div>
          <div className="flex gap-2 mb-2">
            <Input value={todo} onChange={e => setTodo(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTodo()} placeholder="Nova tarefa…" />
            <Button variant="secondary" onClick={addTodo}><Plus className="h-4 w-4" /></Button>
          </div>
          <div className="space-y-1.5">
            {groups.todos.length === 0 && <p className="text-xs text-muted-foreground">Sem tarefas soltas.</p>}
            {groups.todos.map(t => <Row key={t.id} t={t} />)}
          </div>
        </div>

        {/* ── Próximas tarefas ── */}
        <div className="rounded-lg border border-border p-3">
          <div className="flex items-center gap-2 mb-2"><CalendarClock className="h-4 w-4 text-bmw-blue" /><h3 className="font-semibold text-sm">Próximas tarefas (7 dias)</h3></div>
          <div className="space-y-1.5">
            {groups.upcoming.length === 0 && <p className="text-xs text-muted-foreground">Nada agendado para os próximos dias.</p>}
            {groups.upcoming.map(t => <Row key={t.id} t={t} />)}
          </div>
        </div>
      </div>

      {/* ── Agenda semanal ── */}
      <div className="rounded-lg border border-border p-3">
        <div className="flex items-center gap-2 mb-2"><CalendarDays className="h-4 w-4 text-bmw-blue" /><h3 className="font-semibold text-sm">Agenda semanal</h3></div>
        <div className="grid grid-cols-1 sm:grid-cols-7 gap-2 mb-3">
          {groups.weekDays.map(d => {
            const dayAppts = groups.appts.filter(t => startOfDay(new Date(t.due_at!)).getTime() === d.getTime())
              .sort((a, b) => new Date(a.due_at!).getTime() - new Date(b.due_at!).getTime());
            const isToday = d.getTime() === startOfDay(new Date()).getTime();
            return (
              <div key={d.toISOString()} className={`rounded border p-1.5 min-h-[70px] ${isToday ? 'border-bmw-blue bg-bmw-blue/5' : 'border-border'}`}>
                <div className="text-[10px] uppercase text-muted-foreground mb-1">{d.toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit' })}</div>
                <div className="space-y-1">
                  {dayAppts.map(t => (
                    <div key={t.id} className="group text-[11px] rounded bg-bmw-blue/10 text-bmw-blue px-1 py-0.5 leading-tight">
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-medium">{fmtTime(t.due_at)}</span>
                        <button onClick={() => complete(t.id)} className="opacity-0 group-hover:opacity-100 hover:text-green-600"><Check className="h-3 w-3" /></button>
                      </div>
                      <div className="truncate" title={t.descricao}>{t.descricao}</div>
                      {accountName(t.account_id) && <div className="truncate text-[10px] opacity-70">{accountName(t.account_id)}</div>}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        {/* Novo compromisso */}
        <div className="flex flex-wrap gap-2 border-t border-border pt-2">
          <Input value={apptDesc} onChange={e => setApptDesc(e.target.value)} placeholder="Novo compromisso…" className="w-full sm:w-52" />
          <Input type="datetime-local" value={apptWhen} onChange={e => setApptWhen(e.target.value)} className="w-full sm:w-52" />
          <select value={apptAccount} onChange={e => setApptAccount(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
            <option value="">Sem conta</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
          </select>
          <Button variant="secondary" onClick={addAppt}><Plus className="h-4 w-4 mr-1" />Marcar</Button>
        </div>
      </div>
    </div>
  );
}
