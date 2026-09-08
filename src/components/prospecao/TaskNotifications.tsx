import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell, BellRing, AlertTriangle, CalendarClock, Building2, PartyPopper, UserPlus,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { listTaskAlerts, listRecentAccounts, type Account, type Scope, type Task, type TaskAlerts } from '@/lib/prospec';

/* ── Notificações de tarefas (Prospeção) ──────────────────────────────────────
 * Avisa o utilizador das tarefas com prazo para hoje e/ou em atraso. Combina:
 *  - um sino com contador (notificações "na app", sempre visível), que abre um
 *    painel com a lista;
 *  - notificações do browser (opt-in): quando ligadas e com permissão, dispara
 *    um aviso do sistema quando surgem tarefas novas para hoje / em atraso.
 * A lista atualiza-se periodicamente e ao voltar o foco à janela (os prazos
 * passam sozinhos). Cada tarefa só gera uma notificação do sistema por dia.
 * ──────────────────────────────────────────────────────────────────────────── */

const REFRESH_MS = 5 * 60 * 1000;
const ENABLED_KEY = 'prospec:notify:enabled';
/** Janela de "clientes recentes" mostrada no painel (dias). */
const NEW_ACCT_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
/** Contas já reconhecidas (contador) e já avisadas no browser (dedup). */
const ACCT_SEEN_KEY = 'prospec:newacct:seen';
const ACCT_NOTIFIED_KEY = 'prospec:newacct:notified';
const notifSupported = typeof window !== 'undefined' && 'Notification' in window;

const dayKey = () => new Date().toISOString().slice(0, 10);
const sentKey = () => `prospec:notify:sent:${dayKey()}`;

function loadSent(): Set<string> {
  try { const raw = localStorage.getItem(sentKey()); return new Set(raw ? JSON.parse(raw) as string[] : []); }
  catch { return new Set(); }
}
function saveSent(ids: Set<string>) {
  try { localStorage.setItem(sentKey(), JSON.stringify([...ids])); } catch { /* ignora */ }
}

/** Conjuntos persistentes de ids (limitados para não crescerem sem fim). */
function loadIdSet(key: string): Set<string> {
  try { const raw = localStorage.getItem(key); return new Set(raw ? JSON.parse(raw) as string[] : []); }
  catch { return new Set(); }
}
function saveIdSet(key: string, ids: Set<string>) {
  try { localStorage.setItem(key, JSON.stringify([...ids].slice(-400))); } catch { /* ignora */ }
}

const fmtTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }) : '';
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' }) : '';

interface Props {
  scope: Scope;
  /** Nomes das contas (id → nome) para dar contexto às tarefas. */
  accountName?: (id: string | null) => string | null;
  /** Muda para forçar recarregar (ex.: após concluir/criar tarefas noutro separador). */
  reloadKey?: number;
}

export function TaskNotifications({ scope, accountName, reloadKey }: Props) {
  const [alerts, setAlerts] = useState<TaskAlerts>({ overdue: [], today: [] });
  const [newAccounts, setNewAccounts] = useState<Account[]>([]);
  const [seenAccts, setSeenAccts] = useState<Set<string>>(() => loadIdSet(ACCT_SEEN_KEY));
  const [highlightAccts, setHighlightAccts] = useState<Set<string>>(new Set());
  const [enabled, setEnabled] = useState<boolean>(() => {
    try { return localStorage.getItem(ENABLED_KEY) === '1'; } catch { return false; }
  });
  const [open, setOpen] = useState(false);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const unseenAccounts = useMemo(
    () => newAccounts.filter(a => !seenAccts.has(a.id)),
    [newAccounts, seenAccts]);
  const total = alerts.overdue.length + alerts.today.length + unseenAccounts.length;

  // Dispara uma notificação do sistema (resumo) para tarefas ainda não avisadas hoje.
  const maybeNotify = useCallback((data: TaskAlerts) => {
    if (!notifSupported || !enabledRef.current || Notification.permission !== 'granted') return;
    const current = [...data.overdue, ...data.today].map(t => t.id);
    if (current.length === 0) return;
    const sent = loadSent();
    const fresh = current.filter(id => !sent.has(id));
    if (fresh.length === 0) return;

    const parts: string[] = [];
    if (data.today.length) parts.push(`${data.today.length} para hoje`);
    if (data.overdue.length) parts.push(`${data.overdue.length} em atraso`);
    try {
      const n = new Notification('Prospeção — tarefas', {
        body: parts.join(' · '),
        tag: 'prospec-tasks',
        icon: '/favicon.ico',
      });
      n.onclick = () => { window.focus(); n.close(); };
    } catch { /* alguns browsers exigem service worker; ignora em silêncio */ }
    current.forEach(id => sent.add(id));
    saveSent(sent);
  }, []);

  // Aviso do sistema para novos clientes lançados por vendedores (uma vez por conta).
  const maybeNotifyAccounts = useCallback((accts: Account[]) => {
    if (!notifSupported || !enabledRef.current || Notification.permission !== 'granted') return;
    if (accts.length === 0) return;
    const notified = loadIdSet(ACCT_NOTIFIED_KEY);
    const fresh = accts.filter(a => !notified.has(a.id));
    if (fresh.length === 0) return;
    const body = fresh.length === 1
      ? `${fresh[0].owner_nome || 'Um vendedor'} lançou: ${fresh[0].nome}`
      : `${fresh.length} novos clientes lançados na Prospeção`;
    try {
      const n = new Notification('Prospeção — novo cliente', { body, tag: 'prospec-new-account', icon: '/favicon.ico' });
      n.onclick = () => { window.focus(); n.close(); };
    } catch { /* alguns browsers exigem service worker; ignora */ }
    fresh.forEach(a => notified.add(a.id));
    saveIdSet(ACCT_NOTIFIED_KEY, notified);
  }, []);

  const load = useCallback(async () => {
    try {
      const data = await listTaskAlerts(scope);
      setAlerts(data);
      maybeNotify(data);
    } catch { /* silencioso — não estorva a página */ }
    // Novos clientes — só o diretor é notificado, e nunca das suas próprias contas.
    if (scope.isDirector) {
      try {
        const since = new Date(Date.now() - NEW_ACCT_WINDOW_MS).toISOString();
        const accts = (await listRecentAccounts(since)).filter(a => a.created_by !== scope.email);
        setNewAccounts(accts);
        maybeNotifyAccounts(accts);
      } catch { /* silencioso */ }
    }
  }, [scope, maybeNotify, maybeNotifyAccounts]);

  useEffect(() => {
    load();
    const id = window.setInterval(load, REFRESH_MS);
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => { window.clearInterval(id); window.removeEventListener('focus', onFocus); };
  }, [load, reloadKey]);

  const toggleEnabled = async () => {
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
    toast.success('Notificações de tarefas ativadas.');
    // Ao ligar, avisa já se houver algo pendente.
    maybeNotify(alerts);
  };

  // Ao abrir o painel: destaca os clientes ainda não vistos e marca-os como
  // reconhecidos (o contador baixa), mantendo-os na lista com o realce "novo".
  const handleOpenChange = useCallback((o: boolean) => {
    setOpen(o);
    if (o && newAccounts.length > 0) {
      setHighlightAccts(new Set(unseenAccounts.map(a => a.id)));
      setSeenAccts(prev => {
        const next = new Set(prev);
        newAccounts.forEach(a => next.add(a.id));
        saveIdSet(ACCT_SEEN_KEY, next);
        return next;
      });
    }
  }, [newAccounts, unseenAccounts]);

  const acctName = accountName ?? (() => null);

  const rows = useMemo(() => ([
    { key: 'overdue', label: 'Em atraso', icon: AlertTriangle, danger: true, items: alerts.overdue },
    { key: 'today', label: 'Para hoje', icon: CalendarClock, danger: false, items: alerts.today },
  ] as const), [alerts]);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="relative shrink-0 gap-1.5 h-9"
          title="Tarefas (hoje / em atraso) e novos clientes"
        >
          {total > 0 ? <BellRing className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
          <span className="hidden sm:inline text-xs">Alertas</span>
          {total > 0 && (
            <span className={cn(
              'absolute -top-1.5 -right-1.5 grid place-items-center h-5 min-w-[1.25rem] px-1 rounded-full text-[10px] font-bold leading-none',
              alerts.overdue.length > 0 ? 'bg-destructive text-destructive-foreground' : 'bg-primary text-primary-foreground',
            )}>
              {total}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b">
          <span className="text-sm font-semibold">Notificações</span>
          <button
            type="button"
            onClick={toggleEnabled}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors',
              enabled ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-accent',
            )}
            title={enabled ? 'Desligar notificações do browser' : 'Ligar notificações do browser'}
          >
            {enabled ? <BellRing className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5" />}
            {enabled ? 'Ativas' : 'Ativar no browser'}
          </button>
        </div>

        <div className="max-h-[22rem] overflow-auto p-2 space-y-3">
          {alerts.overdue.length + alerts.today.length === 0 && newAccounts.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-1.5 py-8 text-center">
              <span className="grid place-items-center h-10 w-10 rounded-full bg-muted text-muted-foreground">
                <PartyPopper className="h-5 w-5" />
              </span>
              <p className="text-sm font-medium">Nada pendente</p>
              <p className="text-xs text-muted-foreground">Sem tarefas nem clientes novos.</p>
            </div>
          ) : (<>
          {newAccounts.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-primary">
                <UserPlus className="h-3.5 w-3.5" />
                Novos clientes
                <span className="tabular-nums">({newAccounts.length})</span>
              </div>
              {newAccounts.slice(0, 15).map(a => (
                <div key={a.id} className={cn(
                  'rounded-md border px-2.5 py-1.5',
                  highlightAccts.has(a.id) ? 'border-primary/40 bg-primary/5' : 'border-border bg-card',
                )}>
                  <div className="flex items-center gap-1.5">
                    {highlightAccts.has(a.id) && <span className="h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0" />}
                    <span className="text-sm font-medium leading-snug">{a.nome}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground mt-0.5">
                    {a.owner_nome && (
                      <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" />{a.owner_nome}</span>
                    )}
                    <span className="inline-flex items-center gap-1">
                      <CalendarClock className="h-3 w-3" />{fmtDate(a.created_at)} · {fmtTime(a.created_at)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
          {rows.map(g => g.items.length > 0 && (
            <div key={g.key} className="space-y-1.5">
              <div className={cn(
                'flex items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide',
                g.danger ? 'text-destructive' : 'text-muted-foreground',
              )}>
                <g.icon className="h-3.5 w-3.5" />
                {g.label}
                <span className="tabular-nums">({g.items.length})</span>
              </div>
              {g.items.map(t => (
                <div key={t.id} className={cn(
                  'rounded-md border px-2.5 py-1.5',
                  g.danger ? 'border-destructive/30 bg-destructive/5' : 'border-border bg-card',
                )}>
                  <div className="text-sm font-medium leading-snug">{t.descricao}</div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground mt-0.5">
                    <span className={cn('inline-flex items-center gap-1', g.danger && 'text-destructive font-medium')}>
                      <CalendarClock className="h-3 w-3" />
                      {g.danger ? `${fmtDate(t.due_at)} · ${fmtTime(t.due_at)}` : fmtTime(t.due_at)}
                    </span>
                    {acctName(t.account_id) && (
                      <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" />{acctName(t.account_id)}</span>
                    )}
                    {scope.isDirector && t.owner_nome && (
                      <span className="inline-flex items-center gap-1">{t.owner_nome}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ))}
          </>)}
        </div>

        {notifSupported ? (
          <p className="px-3 py-2 text-[10px] text-muted-foreground border-t leading-snug">
            {enabled
              ? 'Recebe um aviso do sistema quando surgem tarefas para hoje / em atraso ou um vendedor lança um novo cliente.'
              : 'Ative as notificações do browser para receber avisos mesmo com o separador em segundo plano.'}
          </p>
        ) : (
          <p className="px-3 py-2 text-[10px] text-muted-foreground border-t">
            Este browser não suporta notificações do sistema — consulte a lista aqui.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
