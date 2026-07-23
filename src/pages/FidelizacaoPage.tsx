import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  HeartHandshake, Contact, BellRing, RefreshCw, ShieldCheck, Wallet, Gift,
  StickyNote, CalendarClock, Trash2, Loader2, Check, Link2, Sparkles, Plus, Car,
} from 'lucide-react';
import type { ControlRecord } from '@/types/data';
import type { LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/App';
import { useData } from '@/contexts/DataContext';
import {
  listNotes, createNote, deleteNote, type CrmNote,
  listReminders, createReminder, setReminderDone, deleteReminder,
  REMINDER_KINDS, type CrmReminder, type ReminderKind,
} from '@/lib/crm';

/* ── Tab Fidelização (admin) ──────────────────────────────────────────────────
 * CRM / acompanhamento de clientes.
 * Seg. 3: Notas · Seg. 4: Agenda · Seg. 5: ligação à carteira (cliente + control_id).
 * ──────────────────────────────────────────────────────────────────────────── */

type ClientOption = { cliente: string; control_id: string | null; hint: string };

const DAY = 86400000;

/* Parâmetros dos gatilhos automáticos (facilmente afináveis). */
const SUGGEST = {
  warrantyMonths: 36,       // fim de garantia após a matrícula (3 anos)
  financeMonths: 48,        // duração típica de financiamento (4 anos)
  repurchaseMinMonths: 30,  // janela de recompra (idade de posse)
  repurchaseMaxMonths: 48,
  leadDaysWarranty: 90,     // antecedência para contactar
  leadDaysFinance: 120,
  graceDays: 30,            // ainda mostrar até X dias depois de passar
};

type SuggType = 'garantia' | 'financiamento' | 'recompra';
type Suggestion = {
  key: string; type: SuggType; kind: ReminderKind; title: string; extra?: string;
  cliente: string; model: string; resp: string; control_id: string; due: Date;
};

const SUGG_STYLE: Record<SuggType, { label: string; cls: string }> = {
  garantia: { label: 'Garantia', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300' },
  financiamento: { label: 'Financiamento', cls: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300' },
  recompra: { label: 'Recompra', cls: 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300' },
};

const addMonths = (d: Date, m: number) => { const x = new Date(d); x.setMonth(x.getMonth() + m); return x; };

const fmtDateTime = (iso: string) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(d);
};

const fmtDate = (d: Date) =>
  new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);

const KIND_STYLE: Record<ReminderKind, string> = {
  geral: 'bg-slate-200 text-slate-700 dark:bg-slate-600/40 dark:text-slate-200',
  chamada: 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300',
  followup: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
  renovacao: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300',
  servico: 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300',
};
const kindLabel = (k: ReminderKind) => REMINDER_KINDS.find(x => x.value === k)?.label ?? k;

export default function FidelizacaoPage() {
  const { data } = useData();

  // Clientes distintos da carteira (control), com control_id do registo mais recente.
  const clients = useMemo<ClientOption[]>(() => {
    const map = new Map<string, { opt: ClientOption; ts: number }>();
    (data?.control ?? []).forEach(r => {
      const name = (r.cliente || '').trim();
      if (!name) return;
      const ts = r.neg ? r.neg.getTime() : 0;
      const key = name.toLowerCase();
      const prev = map.get(key);
      if (!prev || ts > prev.ts) {
        map.set(key, { ts, opt: { cliente: name, control_id: r.id ?? null, hint: [r.model, r.status].filter(Boolean).join(' · ') } });
      }
    });
    return Array.from(map.values()).map(v => v.opt).sort((a, b) => a.cliente.localeCompare(b.cliente));
  }, [data]);

  // Sinal partilhado para sincronizar agenda ↔ sugestões após criar lembretes.
  const [reload, setReload] = useState(0);
  const bump = useCallback(() => setReload(v => v + 1), []);

  return (
    <div className="max-w-5xl mx-auto space-y-4 animate-fade-in">
      {/* Cabeçalho */}
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="bg-[#002060] text-white px-4 py-3 flex items-center gap-3">
          <HeartHandshake className="h-6 w-6 flex-shrink-0" />
          <div className="min-w-0">
            <h1 className="text-base font-bold leading-tight">Fidelização</h1>
            <p className="text-[11px] text-white/70">CRM e acompanhamento de clientes</p>
          </div>
          <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide bg-amber-400 text-black px-2 py-1 rounded whitespace-nowrap">
            Em construção
          </span>
        </div>
        <div className="p-4 text-xs text-muted-foreground leading-relaxed">
          Agenda de lembretes e notas por cliente. Escreve o nome do cliente para o ligares à carteira
          (sugestões a partir dos dados existentes) ou introduz um nome novo livremente.
        </div>
      </div>

      <RemindersPanel clients={clients} reloadSignal={reload} onChange={bump} />
      <SuggestionsPanel control={data?.control ?? []} reloadSignal={reload} onCreated={bump} />
      <NotesPanel clients={clients} />
      <ClientFichaPanel control={data?.control ?? []} clients={clients} reloadSignal={reload} />

      {/* Restantes módulos (em construção) */}
      <Section title="Em breve — CRM base">
        <FeatureCard icon={BellRing} title="Follow-ups"
          desc="Sequências de acompanhamento e alertas de tarefas por fechar." />
      </Section>

      <Section title="Em breve — Fidelização automóvel">
        <FeatureCard icon={RefreshCw} title="Recompra prevista"
          desc="Estimativa de substituição pela idade de posse; oportunidade de upgrade." />
        <FeatureCard icon={ShieldCheck} title="Fim de garantia / revisão"
          desc="Alertas de fim de garantia, revisão e IPO para contacto proativo." />
        <FeatureCard icon={Wallet} title="Fim de financiamento / renting"
          desc="Gatilho de renovação quando o contrato se aproxima do fim." />
        <FeatureCard icon={Gift} title="Aniversários & cortesia"
          desc="Aniversário do cliente e do negócio para contactos de relação." />
      </Section>
    </div>
  );
}

/* ── Autocomplete de cliente (ligação à carteira) ─────────────────────────── */

function ClientAutocomplete({ value, options, onSelect, placeholder, className }: {
  value: string;
  options: ClientOption[];
  onSelect: (cliente: string, controlId: string | null) => void;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    const base = q ? options.filter(o => o.cliente.toLowerCase().includes(q)) : options;
    return base.slice(0, 30);
  }, [value, options]);

  return (
    <div className={`relative ${className ?? ''}`}>
      <input
        value={value}
        onChange={e => { onSelect(e.target.value, null); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        placeholder={placeholder}
        className="w-full px-2 py-1.5 text-xs rounded bg-background border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-[#002060]"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-20 left-0 right-0 mt-1 max-h-48 overflow-auto rounded-md border border-border bg-card shadow-lg py-1">
          {filtered.map(o => (
            <li key={`${o.cliente}-${o.control_id ?? 'x'}`}>
              <button
                type="button"
                onMouseDown={e => { e.preventDefault(); onSelect(o.cliente, o.control_id); setOpen(false); }}
                className="w-full text-left px-2 py-1 hover:bg-muted/60 flex items-center justify-between gap-2"
              >
                <span className="text-xs text-foreground truncate">{o.cliente}</span>
                {o.hint && <span className="text-[10px] text-muted-foreground truncate flex-shrink-0">{o.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LinkedHint({ linked }: { linked: boolean }) {
  if (!linked) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-green-600 dark:text-green-400">
      <Link2 className="h-3 w-3" /> ligado à carteira
    </span>
  );
}

/* ── Agenda & lembretes ───────────────────────────────────────────────────── */

function RemindersPanel({ clients, reloadSignal, onChange }: { clients: ClientOption[]; reloadSignal: number; onChange: () => void }) {
  const { session } = useAuth();
  const email = session?.user.email ?? null;

  const [items, setItems] = useState<CrmReminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [cliente, setCliente] = useState('');
  const [controlId, setControlId] = useState<string | null>(null);
  const [kind, setKind] = useState<ReminderKind>('geral');
  const [due, setDue] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try { setItems(await listReminders({ done: false })); }
    catch { toast.error('Não foi possível carregar os lembretes.'); }
    finally { if (!silent) setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (reloadSignal > 0) load(true); }, [reloadSignal, load]);

  async function add() {
    const t = title.trim();
    if (!t || saving) return;
    setSaving(true);
    try {
      const r = await createReminder({
        title: t,
        cliente: cliente.trim() || null,
        control_id: controlId,
        kind,
        due_at: due ? new Date(due).toISOString() : null,
        created_by: email,
      });
      setItems(prev => [...prev, r].sort(sortByDue));
      setTitle(''); setCliente(''); setControlId(null); setKind('geral'); setDue('');
      toast.success('Lembrete criado.');
      onChange();
    } catch { toast.error('Não foi possível criar o lembrete.'); }
    finally { setSaving(false); }
  }

  async function done(id: string) {
    try { await setReminderDone(id, true); setItems(prev => prev.filter(r => r.id !== id)); toast.success('Lembrete concluído.'); onChange(); }
    catch { toast.error('Não foi possível concluir o lembrete.'); }
  }
  async function remove(id: string) {
    if (!window.confirm('Apagar este lembrete?')) return;
    try { await deleteReminder(id); setItems(prev => prev.filter(r => r.id !== id)); toast.success('Lembrete apagado.'); onChange(); }
    catch { toast.error('Não foi possível apagar o lembrete.'); }
  }

  const groups = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const todayEnd = todayStart + 24 * 3600 * 1000 - 1;
    const g = { overdue: [] as CrmReminder[], today: [] as CrmReminder[], upcoming: [] as CrmReminder[], undated: [] as CrmReminder[] };
    items.forEach(r => {
      if (!r.due_at) { g.undated.push(r); return; }
      const ts = new Date(r.due_at).getTime();
      if (ts < todayStart) g.overdue.push(r);
      else if (ts <= todayEnd) g.today.push(r);
      else g.upcoming.push(r);
    });
    return g;
  }, [items]);

  const row = (r: CrmReminder, tone: 'overdue' | 'normal') => (
    <div key={r.id} className="flex items-start gap-2 rounded border border-border/70 bg-muted/30 p-2">
      <button
        onClick={() => done(r.id)}
        title="Marcar como concluído"
        className="group mt-0.5 flex-shrink-0 h-4 w-4 rounded-full border-2 border-muted-foreground/40 hover:border-green-500 hover:bg-green-500/10 flex items-center justify-center transition-colors"
      >
        <Check className="h-2.5 w-2.5 text-green-600 opacity-0 group-hover:opacity-100" />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`text-[9px] font-semibold uppercase rounded px-1 py-0.5 ${KIND_STYLE[r.kind]}`}>{kindLabel(r.kind)}</span>
          <span className="text-xs font-medium text-foreground break-words">{r.title}</span>
        </div>
        {(r.cliente || r.body) && (
          <p className="text-[11px] text-muted-foreground mt-0.5 break-words">
            {r.cliente ? <span className="font-medium text-foreground/80">{r.cliente}</span> : null}
            {r.cliente && r.control_id ? <Link2 className="inline h-2.5 w-2.5 ml-0.5 mb-0.5 text-green-600 dark:text-green-400" /> : null}
            {r.cliente && r.body ? ' — ' : ''}{r.body ?? ''}
          </p>
        )}
        {r.due_at && (
          <div className={`text-[10px] mt-0.5 ${tone === 'overdue' ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
            {fmtDateTime(r.due_at)}
          </div>
        )}
      </div>
      <button onClick={() => remove(r.id)} title="Apagar" className="flex-shrink-0 text-muted-foreground hover:text-destructive transition-colors">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );

  const total = items.length;

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="px-3 py-2 border-b border-border flex items-center gap-2">
        <CalendarClock className="h-4 w-4 text-[#002060] dark:text-sky-300" />
        <h2 className="text-xs font-semibold text-foreground uppercase tracking-wide">Agenda &amp; lembretes</h2>
        {groups.overdue.length > 0 && (
          <span className="text-[10px] font-semibold text-destructive bg-destructive/10 rounded px-1.5 py-0.5">{groups.overdue.length} em atraso</span>
        )}
        <span className="ml-auto text-[10px] text-muted-foreground">{total}</span>
      </div>

      <div className="p-3 space-y-3">
        <div className="space-y-2">
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') add(); }}
            placeholder="O que fazer? (ex.: Ligar ao cliente sobre proposta)"
            className="w-full px-2 py-1.5 text-xs rounded bg-background border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-[#002060]"
          />
          <div className="flex flex-wrap gap-2 items-start">
            <ClientAutocomplete
              className="flex-1 min-w-[9rem]"
              value={cliente}
              options={clients}
              placeholder="Cliente (opcional)"
              onSelect={(c, id) => { setCliente(c); setControlId(id); }}
            />
            <select
              value={kind}
              onChange={e => setKind(e.target.value as ReminderKind)}
              className="px-2 py-1.5 text-xs rounded bg-background border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-[#002060]"
            >
              {REMINDER_KINDS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
            <input
              type="datetime-local"
              value={due}
              onChange={e => setDue(e.target.value)}
              className="px-2 py-1.5 text-xs rounded bg-background border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-[#002060]"
            />
            <button
              onClick={add}
              disabled={!title.trim() || saving}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded bg-[#002060] text-white font-semibold hover:bg-[#002060]/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Adicionar
            </button>
          </div>
          <LinkedHint linked={controlId !== null} />
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-2"><Loader2 className="h-3.5 w-3.5 animate-spin" /> A carregar…</div>
        ) : total === 0 ? (
          <p className="text-xs text-muted-foreground py-2 text-center">Sem lembretes por concluir. Cria o primeiro acima.</p>
        ) : (
          <div className="space-y-3">
            {groups.overdue.length > 0 && <Group label="Em atraso" tone="overdue">{groups.overdue.map(r => row(r, 'overdue'))}</Group>}
            {groups.today.length > 0 && <Group label="Hoje">{groups.today.map(r => row(r, 'normal'))}</Group>}
            {groups.upcoming.length > 0 && <Group label="Próximos">{groups.upcoming.map(r => row(r, 'normal'))}</Group>}
            {groups.undated.length > 0 && <Group label="Sem data">{groups.undated.map(r => row(r, 'normal'))}</Group>}
          </div>
        )}
      </div>
    </div>
  );
}

const sortByDue = (a: CrmReminder, b: CrmReminder) => {
  if (!a.due_at && !b.due_at) return 0;
  if (!a.due_at) return 1;
  if (!b.due_at) return -1;
  return new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
};

function Group({ label, tone, children }: { label: string; tone?: 'overdue'; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className={`text-[10px] font-semibold uppercase tracking-wide ${tone === 'overdue' ? 'text-destructive' : 'text-muted-foreground'}`}>{label}</p>
      {children}
    </div>
  );
}

/* ── Sugestões automáticas (gatilhos de fidelização) ──────────────────────── */

function SuggestionsPanel({ control, reloadSignal, onCreated }: { control: ControlRecord[]; reloadSignal: number; onCreated: () => void }) {
  const { session } = useAuth();
  const email = session?.user.email ?? null;

  const [linkedIds, setLinkedIds] = useState<Set<string>>(new Set()); // control_ids com lembrete aberto
  const [hidden, setHidden] = useState<Set<string>>(new Set());       // criadas nesta sessão
  const [creating, setCreating] = useState<string | null>(null);

  // control_ids que já têm lembrete aberto — para não sugerir repetido.
  useEffect(() => {
    let active = true;
    listReminders({ done: false })
      .then(rs => { if (active) setLinkedIds(new Set(rs.map(r => r.control_id).filter(Boolean) as string[])); })
      .catch(() => {});
    return () => { active = false; };
  }, [reloadSignal]);

  const suggestions = useMemo<Suggestion[]>(() => {
    const now = Date.now();
    const out: Suggestion[] = [];
    control.forEach(r => {
      if (r.status !== 'Retail' || !(r.type === 'VN' || r.type === 'VD') || !r.id) return;
      const cliente = (r.cliente || '').trim();
      if (!cliente) return;
      const base = r.date298 || r.dmat;
      const model = r.model || 'viatura';
      if (r.dmat) {
        const end = addMonths(r.dmat, SUGGEST.warrantyMonths);
        const days = (end.getTime() - now) / DAY;
        if (days <= SUGGEST.leadDaysWarranty && days >= -SUGGEST.graceDays) {
          out.push({ key: `garantia-${r.id}`, type: 'garantia', kind: 'servico', title: `Fim de garantia — ${model}`, cliente, model, resp: r.resp, control_id: r.id, due: end });
        }
      }
      if (base && r.fin && r.fin.toUpperCase() !== 'PP') {
        const end = addMonths(base, SUGGEST.financeMonths);
        const days = (end.getTime() - now) / DAY;
        if (days <= SUGGEST.leadDaysFinance && days >= -SUGGEST.graceDays) {
          out.push({ key: `financiamento-${r.id}`, type: 'financiamento', kind: 'renovacao', title: `Fim de financiamento — ${model}`, cliente, model, resp: r.resp, control_id: r.id, due: end });
        }
      }
      if (base) {
        const months = (now - base.getTime()) / (DAY * 30.44);
        if (months >= SUGGEST.repurchaseMinMonths && months <= SUGGEST.repurchaseMaxMonths) {
          out.push({ key: `recompra-${r.id}`, type: 'recompra', kind: 'renovacao', title: `Recompra prevista — ${model}`, extra: `${Math.round(months)} meses de posse`, cliente, model, resp: r.resp, control_id: r.id, due: new Date(now) });
        }
      }
    });
    return out.sort((a, b) => a.due.getTime() - b.due.getTime());
  }, [control]);

  const visible = suggestions.filter(s => !hidden.has(s.key) && !linkedIds.has(s.control_id)).slice(0, 30);

  async function createFrom(s: Suggestion) {
    if (creating) return;
    setCreating(s.key);
    try {
      await createReminder({
        title: s.title, cliente: s.cliente, control_id: s.control_id,
        kind: s.kind, due_at: s.due.toISOString(), body: s.extra ?? null, created_by: email,
      });
      setHidden(prev => new Set(prev).add(s.key));
      toast.success('Lembrete criado a partir da sugestão.');
      onCreated();
    } catch { toast.error('Não foi possível criar o lembrete.'); }
    finally { setCreating(null); }
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="px-3 py-2 border-b border-border flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-[#002060] dark:text-sky-300" />
        <h2 className="text-xs font-semibold text-foreground uppercase tracking-wide">Sugestões automáticas</h2>
        <span className="ml-auto text-[10px] text-muted-foreground">{visible.length}</span>
      </div>
      <div className="p-3">
        {visible.length === 0 ? (
          <p className="text-xs text-muted-foreground py-1 text-center">
            Sem sugestões de momento. Derivadas das datas da carteira (fim de garantia, financiamento e recompra prevista).
          </p>
        ) : (
          <div className="space-y-1.5">
            {visible.map(s => (
              <div key={s.key} className="flex items-start gap-2 rounded border border-border/70 bg-muted/30 p-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`text-[9px] font-semibold uppercase rounded px-1 py-0.5 ${SUGG_STYLE[s.type].cls}`}>{SUGG_STYLE[s.type].label}</span>
                    <span className="text-xs font-medium text-foreground break-words">{s.cliente}</span>
                    <span className="text-[11px] text-muted-foreground">· {s.model}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {s.type === 'recompra' ? s.extra : `Previsto: ${fmtDate(s.due)}`}{s.resp ? ` · ${s.resp}` : ''}
                  </div>
                </div>
                <button
                  onClick={() => createFrom(s)}
                  disabled={creating === s.key}
                  title="Criar lembrete a partir desta sugestão"
                  className="flex-shrink-0 flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-[#002060]/30 text-[#002060] dark:text-sky-300 dark:border-sky-400/30 hover:bg-[#002060]/10 dark:hover:bg-sky-500/10 transition-colors disabled:opacity-40"
                >
                  {creating === s.key ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                  Lembrete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Ficha de cliente (viaturas + histórico) ──────────────────────────────── */

function ClientFichaPanel({ control, clients, reloadSignal }: { control: ControlRecord[]; clients: ClientOption[]; reloadSignal: number }) {
  const [cliente, setCliente] = useState('');
  const [notes, setNotes] = useState<CrmNote[]>([]);
  const [reminders, setReminders] = useState<CrmReminder[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [ns, rs] = await Promise.all([listNotes(), listReminders()]);
      setNotes(ns); setReminders(rs); setLoaded(true);
    } catch { toast.error('Não foi possível carregar o histórico.'); }
    finally { setLoading(false); }
  }, []);

  // Recarrega o histórico quando algo muda noutro painel (sinal partilhado), se já foi aberto.
  useEffect(() => { if (loaded) fetchAll(); }, [reloadSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  const key = cliente.trim().toLowerCase();

  const viaturas = useMemo(
    () => (key ? control.filter(r => (r.cliente || '').trim().toLowerCase() === key) : []),
    [control, key]);

  const timeline = useMemo(() => {
    if (!key) return [];
    const items: { id: string; kind: 'nota' | 'lembrete'; date: Date; title: string; body?: string | null; done?: boolean; rkind?: ReminderKind }[] = [];
    notes.forEach(n => { if ((n.cliente || '').trim().toLowerCase() === key) items.push({ id: 'n' + n.id, kind: 'nota', date: new Date(n.created_at), title: n.body }); });
    reminders.forEach(r => { if ((r.cliente || '').trim().toLowerCase() === key) items.push({ id: 'r' + r.id, kind: 'lembrete', date: new Date(r.due_at || r.created_at), title: r.title, body: r.body, done: r.done, rkind: r.kind }); });
    return items.sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [notes, reminders, key]);

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="px-3 py-2 border-b border-border flex items-center gap-2">
        <Contact className="h-4 w-4 text-[#002060] dark:text-sky-300" />
        <h2 className="text-xs font-semibold text-foreground uppercase tracking-wide">Ficha de cliente</h2>
      </div>
      <div className="p-3 space-y-3">
        <ClientAutocomplete
          value={cliente}
          options={clients}
          placeholder="Procurar cliente…"
          onSelect={c => { setCliente(c); if (!loaded && !loading) fetchAll(); }}
        />

        {!key ? (
          <p className="text-xs text-muted-foreground py-1 text-center">Escolhe um cliente para ver as viaturas e o histórico.</p>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Viaturas na carteira</p>
              {viaturas.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">Sem registos na carteira para este nome.</p>
              ) : viaturas.map((r, i) => (
                <div key={r.id ?? i} className="flex items-center gap-2 rounded border border-border/70 bg-muted/30 p-2 text-[11px]">
                  <Car className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="font-medium text-foreground">{[r.model, r.version].filter(Boolean).join(' ') || '—'}</span>
                  <span className="text-muted-foreground">· {r.status}</span>
                  {r.mat && <span className="text-muted-foreground">· {r.mat}</span>}
                  {r.date298 && <span className="text-muted-foreground ml-auto whitespace-nowrap">entregue {fmtDate(r.date298)}</span>}
                </div>
              ))}
            </div>

            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Histórico</p>
              {loading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-1"><Loader2 className="h-3.5 w-3.5 animate-spin" /> A carregar…</div>
              ) : timeline.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">Sem notas nem lembretes para este cliente.</p>
              ) : timeline.map(it => (
                <div key={it.id} className="flex items-start gap-2 rounded border border-border/70 bg-muted/30 p-2">
                  {it.kind === 'nota'
                    ? <StickyNote className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
                    : <CalendarClock className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {it.kind === 'lembrete' && it.rkind && <span className={`text-[9px] font-semibold uppercase rounded px-1 py-0.5 ${KIND_STYLE[it.rkind]}`}>{kindLabel(it.rkind)}</span>}
                      {it.kind === 'lembrete' && it.done && <span className="text-[9px] font-semibold uppercase rounded px-1 py-0.5 bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300">Feito</span>}
                      <span className="text-xs text-foreground break-words whitespace-pre-wrap">{it.title}</span>
                    </div>
                    {it.body && <p className="text-[11px] text-muted-foreground mt-0.5 break-words whitespace-pre-wrap">{it.body}</p>}
                    <div className="text-[10px] text-muted-foreground mt-0.5">{fmtDate(it.date)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Notas ────────────────────────────────────────────────────────────────── */

function NotesPanel({ clients }: { clients: ClientOption[] }) {
  const { session } = useAuth();
  const email = session?.user.email ?? null;

  const [notes, setNotes] = useState<CrmNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [cliente, setCliente] = useState('');
  const [controlId, setControlId] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setNotes(await listNotes()); }
    catch { toast.error('Não foi possível carregar as notas.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function add() {
    const text = body.trim();
    if (!text || saving) return;
    setSaving(true);
    try {
      const note = await createNote({ body: text, cliente: cliente.trim() || null, control_id: controlId, created_by: email });
      setNotes(prev => [note, ...prev]);
      setBody(''); setCliente(''); setControlId(null);
      toast.success('Nota adicionada.');
    } catch { toast.error('Não foi possível adicionar a nota.'); }
    finally { setSaving(false); }
  }
  async function remove(id: string) {
    if (!window.confirm('Apagar esta nota?')) return;
    try { await deleteNote(id); setNotes(prev => prev.filter(n => n.id !== id)); toast.success('Nota apagada.'); }
    catch { toast.error('Não foi possível apagar a nota.'); }
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="px-3 py-2 border-b border-border flex items-center gap-2">
        <StickyNote className="h-4 w-4 text-[#002060] dark:text-sky-300" />
        <h2 className="text-xs font-semibold text-foreground uppercase tracking-wide">Notas</h2>
        <span className="ml-auto text-[10px] text-muted-foreground">{notes.length}</span>
      </div>

      <div className="p-3 space-y-3">
        <div className="space-y-2">
          <ClientAutocomplete
            value={cliente}
            options={clients}
            placeholder="Cliente (opcional)"
            onSelect={(c, id) => { setCliente(c); setControlId(id); }}
          />
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') add(); }}
            placeholder="Escreve uma nota…  (Ctrl/⌘ + Enter para guardar)"
            rows={2}
            className="w-full px-2 py-1.5 text-xs rounded bg-background border border-border text-foreground resize-y focus:outline-none focus:ring-1 focus:ring-[#002060]"
          />
          <div className="flex items-center justify-between gap-2">
            <LinkedHint linked={controlId !== null} />
            <button
              onClick={add}
              disabled={!body.trim() || saving}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs rounded bg-[#002060] text-white font-semibold hover:bg-[#002060]/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Adicionar nota
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2"><Loader2 className="h-3.5 w-3.5 animate-spin" /> A carregar…</div>
          ) : notes.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2 text-center">Ainda sem notas. Adiciona a primeira acima.</p>
          ) : (
            notes.map(note => (
              <div key={note.id} className="rounded border border-border/70 bg-muted/30 p-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    {note.cliente && (
                      <span className="inline-flex items-center gap-1 mb-0.5 text-[10px] font-semibold text-[#002060] dark:text-sky-300 bg-[#002060]/10 dark:bg-sky-500/15 rounded px-1.5 py-0.5">
                        {note.cliente}
                        {note.control_id && <Link2 className="h-2.5 w-2.5 text-green-600 dark:text-green-400" />}
                      </span>
                    )}
                    <p className="text-xs text-foreground whitespace-pre-wrap break-words">{note.body}</p>
                  </div>
                  <button onClick={() => remove(note.id)} title="Apagar nota" className="flex-shrink-0 text-muted-foreground hover:text-destructive transition-colors">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="text-[10px] text-muted-foreground mt-1">
                  {fmtDateTime(note.created_at)}{note.created_by ? ` · ${note.created_by}` : ''}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Cartões «em breve» ───────────────────────────────────────────────────── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground px-0.5">{title}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{children}</div>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, desc }: { icon: LucideIcon; title: string; desc: string }) {
  return (
    <div className="relative rounded-lg border border-border bg-card p-3 flex gap-3">
      <div className="flex-shrink-0 h-9 w-9 rounded-md bg-[#002060]/10 text-[#002060] dark:bg-sky-500/15 dark:text-sky-300 flex items-center justify-center">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold text-foreground">{title}</h3>
          <span className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground border border-border rounded px-1 py-0.5">Em breve</span>
        </div>
        <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{desc}</p>
      </div>
    </div>
  );
}
