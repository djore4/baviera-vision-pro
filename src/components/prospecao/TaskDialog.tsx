import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Trash2, Check, RotateCcw, CalendarClock } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  updateTask, setTaskDone, deleteTask,
  type Task, type Account,
} from '@/lib/prospec';

/* datetime-local <-> ISO */
const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
};

const typeLabel: Record<Task['type'], string> = { todo: 'Tarefa', next_action: 'Próxima ação' };

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  task: Task | null;
  accounts: Account[];
  onChanged: () => void;
}

export function TaskDialog({ open, onOpenChange, task, accounts, onChanged }: Props) {
  const [descricao, setDescricao] = useState('');
  const [quando, setQuando] = useState('');
  const [contaId, setContaId] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !task) return;
    setDescricao(task.descricao);
    setQuando(toLocalInput(task.due_at));
    setContaId(task.account_id ?? '');
  }, [open, task]);

  if (!task) return null;

  const save = async () => {
    if (!descricao.trim()) { toast.error('A descrição não pode ficar vazia.'); return; }
    setSaving(true);
    try {
      await updateTask(task.id, {
        descricao: descricao.trim(),
        due_at: quando ? new Date(quando).toISOString() : null,
        account_id: contaId || null,
      });
      toast.success('Tarefa atualizada.');
      onChanged();
      onOpenChange(false);
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };

  const toggleDone = async () => {
    try {
      await setTaskDone(task.id, !task.done);
      toast.success(task.done ? 'Reaberta.' : 'Concluída.');
      onChanged();
      onOpenChange(false);
    } catch (e) { toast.error((e as Error).message); }
  };

  const remove = async () => {
    if (!confirm('Eliminar esta tarefa?')) return;
    try {
      await deleteTask(task.id);
      toast.success('Tarefa eliminada.');
      onChanged();
      onOpenChange(false);
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-bmw-blue" />
            {typeLabel[task.type]}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Descrição</Label>
            <Input value={descricao} onChange={e => setDescricao(e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label>Lembrete / prazo</Label>
            <Input type="datetime-local" value={quando} onChange={e => setQuando(e.target.value)} />
            {quando && (
              <button className="text-[11px] text-muted-foreground hover:text-foreground" onClick={() => setQuando('')}>
                Remover data
              </button>
            )}
          </div>

          <div className="space-y-1">
            <Label>Conta associada</Label>
            <select value={contaId} onChange={e => setContaId(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="">Sem conta</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
            </select>
          </div>

          <div className="flex items-center justify-between pt-1">
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" className="text-destructive" onClick={remove}>
                <Trash2 className="h-4 w-4 mr-1" /> Eliminar
              </Button>
              <Button variant="ghost" size="sm" onClick={toggleDone}>
                {task.done ? <><RotateCcw className="h-4 w-4 mr-1" /> Reabrir</> : <><Check className="h-4 w-4 mr-1" /> Concluir</>}
              </Button>
            </div>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Guardar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
