import { useState } from 'react';
import { Megaphone, Plus, Send, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { TABS } from '@/lib/permissions';
import { createNotification, deleteNotification, ADMIN_AUDIENCE, type Notification } from '@/lib/notifications';

/* Mensagens da administração no Diário. A mesma mensagem aparece também no sino
 * (é uma notificação marcada `painel`). Quem recebe pode dispensá-la só para si
 * (localStorage); a administração apaga-a para todos. */

const DURACOES = [
  { dias: 1, label: 'Até ao fim de hoje' },
  { dias: 3, label: '3 dias' },
  { dias: 7, label: '1 semana' },
  { dias: 14, label: '2 semanas' },
  { dias: 30, label: '1 mês' },
  { dias: 0, label: 'Até eu apagar' },
] as const;

/** Fim do dia, `dias` dias depois de hoje (1 = hoje à meia-noite). */
export function expiraEmDias(dias: number, agora: Date = new Date()): string | null {
  if (dias <= 0) return null;
  return new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + dias).toISOString();
}

const quando = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' })} · ${d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}`;
};
const destinatarios = (a: string) =>
  a === 'all' ? null : a === ADMIN_AUDIENCE ? 'Administração' : (TABS.find(t => t.key === a)?.label ?? a);

interface ListaProps {
  mensagens: Notification[];
  isAdmin: boolean;
  dispensadas: Set<string>;
  onDispensar: (id: string) => void;
  onApagada: (id: string) => void;
}

export function MensagensLista({ mensagens, isAdmin, dispensadas, onDispensar, onApagada }: ListaProps) {
  const visiveis = mensagens.filter(m => isAdmin || !dispensadas.has(m.id));
  if (visiveis.length === 0) return null;

  const apagar = async (id: string) => {
    try { await deleteNotification(id); onApagada(id); toast.success('Mensagem removida.'); }
    catch (e) { toast.error((e as Error).message); }
  };

  return (
    <section aria-label="Mensagens da administração" className="space-y-2" data-testid="painel-mensagens">
      {visiveis.map(m => {
        const para = destinatarios(m.audience);
        return (
          <article key={m.id}
            className="relative overflow-hidden rounded-xl border border-primary/25 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent px-4 py-3 pl-5">
            <span className="absolute inset-y-0 left-0 w-1 bg-primary" aria-hidden />
            <div className="flex items-start gap-3">
              <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
                <Megaphone className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold leading-snug">{m.title}</h3>
                {m.body && <p className="mt-0.5 whitespace-pre-wrap text-sm text-muted-foreground">{m.body}</p>}
                <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                  <span>{m.created_by_nome || 'Administração'}</span>
                  <span>·</span>
                  <span>{quando(m.created_at)}</span>
                  {para && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">{para}</span>}
                  {m.expira_em && <span>· até {new Date(m.expira_em).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' })}</span>}
                </p>
              </div>
              {isAdmin ? (
                <button type="button" onClick={() => apagar(m.id)} title="Apagar para todos" aria-label="Apagar mensagem"
                  className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </button>
              ) : (
                <button type="button" onClick={() => onDispensar(m.id)} title="Dispensar" aria-label="Dispensar mensagem"
                  className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </article>
        );
      })}
    </section>
  );
}

interface ComporProps {
  autorEmail: string | null;
  autorNome: string | null;
  onEnviada: () => void;
}

/** Botão + janela para a administração lançar uma mensagem no Painel (e no sino). */
export function ComporMensagem({ autorEmail, autorNome, onEnviada }: ComporProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState('all');
  const [duracao, setDuracao] = useState(7);
  const [sending, setSending] = useState(false);

  const enviar = async () => {
    if (!title.trim()) { toast.error('Escreve o título da mensagem.'); return; }
    setSending(true);
    try {
      await createNotification({
        title: title.trim(), body: body.trim() || null, audience,
        created_by: autorEmail, created_by_nome: autorNome,
        painel: true, expira_em: expiraEmDias(duracao),
      });
      toast.success('Mensagem publicada no Diário e no centro de notificações.');
      setTitle(''); setBody(''); setAudience('all'); setDuracao(7); setOpen(false);
      onEnviada();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const selectCls = 'h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring';

  return (
    <>
      <Button type="button" size="sm" variant="secondary" className="h-8 gap-1.5 text-xs" onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5" /> Mensagem
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Megaphone className="h-4 w-4 text-primary" /> Nova mensagem</DialogTitle>
            <DialogDescription>Aparece no topo do Diário e também no centro de notificações (sino).</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Título" maxLength={120} aria-label="Título" />
            <Textarea value={body} onChange={e => setBody(e.target.value)} rows={3} placeholder="Mensagem (opcional)" aria-label="Mensagem" />
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1 text-xs text-muted-foreground">Para quem
                <select value={audience} onChange={e => setAudience(e.target.value)} className={selectCls}>
                  <option value="all">Todos</option>
                  {TABS.map(t => <option key={t.key} value={t.key}>Só: {t.label}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-xs text-muted-foreground">No Diário durante
                <select value={duracao} onChange={e => setDuracao(Number(e.target.value))} className={selectCls}>
                  {DURACOES.map(d => <option key={d.dias} value={d.dias}>{d.label}</option>)}
                </select>
              </label>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Dirigida a uma área, só quem tem acesso a essa área a vê. Depois do prazo sai do Diário e fica no sino.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={enviar} disabled={sending} className="gap-1.5">
              <Send className="h-3.5 w-3.5" />{sending ? 'A publicar…' : 'Publicar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
