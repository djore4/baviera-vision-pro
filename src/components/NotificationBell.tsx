import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell, BellRing, Megaphone, Send, Trash2, PartyPopper,
  AlertTriangle, CalendarClock, Building2, UserPlus, ClipboardList,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuth } from '@/App';
import { usePermissions } from '@/contexts/PermissionsContext';
import { useProspecScope } from '@/hooks/useProspecScope';
import { TABS } from '@/lib/permissions';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  listNotifications, listReadIds, markRead, createNotification, deleteNotification,
  type Notification,
} from '@/lib/notifications';
import {
  listTaskAlerts, listRecentAccounts, type Account, type Task, type TaskAlerts,
} from '@/lib/prospec';

/* ── Centro de notificações global (todas as áreas) ───────────────────────────
 * Sino no topo, visível em todos os perfis. Mostra as notificações destinadas a
 * quem está autenticado: as gerais (audience 'all') e as de uma área específica
 * — estas só a quem tem acesso a essa área (gating por permissões). O admin pode
 * enviar uma mensagem (geral ou dirigida a uma área). Aviso do browser opcional.
 * ──────────────────────────────────────────────────────────────────────────── */

const REFRESH_MS = 5 * 60 * 1000;
const ENABLED_KEY = 'notif:enabled';
const NOTIFIED_KEY = 'notif:notified';
/** Janela de "clientes recentes" do Diário de Bordo mostrada no painel (dias). */
const NEW_ACCT_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
/** Itens do Diário de Bordo já reconhecidos (para o contador do sino). */
const PROSPEC_SEEN_KEY = 'notif:prospec:seen';
const notifSupported = typeof window !== 'undefined' && 'Notification' in window;

const fmtWhen = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' })} · ${d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}`;
};
const fmtTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }) : '';
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' }) : '';
const audienceLabel = (a: string) => a === 'all' ? 'Todos' : (TABS.find(t => t.key === a)?.label ?? a);

function loadIdSet(key: string): Set<string> {
  try { const raw = localStorage.getItem(key); return new Set(raw ? JSON.parse(raw) as string[] : []); }
  catch { return new Set(); }
}
function saveIdSet(key: string, ids: Set<string>) {
  try { localStorage.setItem(key, JSON.stringify([...ids].slice(-400))); } catch { /* ignora */ }
}

export function NotificationBell() {
  const { session } = useAuth();
  const { canView, isAdmin, me } = usePermissions();
  const { scope } = useProspecScope();
  const email = session?.user.email ?? null;
  const myNome = me?.nome ?? email ?? null;
  // Os alertas do Diário de Bordo (Prospeção) surgem também aqui, no centro de
  // notificações, para quem tem acesso a essa área (mesmo gating por permissões).
  const hasProspec = canView('prospecao');

  const [items, setItems] = useState<Notification[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [prospecAlerts, setProspecAlerts] = useState<TaskAlerts>({ overdue: [], today: [] });
  const [prospecAccounts, setProspecAccounts] = useState<Account[]>([]);
  const [prospecSeen, setProspecSeen] = useState<Set<string>>(() => loadIdSet(PROSPEC_SEEN_KEY));
  const [open, setOpen] = useState(false);
  const [composing, setComposing] = useState(false);
  const [enabled, setEnabled] = useState<boolean>(() => {
    try { return localStorage.getItem(ENABLED_KEY) === '1'; } catch { return false; }
  });
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  // Compositor (admin).
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState('all');
  const [sending, setSending] = useState(false);

  // Só as notificações que este perfil pode ver (gating por permissões).
  const visible = useMemo(
    () => items.filter(n => n.audience === 'all' || canView(n.audience)),
    [items, canView]);
  const unread = useMemo(() => visible.filter(n => !readIds.has(n.id)), [visible, readIds]);

  // Itens do Diário de Bordo com id estável (para contador/realce "novo").
  const prospecItems = useMemo(() => {
    if (!hasProspec) return { overdue: [], today: [], accounts: [], ids: [] as string[] };
    const overdue = prospecAlerts.overdue.map(t => ({ id: `task:${t.id}`, task: t }));
    const today = prospecAlerts.today.map(t => ({ id: `task:${t.id}`, task: t }));
    const accounts = prospecAccounts.map(a => ({ id: `acct:${a.id}`, account: a }));
    return { overdue, today, accounts, ids: [...overdue, ...today, ...accounts].map(x => x.id) };
  }, [hasProspec, prospecAlerts, prospecAccounts]);
  const prospecTotal = prospecItems.ids.length;
  const unseenProspec = useMemo(
    () => prospecItems.ids.filter(id => !prospecSeen.has(id)),
    [prospecItems, prospecSeen]);

  const unreadCount = unread.length + unseenProspec.length;

  const maybeNotify = useCallback((unreadItems: Notification[]) => {
    if (!notifSupported || !enabledRef.current || Notification.permission !== 'granted') return;
    if (unreadItems.length === 0) return;
    const notified = loadIdSet(NOTIFIED_KEY);
    const fresh = unreadItems.filter(n => !notified.has(n.id));
    if (fresh.length === 0) return;
    const body = fresh.length === 1 ? fresh[0].title : `${fresh.length} notificações novas`;
    try {
      const n = new Notification('Caetano BMW', { body, tag: 'app-notif', icon: '/favicon.ico' });
      n.onclick = () => { window.focus(); n.close(); };
    } catch { /* ignora */ }
    fresh.forEach(n => notified.add(n.id));
    saveIdSet(NOTIFIED_KEY, notified);
  }, []);

  const load = useCallback(async () => {
    if (!email) return;
    try {
      const [list, reads] = await Promise.all([listNotifications(), listReadIds(email)]);
      setItems(list);
      setReadIds(reads);
      const vis = list.filter(n => n.audience === 'all' || canView(n.audience));
      maybeNotify(vis.filter(n => !reads.has(n.id)));
    } catch { /* silencioso */ }
    // Alertas do Diário de Bordo (Prospeção), só para quem tem acesso.
    if (hasProspec) {
      try { setProspecAlerts(await listTaskAlerts(scope)); } catch { /* silencioso */ }
      // Novos clientes lançados por vendedores — só o diretor, nunca as suas.
      if (scope.isDirector) {
        try {
          const since = new Date(Date.now() - NEW_ACCT_WINDOW_MS).toISOString();
          const accts = (await listRecentAccounts(since)).filter(a => a.created_by !== scope.email);
          setProspecAccounts(accts);
        } catch { /* silencioso */ }
      }
    } else {
      setProspecAlerts({ overdue: [], today: [] });
      setProspecAccounts([]);
    }
  }, [email, canView, maybeNotify, hasProspec, scope]);

  useEffect(() => {
    load();
    const id = window.setInterval(load, REFRESH_MS);
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => { window.clearInterval(id); window.removeEventListener('focus', onFocus); };
  }, [load]);

  // Ao abrir, marca as visíveis como lidas (o contador baixa).
  const handleOpenChange = useCallback((o: boolean) => {
    setOpen(o);
    if (o && email && unread.length > 0) {
      const ids = unread.map(n => n.id);
      setReadIds(prev => { const next = new Set(prev); ids.forEach(i => next.add(i)); return next; });
      markRead(ids, email).catch(() => { /* ignora */ });
    }
    // Reconhece os alertas do Diário de Bordo (baixa o contador; ficam na lista).
    if (o && unseenProspec.length > 0) {
      setProspecSeen(prev => {
        const next = new Set(prev);
        unseenProspec.forEach(i => next.add(i));
        saveIdSet(PROSPEC_SEEN_KEY, next);
        return next;
      });
    }
    if (!o) setComposing(false);
  }, [email, unread, unseenProspec]);

  const toggleBrowser = async () => {
    if (enabled) {
      setEnabled(false);
      try { localStorage.setItem(ENABLED_KEY, '0'); } catch { /* ignora */ }
      return;
    }
    if (!notifSupported) { toast.error('Este browser não suporta notificações.'); return; }
    let perm = Notification.permission;
    if (perm === 'default') { try { perm = await Notification.requestPermission(); } catch { /* ignora */ } }
    if (perm !== 'granted') { toast.error('Permissão de notificações negada pelo browser.'); return; }
    setEnabled(true);
    try { localStorage.setItem(ENABLED_KEY, '1'); } catch { /* ignora */ }
    toast.success('Notificações do browser ativadas.');
  };

  const send = async () => {
    if (!title.trim()) { toast.error('Escreve o título da mensagem.'); return; }
    setSending(true);
    try {
      await createNotification({
        title: title.trim(),
        body: body.trim() || null,
        audience,
        created_by: email,
        created_by_nome: myNome,
      });
      toast.success('Mensagem enviada.');
      setTitle(''); setBody(''); setAudience('all'); setComposing(false);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await deleteNotification(id);
      setItems(prev => prev.filter(n => n.id !== id));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          className="relative text-muted-foreground hover:text-foreground"
          title="Notificações"
          aria-label="Notificações"
        >
          {unreadCount > 0 ? <BellRing className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
          {unreadCount > 0 && (
            <span className="absolute -top-2 -right-2 grid place-items-center h-4 min-w-[1rem] px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold leading-none">
              {unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b">
          <span className="text-sm font-semibold">Notificações</span>
          <div className="flex items-center gap-1.5">
            {notifSupported && (
              <button
                type="button"
                onClick={toggleBrowser}
                className={cn(
                  'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors',
                  enabled ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-accent',
                )}
                title={enabled ? 'Desligar avisos do browser' : 'Ligar avisos do browser'}
              >
                {enabled ? <BellRing className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5" />}
                Browser
              </button>
            )}
            {isAdmin && (
              <button
                type="button"
                onClick={() => setComposing(c => !c)}
                className={cn(
                  'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors',
                  composing ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-accent',
                )}
                title="Enviar mensagem"
              >
                <Megaphone className="h-3.5 w-3.5" /> Nova
              </button>
            )}
          </div>
        </div>

        {isAdmin && composing && (
          <div className="border-b bg-muted/30 p-2.5 space-y-2">
            <input
              value={title} onChange={e => setTitle(e.target.value)}
              placeholder="Título da mensagem"
              className="w-full px-2.5 py-1.5 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <textarea
              value={body} onChange={e => setBody(e.target.value)} rows={2}
              placeholder="Mensagem (opcional)"
              className="w-full px-2.5 py-1.5 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary resize-none"
            />
            <div className="flex items-center gap-2">
              <select
                value={audience} onChange={e => setAudience(e.target.value)}
                className="flex-1 min-w-0 px-2 py-1.5 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
                title="Quem recebe"
              >
                <option value="all">Todos</option>
                {TABS.map(t => <option key={t.key} value={t.key}>Só: {t.label}</option>)}
              </select>
              <Button size="sm" className="h-8 gap-1 text-[11px]" onClick={send} disabled={sending}>
                <Send className="h-3.5 w-3.5" />{sending ? 'A enviar…' : 'Enviar'}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              "Todos" chega a toda a gente. Dirigida a uma área, só quem tem acesso a essa área a recebe.
            </p>
          </div>
        )}

        <div className="max-h-[22rem] overflow-auto p-2 space-y-2">
          {visible.length === 0 && prospecTotal === 0 ? (
            <div className="flex flex-col items-center justify-center gap-1.5 py-8 text-center">
              <span className="grid place-items-center h-10 w-10 rounded-full bg-muted text-muted-foreground">
                <PartyPopper className="h-5 w-5" />
              </span>
              <p className="text-sm font-medium">Sem notificações</p>
              <p className="text-xs text-muted-foreground">Não há mensagens para ti.</p>
            </div>
          ) : (<>

          {/* Diário de Bordo — tarefas em atraso / para hoje e novos clientes. */}
          {prospecTotal > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-primary">
                <ClipboardList className="h-3.5 w-3.5" /> Diário de Bordo
              </div>

              {prospecItems.overdue.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-destructive">
                    <AlertTriangle className="h-3.5 w-3.5" /> Em atraso <span className="tabular-nums">({prospecItems.overdue.length})</span>
                  </div>
                  {prospecItems.overdue.map(({ id, task }) => {
                    const isNew = !prospecSeen.has(id);
                    return (
                      <div key={id} className={cn(
                        'rounded-md border px-2.5 py-1.5',
                        isNew ? 'border-primary/40 bg-primary/5' : 'border-destructive/30 bg-destructive/5',
                      )}>
                        <div className="flex items-start gap-1.5">
                          {isNew && <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0" />}
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium leading-snug">{task.descricao}</div>
                            <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground mt-0.5">
                              <span className="inline-flex items-center gap-1 text-destructive font-medium">
                                <CalendarClock className="h-3 w-3" />{fmtDate(task.due_at)} · {fmtTime(task.due_at)}
                              </span>
                              {scope.isDirector && task.owner_nome && (
                                <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" />{task.owner_nome}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {prospecItems.today.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <CalendarClock className="h-3.5 w-3.5" /> Para hoje <span className="tabular-nums">({prospecItems.today.length})</span>
                  </div>
                  {prospecItems.today.map(({ id, task }) => {
                    const isNew = !prospecSeen.has(id);
                    return (
                      <div key={id} className={cn(
                        'rounded-md border px-2.5 py-1.5',
                        isNew ? 'border-primary/40 bg-primary/5' : 'border-border bg-card',
                      )}>
                        <div className="flex items-start gap-1.5">
                          {isNew && <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0" />}
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium leading-snug">{task.descricao}</div>
                            <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground mt-0.5">
                              <span className="inline-flex items-center gap-1"><CalendarClock className="h-3 w-3" />{fmtTime(task.due_at)}</span>
                              {scope.isDirector && task.owner_nome && (
                                <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" />{task.owner_nome}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {prospecItems.accounts.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-primary">
                    <UserPlus className="h-3.5 w-3.5" /> Novos clientes <span className="tabular-nums">({prospecItems.accounts.length})</span>
                  </div>
                  {prospecItems.accounts.map(({ id, account }) => {
                    const isNew = !prospecSeen.has(id);
                    return (
                      <div key={id} className={cn(
                        'rounded-md border px-2.5 py-1.5',
                        isNew ? 'border-primary/40 bg-primary/5' : 'border-border bg-card',
                      )}>
                        <div className="flex items-center gap-1.5">
                          {isNew && <span className="h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0" />}
                          <span className="text-sm font-medium leading-snug">{account.nome}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground mt-0.5">
                          {account.owner_nome && (
                            <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" />{account.owner_nome}</span>
                          )}
                          <span className="inline-flex items-center gap-1">
                            <CalendarClock className="h-3 w-3" />{fmtDate(account.created_at)} · {fmtTime(account.created_at)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Mensagens da plataforma. */}
          {visible.length > 0 && (
            <div className="space-y-1.5">
              {prospecTotal > 0 && (
                <div className="flex items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <Megaphone className="h-3.5 w-3.5" /> Mensagens
                </div>
              )}
              {visible.map(n => {
                const isUnread = !readIds.has(n.id);
                return (
                  <div key={n.id} className={cn(
                    'rounded-md border px-2.5 py-1.5',
                    isUnread ? 'border-primary/40 bg-primary/5' : 'border-border bg-card',
                  )}>
                    <div className="flex items-start gap-1.5">
                      {isUnread && <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0" />}
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium leading-snug">{n.title}</div>
                        {n.body && <div className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">{n.body}</div>}
                        <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground mt-0.5">
                          <span>{n.created_by_nome || 'Administração'}</span>
                          <span>·</span>
                          <span>{fmtWhen(n.created_at)}</span>
                          {n.audience !== 'all' && (
                            <span className="rounded bg-muted px-1 py-0.5 text-[10px]">{audienceLabel(n.audience)}</span>
                          )}
                        </div>
                      </div>
                      {isAdmin && (
                        <button onClick={() => remove(n.id)} title="Eliminar" className="text-muted-foreground hover:text-destructive flex-shrink-0">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          </>)}
        </div>
      </PopoverContent>
    </Popover>
  );
}
