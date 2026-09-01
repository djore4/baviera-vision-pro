import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Car, Loader2, CheckCircle2, CalendarDays, Trash2, ChevronLeft, ChevronRight,
  BarChart3, FileSpreadsheet, Star, Info, User, PlayCircle, History, Download,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/App';
import { usePermissions } from '@/contexts/PermissionsContext';
import { useData } from '@/contexts/DataContext';
import {
  WASH_TYPES, WASH_TYPE_MAP, type WashTypeId, type CarWashCycle, type CarWashEvent,
  cycleStatus, effectiveAt, EVENT_ACTION_LABEL,
  listCycles, createCycle, startCycle, rescheduleCycle, deleteCycle, setQuality, exportCyclesToExcel,
  listEvents, exportEventsToCsv,
} from '@/lib/lavagem';
import { funLoadingLabel } from '@/lib/loading-messages';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter,
  AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel,
} from '@/components/ui/alert-dialog';

/* ── Tab Lavagem (admin) ───────────────────────────────────────────────────────
 * Landing page alcançada a partir da leitura de um QR code externo. Permite abrir
 * um ciclo de lavagem (matrícula/chassis + tipo) e encerrá-lo ("Terminar").
 * Em baixo, agenda semanal (dias úteis) com navegação entre semanas: cada lavagem
 * ocupa a altura correspondente à sua duração e é colorida por tipo.
 * ──────────────────────────────────────────────────────────────────────────── */

const WEEKDAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'];
const DAY_MS = 86400000;

/* Agenda — parâmetros de layout. */
const HOUR_PX = 64;                 // altura de 1 hora
const PX_PER_MIN = HOUR_PX / 60;    // altura por minuto (proporcional à duração)
const MIN_SLOT_PX = 22;             // altura mínima legível (lavagens muito curtas)
const GUTTER_PX = 48;               // largura do gutter de horas (w-12)
const SNAP_MIN = 5;                 // arredondamento ao arrastar (minutos)
const DRAG_THRESHOLD_PX = 4;        // deslocamento mínimo para distinguir arrasto de clique
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/* Horário de funcionamento da lavagem (em minutos desde a meia-noite).
 * Manhã 08:30–12:30 · Tarde 14:00–18:00 · Extra 18:00–19:00 (sujeito a
 * disponibilidade dos colaboradores). O resto do dia está encerrado. */
const H = (h: number, m = 0) => h * 60 + m;
const BUSINESS = {
  open: [
    { from: H(8, 30), to: H(12, 30) },
    { from: H(14, 0), to: H(18, 0) },
  ],
  extra: { from: H(18, 0), to: H(19, 0) },
};
const DEFAULT_START_MIN = H(8, 30);
const DEFAULT_END_MIN = H(19, 0);

/* Segunda-feira (00:00) da semana da data dada. */
function mondayOf(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const dow = x.getDay();                 // 0 = domingo
  const diff = dow === 0 ? -6 : 1 - dow;  // recuar até segunda
  x.setDate(x.getDate() + diff);
  return x;
}
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

const fmtTime = (iso: string) =>
  new Intl.DateTimeFormat('pt-PT', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
const fmtDayMonth = (d: Date) =>
  new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: '2-digit' }).format(d);

const minutesOfDay = (iso: string) => { const d = new Date(iso); return d.getHours() * 60 + d.getMinutes(); };
const fmtDayTime = (iso: string) =>
  new Intl.DateTimeFormat('pt-PT', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

/* Nome legível do interlocutor a partir do email (parte antes do @, com
 * separadores convertidos em espaços e iniciais maiúsculas). */
const personLabel = (email: string | null | undefined): string => {
  if (!email) return '';
  const local = email.split('@')[0];
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ') || email;
};

/* Cor da etiqueta de cada tipo de evento na tabela de auditoria. */
const EVENT_BADGE: Record<string, string> = {
  create: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
  reschedule: 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300',
  queue: 'bg-slate-200 text-slate-700 dark:bg-slate-600/40 dark:text-slate-200',
  start: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300',
  end: 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300',
  quality: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
  delete: 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300',
};

/* Converte datas (YYYY-MM-DD) num intervalo ISO [from, to) — 'to' inclui o dia
 * escolhido (avança 1 dia). Devolve undefined quando nenhuma data é indicada. */
function toIsoRange(from?: string, to?: string): { from?: string; to?: string } | undefined {
  const r: { from?: string; to?: string } = {};
  if (from) r.from = new Date(`${from}T00:00:00`).toISOString();
  if (to) { const d = new Date(`${to}T00:00:00`); d.setDate(d.getDate() + 1); r.to = d.toISOString(); }
  return (r.from || r.to) ? r : undefined;
}

/* Nome de ficheiro do exportável, com sufixo do intervalo quando definido. */
function exportFileName(base: string, ext: string, from?: string, to?: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const suffix = from || to ? `${from || 'inicio'}_a_${to || today}` : today;
  return `${base}_${suffix}.${ext}`;
}

/* Exportação com intervalo de datas. Um só botão abre um popover com atalhos
 * rápidos (Tudo / Este mês / Últimos 30 dias / Mês passado) e um intervalo
 * personalizado (de/até). Desenho pensado para caber bem no mobile. */
const isoDay = (d: Date) => {
  const x = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return x.toISOString().slice(0, 10);
};

function RangeExport({ icon, label, busy, onExport }: {
  icon: React.ReactNode; label: string; busy: boolean;
  onExport: (from?: string, to?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const run = (f?: string, t?: string) => { onExport(f, t); setOpen(false); };

  const now = new Date();
  const monthStart = isoDay(new Date(now.getFullYear(), now.getMonth(), 1));
  const prevMonthStart = isoDay(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const prevMonthEnd = isoDay(new Date(now.getFullYear(), now.getMonth(), 0));
  const last30 = isoDay(new Date(now.getTime() - 29 * 86400000));

  const presets: { label: string; from?: string; to?: string }[] = [
    { label: 'Tudo' },
    { label: 'Este mês', from: monthStart },
    { label: 'Últimos 30 dias', from: last30 },
    { label: 'Mês passado', from: prevMonthStart, to: prevMonthEnd },
  ];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 gap-1.5" disabled={busy}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : icon}
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[17rem] p-3 space-y-3">
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Atalhos</p>
          <div className="grid grid-cols-2 gap-1.5">
            {presets.map(p => (
              <button
                key={p.label}
                type="button"
                onClick={() => run(p.from, p.to)}
                className="rounded-md border border-border bg-background px-2 py-1.5 text-xs font-medium hover:bg-accent"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-2 border-t border-border pt-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Intervalo personalizado</p>
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-xs">
              <span className="w-8 text-muted-foreground">De</span>
              <Input type="date" value={from} max={to || undefined}
                onChange={e => setFrom(e.target.value)} className="h-8 flex-1 text-xs" />
            </label>
            <label className="flex items-center gap-2 text-xs">
              <span className="w-8 text-muted-foreground">Até</span>
              <Input type="date" value={to} min={from || undefined}
                onChange={e => setTo(e.target.value)} className="h-8 flex-1 text-xs" />
            </label>
          </div>
          <Button
            size="sm"
            className="w-full gap-1.5"
            disabled={!from && !to}
            onClick={() => run(from || undefined, to || undefined)}
          >
            {icon} Exportar intervalo
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

type PlacedCycle = { c: CarWashCycle; start: number; dur: number; lane: number };
type PeriodStat = { total: number; minutes: number; byType: Map<WashTypeId, number> };

/* Bloco de resumo de um período (hoje / semana / mês). */
function StatBlock({ title, stat }: { title: string; stat: PeriodStat }) {
  const entries = WASH_TYPES.filter(t => (stat.byType.get(t.id) ?? 0) > 0);
  return (
    <div className="rounded-md border p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</span>
        <span className="text-2xl font-bold tabular-nums leading-none">{stat.total}</span>
      </div>
      <div className="text-[10px] text-muted-foreground mb-2">{stat.minutes} min no total</div>
      {entries.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">Sem lavagens.</p>
      ) : (
        <ul className="space-y-1">
          {entries.map(t => (
            <li key={t.id} className="flex items-center justify-between text-[11px]">
              <span className="flex items-center gap-1.5 min-w-0">
                <span className={`inline-block h-2 w-2 rounded-full flex-shrink-0 ${t.dot}`} />
                <span className="truncate">{t.label}</span>
              </span>
              <span className="font-semibold tabular-nums">{stat.byType.get(t.id)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* Distribui os ciclos de um dia por "faixas" para evitar sobreposição visual. */
function layoutDay(items: CarWashCycle[]): { placed: PlacedCycle[]; lanes: number } {
  const evs = items
    .map(c => ({ c, start: minutesOfDay(effectiveAt(c)), dur: Math.max(c.duration_min, 5) }))
    .sort((a, b) => a.start - b.start || a.dur - b.dur);
  const laneEnds: number[] = [];
  const placed: PlacedCycle[] = evs.map(e => {
    let lane = laneEnds.findIndex(end => end <= e.start);
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(e.start + e.dur); }
    else laneEnds[lane] = e.start + e.dur;
    return { ...e, lane };
  });
  return { placed, lanes: Math.max(1, laneEnds.length) };
}

export default function LavagemPage() {
  const { session } = useAuth();
  const { data: appData } = useData();
  const { isAdmin, roleName, canEdit } = usePermissions();
  // Permissões específicas dentro do tab Lavagem (ver tab: qualquer perfil com acesso).
  // Acesso de edição ao tab Lavagem concede as tarefas de planeamento (agendar/reordenar),
  // para além dos perfis dedicados — ex.: APV agenda lavagens de serviço.
  const lavagemEdit = canEdit('lavagem');                                           // edição atribuída ao perfil
  // Reagendar/editar lavagens já existentes (arrastar na agenda). O Lavador NÃO edita
  // existentes — só cria novas e inicia as agendadas.
  const canReschedule = isAdmin || roleName === 'Preparador' || lavagemEdit;        // editar existentes (arrastar)
  // Iniciar uma lavagem agendada e usar "Agendar já" (agendar para agora + arrancar).
  const canStartCycle = isAdmin || roleName === 'Lavador';                          // iniciar / agendar já
  // Criar/agendar novas lavagens (ver o formulário): quem edita existentes e também o Lavador.
  const canCreate = canReschedule || canStartCycle;                                 // ver formulário
  const canQC = isAdmin || roleName === 'Preparador' || roleName === 'Vendedor';    // controlo de qualidade
  const canExport = isAdmin;                                                        // exportar Excel
  // Remover lavagens: quem pode editar/reagendar as existentes (admin, Preparador e
  // perfis com edição no tab — ex.: APV). Todas as eliminações ficam registadas na
  // auditoria (car_wash_events), acessível ao administrador.
  const canDelete = canReschedule;                                                  // remover registos

  const [plate, setPlate] = useState('');
  const [model, setModel] = useState('');
  const [washType, setWashType] = useState<WashTypeId | ''>('');
  const [notes, setNotes] = useState('');
  const [schedAt, setSchedAt] = useState('');   // agendamento (datetime-local)
  const [submitting, setSubmitting] = useState<'schedule' | 'now' | null>(null);

  // Modelos sugeridos — reutiliza os modelos já registados noutras tabelas
  // (control_records), permitindo escolher um existente ou escrever um novo.
  const modelOptions = useMemo(() => {
    const set = new Set<string>();
    (appData?.control ?? []).forEach(r => { const m = r.model?.trim(); if (m) set.add(m); });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt'));
  }, [appData]);

  const [cycles, setCycles] = useState<CarWashCycle[]>([]);
  const [statsCycles, setStatsCycles] = useState<CarWashCycle[]>([]);
  const [events, setEvents] = useState<CarWashEvent[]>([]);       // auditoria (admin)
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [csvExporting, setCsvExporting] = useState(false);
  const [loadingLabel] = useState(funLoadingLabel);   // escolhido uma vez por montagem

  // Semana selecionada (segunda-feira 00:00); navegável para trás/frente.
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const weekEnd = useMemo(() => addDays(weekStart, 5), [weekStart]);        // exclusivo (sábado 00:00)
  const currentWeekStart = useMemo(() => mondayOf(new Date()), []);
  const isCurrentWeek = weekStart.getTime() === currentWeekStart.getTime();

  // Início do intervalo para estatísticas (cobre mês e semana atuais).
  const statsFrom = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const wk = mondayOf(now);
    return (wk < monthStart ? wk : monthStart);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [rows, stats] = await Promise.all([
        listCycles({ from: weekStart.toISOString(), to: weekEnd.toISOString() }),
        listCycles({ from: statsFrom.toISOString() }),
      ]);
      setCycles(rows);
      setStatsCycles(stats);
      // Auditoria (só admin): histórico completo de marcações/alterações/eliminações.
      if (isAdmin) {
        try { setEvents(await listEvents()); }
        catch (e) { console.error('Falha ao carregar registos de auditoria', e); }
      }
    } catch (e) {
      toast.error('Não foi possível carregar as lavagens.');
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [weekStart, weekEnd, statsFrom, isAdmin]);

  const handleExport = async (from?: string, to?: string) => {
    setExporting(true);
    try {
      const all = await listCycles(toIsoRange(from, to));   // histórico (ou intervalo)
      if (all.length === 0) { toast.info('Não há lavagens no intervalo escolhido.'); return; }
      exportCyclesToExcel(all, exportFileName('lavagens', 'xlsx', from, to));
      toast.success('Relatório exportado.');
    } catch (err) {
      toast.error('Não foi possível exportar o relatório.');
      console.error(err);
    } finally {
      setExporting(false);
    }
  };

  const handleExportCsv = async (from?: string, to?: string) => {
    setCsvExporting(true);
    try {
      const all = await listEvents(toIsoRange(from, to));   // registos (ou intervalo)
      if (all.length === 0) { toast.info('Não há registos no intervalo escolhido.'); return; }
      exportEventsToCsv(all, exportFileName('lavagens_registos', 'csv', from, to));
      toast.success('Registos exportados (CSV).');
    } catch (err) {
      toast.error('Não foi possível exportar os registos.');
      console.error(err);
    } finally {
      setCsvExporting(false);
    }
  };

  useEffect(() => { refresh(); }, [refresh]);

  // Submissão do formulário. Dois modos:
  //  - 'schedule' (botão "Agendar"): marca para a hora indicada em schedAt (fila).
  //  - 'now' ("Agendar já"): agenda para este instante e arranca de imediato.
  const submit = async (mode: 'schedule' | 'now') => {
    if (!canCreate) return;
    if (mode === 'now' && !canStartCycle) { toast.error('Sem permissão para iniciar lavagens.'); return; }
    if (!plate.trim()) { toast.error('Indica a matrícula ou chassis.'); return; }
    if (!washType) { toast.error('Escolhe o tipo de lavagem.'); return; }

    let scheduledAt: string | undefined;
    if (mode === 'schedule') {
      if (!schedAt) { toast.error('Indica a hora do agendamento (ou usa "Agendar já").'); return; }
      const d = new Date(schedAt);
      if (isNaN(d.getTime())) { toast.error('Data de agendamento inválida.'); return; }
      scheduledAt = d.toISOString();
    }

    setSubmitting(mode);
    try {
      await createCycle({
        plate,
        wash_type: washType,
        model: model.trim() || null,
        notes: notes.trim() || null,
        created_by: session?.user.email ?? null,
        scheduled_at: scheduledAt,
        start_now: mode === 'now',
      });
      toast.success(mode === 'now' ? 'Lavagem agendada e iniciada.' : 'Lavagem agendada.');
      setPlate('');
      setModel('');
      setWashType('');
      setNotes('');
      setSchedAt('');
      await refresh();
    } catch (err) {
      toast.error('Não foi possível registar a lavagem.');
      console.error(err);
    } finally {
      setSubmitting(null);
    }
  };

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); submit('schedule'); };

  // Remoção — pede sempre confirmação antes de apagar. Qualquer origem (slot da
  // agenda, fila ou controlo de qualidade) passa pelo mesmo diálogo.
  const [deleteTarget, setDeleteTarget] = useState<CarWashCycle | null>(null);
  const [deleting, setDeleting] = useState(false);
  const requestDelete = (c: CarWashCycle) => { if (canDelete) setDeleteTarget(c); };
  const confirmDelete = async () => {
    if (!deleteTarget || !canDelete) return;
    const { id } = deleteTarget;
    setDeleting(true);
    try {
      await deleteCycle(id);
      toast.success('Lavagem removida.');
      setDeleteTarget(null);
      setQcCycle(c => (c?.id === id ? null : c));   // fecha o QC se era o mesmo ciclo
      await refresh();
    } catch (err) {
      toast.error('Não foi possível remover a lavagem.');
      console.error(err);
    } finally {
      setDeleting(false);
    }
  };

  // Controlo de qualidade (nota 0–10 + comentário).
  const [qcCycle, setQcCycle] = useState<CarWashCycle | null>(null);
  const [qcScore, setQcScore] = useState<string>('');
  const [qcComment, setQcComment] = useState<string>('');
  const [qcSaving, setQcSaving] = useState(false);

  const openQC = (c: CarWashCycle) => {
    setQcCycle(c);
    setQcScore(c.quality_score != null ? String(c.quality_score) : '');
    setQcComment(c.quality_comment ?? '');
  };

  // Iniciar uma lavagem agendada (Lavador/admin): regista o início real e move a
  // lavagem de "agendada" para "em curso". Confirma o arranque a partir do detalhe.
  const [starting, setStarting] = useState(false);
  const handleStart = async (c: CarWashCycle) => {
    if (!canStartCycle) return;
    setStarting(true);
    try {
      await startCycle(c.id);
      toast.success('Lavagem iniciada.');
      setQcCycle(null);
      await refresh();
    } catch (err) {
      toast.error('Não foi possível iniciar a lavagem.');
      console.error(err);
    } finally {
      setStarting(false);
    }
  };

  const handleSaveQC = async () => {
    if (!qcCycle || !canQC) return;
    const score = qcScore === '' ? null : Number(qcScore);
    if (score !== null && (isNaN(score) || score < 0 || score > 10)) {
      toast.error('A nota deve estar entre 0 e 10.'); return;
    }
    setQcSaving(true);
    try {
      await setQuality(qcCycle.id, score, qcComment, session?.user.email ?? null);
      toast.success('Controlo de qualidade guardado.');
      setQcCycle(null);
      await refresh();
    } catch (err) {
      toast.error('Não foi possível guardar o controlo de qualidade.');
      console.error(err);
    } finally {
      setQcSaving(false);
    }
  };

  // ── Arrastar slots na agenda (reagendar) ────────────────────────────────────
  // Só lavagens agendadas e só quem pode agendar. Distingue clique de arrasto por
  // limiar de movimento; ao largar, fixa novo dia/hora (scheduled_at) com snap.
  const gridRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ id: string; dur: number } | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const grabOffsetMinRef = useRef(0);
  const movedRef = useRef(false);
  const [drag, setDrag] = useState<{ id: string; plate: string; dur: number; dayIndex: number; startMin: number } | null>(null);

  const pointerToSlot = (clientX: number, clientY: number, dur: number) => {
    const el = gridRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const dayWidth = (rect.width - GUTTER_PX) / 5;
    if (dayWidth <= 0) return null;
    const dayIndex = clamp(Math.floor((clientX - rect.left - GUTTER_PX) / dayWidth), 0, 4);
    const rawMin = windowStartMin + (clientY - rect.top) / PX_PER_MIN - grabOffsetMinRef.current;
    const startMin = clamp(Math.round(rawMin / SNAP_MIN) * SNAP_MIN, 0, 24 * 60 - dur);
    return { dayIndex, startMin };
  };

  const onBlockPointerDown = (e: React.PointerEvent, c: CarWashCycle) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    grabOffsetMinRef.current = (e.clientY - rect.top) / PX_PER_MIN;
    dragRef.current = { id: c.id, dur: Math.max(c.duration_min, 5) };
    startRef.current = { x: e.clientX, y: e.clientY };
    movedRef.current = false;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onBlockPointerMove = (e: React.PointerEvent, c: CarWashCycle) => {
    if (!dragRef.current || !startRef.current) return;
    if (!movedRef.current) {
      const dx = e.clientX - startRef.current.x;
      const dy = e.clientY - startRef.current.y;
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      movedRef.current = true;
    }
    const slot = pointerToSlot(e.clientX, e.clientY, dragRef.current.dur);
    if (slot) setDrag({ id: c.id, plate: c.plate, dur: dragRef.current.dur, ...slot });
  };

  const onBlockPointerUp = async (e: React.PointerEvent, c: CarWashCycle) => {
    const wasDragging = movedRef.current;
    const slot = dragRef.current ? pointerToSlot(e.clientX, e.clientY, dragRef.current.dur) : null;
    dragRef.current = null;
    startRef.current = null;
    movedRef.current = false;
    setDrag(null);
    if (!wasDragging) { openQC(c); return; }   // não arrastou → clique normal
    if (!slot) return;
    const when = new Date(addDays(weekStart, slot.dayIndex));
    when.setHours(Math.floor(slot.startMin / 60), slot.startMin % 60, 0, 0);
    try {
      await rescheduleCycle(c.id, when.toISOString(), session?.user.email ?? null);
      toast.success('Lavagem reagendada.');
      await refresh();
    } catch (err) {
      toast.error('Não foi possível reagendar a lavagem.');
      console.error(err);
    }
  };

  // Estatísticas por período (hoje / semana / mês) — quantas e que tipo.
  const stats = useMemo(() => {
    const now = new Date();
    const todayMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const weekMs = mondayOf(now).getTime();
    const monthMs = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    const build = (fromMs: number): PeriodStat => {
      const items = statsCycles.filter(c => new Date(effectiveAt(c)).getTime() >= fromMs);
      const byType = new Map<WashTypeId, number>();
      items.forEach(c => byType.set(c.wash_type, (byType.get(c.wash_type) ?? 0) + 1));
      return { total: items.length, minutes: items.reduce((s, c) => s + c.duration_min, 0), byType };
    };
    return { hoje: build(todayMs), semana: build(weekMs), mes: build(monthMs) };
  }, [statsCycles]);

  // Ciclos agrupados por dia útil da semana selecionada.
  const days = useMemo(() => {
    const base = WEEKDAYS.map((label, i) => ({ label, date: addDays(weekStart, i), items: [] as CarWashCycle[] }));
    cycles.forEach(c => {
      const idx = Math.floor((new Date(effectiveAt(c)).getTime() - weekStart.getTime()) / DAY_MS);
      if (idx >= 0 && idx < 5) base[idx].items.push(c);
    });
    return base;
  }, [cycles, weekStart]);

  // Janela horária da agenda: horário de funcionamento por defeito, expandida
  // (arredondada à meia-hora) para caber lavagens fora de horas.
  const [windowStartMin, windowEndMin] = useMemo(() => {
    let min = DEFAULT_START_MIN, max = DEFAULT_END_MIN;
    cycles.forEach(c => {
      const s = minutesOfDay(effectiveAt(c));
      const e = s + Math.max(c.duration_min, 5);
      min = Math.min(min, Math.floor(s / 30) * 30);
      max = Math.max(max, Math.ceil(e / 30) * 30);
    });
    return [Math.max(0, min), Math.min(24 * 60, max)];
  }, [cycles]);

  const gridHeight = (windowEndMin - windowStartMin) * PX_PER_MIN;
  // Marcas de meia em meia hora (linha; rótulo apenas às horas certas).
  const ticks = useMemo(() => {
    const first = Math.ceil(windowStartMin / 30) * 30;
    const out: number[] = [];
    for (let m = first; m <= windowEndMin; m += 30) out.push(m);
    if (out[0] !== windowStartMin) out.unshift(windowStartMin);
    return out;
  }, [windowStartMin, windowEndMin]);
  const fmtMin = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

  const selectedType = washType ? WASH_TYPE_MAP[washType] : null;
  const todayIdx = Math.round((new Date().setHours(0, 0, 0, 0) - weekStart.getTime()) / DAY_MS);
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();

  const weekLabel = `${fmtDayMonth(weekStart)} – ${fmtDayMonth(addDays(weekStart, 4))}`;

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Car className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-bold tracking-tight">Lavagem</h1>
        <span className="text-xs text-muted-foreground">· Controlo do fluxo de lavagens</span>
      </div>

      {/* ── Formulário: agendar lavagem ──────────────────────────────────────
       * Admin, Preparador e Lavador agendam para uma hora futura ("Agendar").
       * Admin e Lavador podem ainda "Agendar já" (agenda para o instante e
       * arranca de imediato). Editar lavagens já existentes (arrastar) é só de
       * quem tem canReschedule — o Lavador não edita as existentes. */}
      {canCreate && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Nova lavagem</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2 sm:items-end lg:grid-cols-4">
                <div className="space-y-1.5">
                  <Label htmlFor="plate">Matrícula / Chassis</Label>
                  <Input
                    id="plate"
                    value={plate}
                    onChange={e => setPlate(e.target.value)}
                    placeholder="AA-00-BB"
                    autoComplete="off"
                    className="uppercase"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="model">
                    Modelo <span className="text-muted-foreground font-normal">(opcional)</span>
                  </Label>
                  <Input
                    id="model"
                    list="wash-model-options"
                    value={model}
                    onChange={e => setModel(e.target.value)}
                    placeholder="Modelo da viatura"
                    autoComplete="off"
                  />
                  <datalist id="wash-model-options">
                    {modelOptions.map(m => <option key={m} value={m} />)}
                  </datalist>
                </div>

                <div className="space-y-1.5">
                  <Label>Tipo de lavagem</Label>
                  <Select value={washType} onValueChange={v => setWashType(v as WashTypeId)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Escolher tipo…" />
                    </SelectTrigger>
                    <SelectContent>
                      {WASH_TYPES.map(t => (
                        <SelectItem key={t.id} value={t.id}>
                          <span className="flex items-center gap-2">
                            <span className={`inline-block h-2.5 w-2.5 rounded-full ${t.dot}`} />
                            {t.label}
                            <span className="text-muted-foreground text-xs">· {t.duration} min</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="sched">Agendar para</Label>
                  <Input
                    id="sched"
                    type="datetime-local"
                    value={schedAt}
                    onChange={e => setSchedAt(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="notes">
                  Observações <span className="text-muted-foreground font-normal">(opcional)</span>
                </Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Notas ou indicações para a lavagem…"
                  rows={2}
                />
              </div>

              {/* Aviso de antecedência mínima para agendamentos futuros. */}
              <p className="flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
                <Info className="h-3.5 w-3.5 flex-shrink-0" />
                Realizar agendamento com, pelo menos, 48h de antecedência.
              </p>

              <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center sm:justify-end gap-2">
                {canStartCycle && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => submit('now')}
                    disabled={submitting !== null}
                    className="w-full sm:w-auto"
                    title="Agenda para este instante e inicia de imediato"
                  >
                    {submitting === 'now' ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
                    Agendar já
                  </Button>
                )}
                <Button type="submit" disabled={submitting !== null} className="w-full sm:w-auto">
                  {submitting === 'schedule' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarDays className="h-4 w-4" />}
                  Agendar
                </Button>
              </div>
            </form>

            {selectedType && (
              <p className="mt-2 text-xs text-muted-foreground">
                Duração prevista: <span className="font-medium text-foreground">{selectedType.duration} min</span>
                {canStartCycle && ' · "Agendar já" arranca de imediato'}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Legenda de tipos ────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        {WASH_TYPES.map(t => (
          <span
            key={t.id}
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${t.badge}`}
          >
            <span className={`inline-block h-2 w-2 rounded-full ${t.dot}`} />
            {t.label} · {t.duration} min
          </span>
        ))}
      </div>

      {/* ── Estatísticas + exportação ───────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BarChart3 className="h-4 w-4" /> Estatísticas
            </CardTitle>
            {canExport && (
              <RangeExport
                icon={<FileSpreadsheet className="h-3.5 w-3.5" />}
                label="Exportar Excel"
                busy={exporting}
                onExport={handleExport}
              />
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatBlock title="Hoje" stat={stats.hoje} />
            <StatBlock title="Esta semana" stat={stats.semana} />
            <StatBlock title="Este mês" stat={stats.mes} />
          </div>
        </CardContent>
      </Card>

      {/* ── Agenda semanal (dias úteis) ─────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <CalendarDays className="h-4 w-4" /> Semana {weekLabel}
              </CardTitle>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Horário: 08:30–12:30 · 14:00–18:00 · <span className="text-amber-700 dark:text-amber-400">extra 18:00–19:00</span>
                {canReschedule && <span className="text-muted-foreground"> · arraste as lavagens agendadas para reagendar</span>}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setWeekStart(w => addDays(w, -7))} title="Semana anterior">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" className="h-7" onClick={() => setWeekStart(mondayOf(new Date()))} disabled={isCurrentWeek}>
                Hoje
              </Button>
              <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setWeekStart(w => addDays(w, 7))} title="Semana seguinte">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            {/* Cabeçalho dos dias */}
            <div className="flex min-w-[640px] border-b border-border">
              <div className="w-12 flex-shrink-0" />
              {days.map((day, i) => (
                <div
                  key={day.label}
                  className={`flex-1 px-2 py-1.5 text-center border-l border-border ${isCurrentWeek && i === todayIdx ? 'bg-primary/5' : ''}`}
                >
                  <div className="text-xs font-semibold uppercase tracking-wide">{day.label}</div>
                  <div className="text-[10px] text-muted-foreground">{fmtDayMonth(day.date)}</div>
                </div>
              ))}
            </div>

            {/* Grelha horária */}
            <div ref={gridRef} className="flex min-w-[640px] relative" style={{ height: gridHeight }}>
              {/* Gutter de horas */}
              <div className="w-12 flex-shrink-0 relative">
                {ticks.filter(m => m % 60 === 0 || m === windowStartMin).map(m => (
                  <div
                    key={m}
                    className="absolute right-1 -translate-y-1/2 text-[10px] text-muted-foreground tabular-nums"
                    style={{ top: (m - windowStartMin) * PX_PER_MIN }}
                  >
                    {fmtMin(m)}
                  </div>
                ))}
              </div>

              {/* Colunas dos dias */}
              {days.map((day, i) => {
                const { placed, lanes } = layoutDay(day.items);
                const isToday = isCurrentWeek && i === todayIdx;
                const bandTop = (from: number, to: number) => ({
                  top: (Math.max(from, windowStartMin) - windowStartMin) * PX_PER_MIN,
                  height: (Math.min(to, windowEndMin) - Math.max(from, windowStartMin)) * PX_PER_MIN,
                });
                return (
                  <div key={day.label} className="flex-1 relative border-l border-border bg-muted/40 dark:bg-muted/20">
                    {/* Faixas de horário aberto (fundo normal sobre o "encerrado") */}
                    {BUSINESS.open.map((seg, k) => (
                      <div key={`o${k}`} className="absolute inset-x-0 bg-background" style={bandTop(seg.from, seg.to)} />
                    ))}
                    {/* Faixa de horário extra (18h–19h) */}
                    <div
                      className="absolute inset-x-0 bg-amber-400/15 dark:bg-amber-400/10 border-t border-dashed border-amber-500/40"
                      style={bandTop(BUSINESS.extra.from, BUSINESS.extra.to)}
                      title="Horário extra (sujeito a disponibilidade)"
                    >
                      {i === 0 && (
                        <span className="absolute left-1 top-0.5 text-[9px] font-medium text-amber-700 dark:text-amber-400">extra</span>
                      )}
                    </div>
                    {/* Linhas de meia-hora */}
                    {ticks.map(m => (
                      <div
                        key={m}
                        className={`absolute inset-x-0 ${m % 60 === 0 ? 'border-t border-border/60' : 'border-t border-border/25'}`}
                        style={{ top: (m - windowStartMin) * PX_PER_MIN }}
                      />
                    ))}
                    {/* Indicador de "agora" */}
                    {isToday && nowMin >= windowStartMin && nowMin <= windowEndMin && (
                      <div
                        className="absolute inset-x-0 z-10 border-t-2 border-red-500"
                        style={{ top: (nowMin - windowStartMin) * PX_PER_MIN }}
                      >
                        <span className="absolute -left-1 -top-1 h-2 w-2 rounded-full bg-red-500" />
                      </div>
                    )}
                    {/* Eventos (altura proporcional à duração) */}
                    {placed.map(p => {
                      const t = WASH_TYPE_MAP[p.c.wash_type];
                      const top = (p.start - windowStartMin) * PX_PER_MIN;
                      const height = Math.max(p.dur * PX_PER_MIN, MIN_SLOT_PX);
                      const widthPct = 100 / lanes;
                      const compact = height < 34;
                      const scheduled = cycleStatus(p.c) === 'scheduled';
                      const draggable = canReschedule && scheduled;
                      const isDragging = drag?.id === p.c.id;
                      const blockHandlers = draggable
                        ? {
                            onPointerDown: (e: React.PointerEvent) => onBlockPointerDown(e, p.c),
                            onPointerMove: (e: React.PointerEvent) => onBlockPointerMove(e, p.c),
                            onPointerUp: (e: React.PointerEvent) => onBlockPointerUp(e, p.c),
                          }
                        : { onClick: () => openQC(p.c) };
                      return (
                        <div
                          key={p.c.id}
                          {...blockHandlers}
                          className={`group absolute rounded border px-1.5 py-0.5 overflow-hidden text-[11px] leading-tight ${t?.block ?? ''} ${p.c.ended_at ? 'opacity-60' : ''} ${scheduled ? 'border-dashed' : ''} ${draggable ? 'cursor-grab active:cursor-grabbing touch-none select-none' : 'cursor-pointer'} ${isDragging ? 'opacity-40' : ''}`}
                          style={{
                            top, height,
                            left: `calc(${p.lane * widthPct}% + 2px)`,
                            width: `calc(${widthPct}% - 4px)`,
                          }}
                          title={`${p.c.plate} · ${t?.label ?? p.c.wash_type} · ${p.c.duration_min} min · ${fmtTime(effectiveAt(p.c))}${scheduled ? ' · agendada' : ''}${p.c.scheduled_by ? ` · agendou ${personLabel(p.c.scheduled_by)}` : ''}${p.c.quality_score != null ? ` · QC ${p.c.quality_score}/10` : ''}${draggable ? ' · arraste para reagendar' : ''}`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-semibold truncate">{p.c.plate}</span>
                            <span className="flex items-center gap-0.5 flex-shrink-0">
                              {p.c.quality_score != null && (
                                <span className="inline-flex items-center gap-0.5 font-semibold">
                                  <Star className="h-2.5 w-2.5 fill-current" />{p.c.quality_score}
                                </span>
                              )}
                              {canDelete && (
                                <button
                                  onPointerDown={(e) => e.stopPropagation()}
                                  onClick={(e) => { e.stopPropagation(); requestDelete(p.c); }}
                                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                                  title="Remover"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              )}
                            </span>
                          </div>
                          {!compact && (
                            <div className="opacity-80 truncate">
                              {fmtTime(effectiveAt(p.c))} · {t?.label ?? p.c.wash_type} · {p.c.duration_min}m
                            </div>
                          )}
                          {!compact && p.c.scheduled_by && (
                            <div className="flex items-center gap-0.5 opacity-70 truncate" title={`Agendado por ${personLabel(p.c.scheduled_by)}`}>
                              <User className="h-2.5 w-2.5 flex-shrink-0" />
                              <span className="truncate">{personLabel(p.c.scheduled_by)}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}

              {/* Fantasma: pré-visualização do destino ao arrastar. */}
              {drag && (
                <div
                  className="pointer-events-none absolute z-20 rounded border-2 border-dashed border-primary bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary overflow-hidden"
                  style={{
                    top: (drag.startMin - windowStartMin) * PX_PER_MIN,
                    height: Math.max(drag.dur * PX_PER_MIN, MIN_SLOT_PX),
                    left: `calc(${GUTTER_PX}px + ${drag.dayIndex} * (100% - ${GUTTER_PX}px) / 5)`,
                    width: `calc((100% - ${GUTTER_PX}px) / 5)`,
                  }}
                >
                  {drag.plate} · {fmtMin(drag.startMin)}
                </div>
              )}
            </div>
          </div>

          {loading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> {loadingLabel}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Registos / auditoria (só admin) ─────────────────────────────────────
       * Histórico completo de marcações, alterações e eliminações de lavagens.
       * Colocado aqui, no próprio tab Lavagem, para manter a auditoria junto da
       * operação; visível apenas ao administrador, com download em CSV. */}
      {isAdmin && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <History className="h-4 w-4" /> Registos de lavagens
                </CardTitle>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Marcações, alterações e eliminações — auditoria completa (só administrador).
                </p>
              </div>
              <RangeExport
                icon={<Download className="h-3.5 w-3.5" />}
                label="Descarregar CSV"
                busy={csvExporting}
                onExport={handleExportCsv}
              />
            </div>
          </CardHeader>
          <CardContent>
            {events.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">Sem registos.</p>
            ) : (
              <div className="max-h-80 overflow-auto rounded-md border">
                <table className="w-full text-[11px]">
                  <thead className="sticky top-0 bg-muted/95 backdrop-blur">
                    <tr className="text-left text-muted-foreground">
                      <th className="px-2 py-1.5 font-semibold whitespace-nowrap">Data / Hora</th>
                      <th className="px-2 py-1.5 font-semibold whitespace-nowrap">Ação</th>
                      <th className="px-2 py-1.5 font-semibold whitespace-nowrap">Utilizador</th>
                      <th className="px-2 py-1.5 font-semibold whitespace-nowrap">Matrícula</th>
                      <th className="px-2 py-1.5 font-semibold whitespace-nowrap">Tipo</th>
                      <th className="px-2 py-1.5 font-semibold">Detalhe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map(ev => (
                      <tr key={ev.id} className="border-t border-border/60 align-top">
                        <td className="px-2 py-1.5 whitespace-nowrap tabular-nums text-muted-foreground">
                          {new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(ev.created_at))}
                        </td>
                        <td className="px-2 py-1.5 whitespace-nowrap">
                          <span className={`inline-block rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${EVENT_BADGE[ev.action] ?? 'bg-muted text-foreground'}`}>
                            {EVENT_ACTION_LABEL[ev.action] ?? ev.action}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 whitespace-nowrap">{personLabel(ev.actor) || '—'}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap font-medium">{ev.plate ?? '—'}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap">
                          {ev.wash_type ? (WASH_TYPE_MAP[ev.wash_type as WashTypeId]?.label ?? ev.wash_type) : '—'}
                        </td>
                        <td className="px-2 py-1.5 text-muted-foreground">{ev.detail ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Dialog: controlo de qualidade ───────────────────────────────────── */}
      <Dialog open={!!qcCycle} onOpenChange={(o) => { if (!o) setQcCycle(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Car className="h-4 w-4" /> Lavagem
            </DialogTitle>
            {qcCycle && (
              <DialogDescription>
                {qcCycle.plate}{qcCycle.model ? ` · ${qcCycle.model}` : ''} · {WASH_TYPE_MAP[qcCycle.wash_type]?.label ?? qcCycle.wash_type} · {fmtTime(effectiveAt(qcCycle))}
              </DialogDescription>
            )}
          </DialogHeader>

          {qcCycle?.scheduled_by && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <User className="h-3.5 w-3.5 flex-shrink-0" />
              <span>Agendado por <span className="font-medium text-foreground">{personLabel(qcCycle.scheduled_by)}</span></span>
            </div>
          )}

          {qcCycle?.notes && (
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs">
              <span className="font-semibold">Observações: </span>
              <span className="text-muted-foreground">{qcCycle.notes}</span>
            </div>
          )}

          {/* Estado + arranque. O Lavador confirma o início da lavagem agendada aqui. */}
          {qcCycle && (() => {
            const status = cycleStatus(qcCycle);
            const statusLabel = status === 'scheduled'
              ? 'Agendada'
              : status === 'in_progress'
                ? `Em curso${qcCycle.started_at ? ` desde ${fmtTime(qcCycle.started_at)}` : ''}`
                : 'Terminada';
            return (
              <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                <div className="text-xs">
                  <span className="font-semibold">Estado: </span>
                  <span className="text-muted-foreground">{statusLabel}</span>
                </div>
                {status === 'scheduled' && canStartCycle && (
                  <Button size="sm" className="gap-1.5" onClick={() => handleStart(qcCycle)} disabled={starting}>
                    {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
                    Iniciar
                  </Button>
                )}
              </div>
            );
          })()}

          {canQC && (
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label>Nota (0–10)</Label>
              <div className="flex flex-wrap gap-1">
                {Array.from({ length: 11 }, (_, n) => (
                  <button
                    key={n}
                    type="button"
                    disabled={!canQC}
                    onClick={() => setQcScore(String(n))}
                    className={`h-8 w-8 rounded-md border text-sm font-semibold transition-colors disabled:opacity-50 ${
                      qcScore === String(n)
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background hover:bg-muted'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              {qcScore !== '' && canQC && (
                <button type="button" className="text-[11px] text-muted-foreground underline" onClick={() => setQcScore('')}>
                  limpar nota
                </button>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="qc-comment">Comentários</Label>
              <Textarea
                id="qc-comment"
                value={qcComment}
                onChange={(e) => setQcComment(e.target.value)}
                placeholder="Observações do controlo de qualidade…"
                rows={4}
                disabled={!canQC}
              />
            </div>

            {qcCycle?.quality_by && (
              <p className="text-[11px] text-muted-foreground">
                Último registo por {qcCycle.quality_by}
                {qcCycle.quality_at ? ` em ${new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(qcCycle.quality_at))}` : ''}
              </p>
            )}
          </div>
          )}

          <DialogFooter className="sm:justify-between">
            {/* Remover lavagem/agendamento. Botão discreto (texto), à esquerda no
             * ecrã largo; pede confirmação antes de apagar. */}
            {canDelete ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => qcCycle && requestDelete(qcCycle)}
                disabled={qcSaving || deleting}
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-4 w-4" /> Remover
              </Button>
            ) : <span />}
            <div className="flex items-center gap-2 sm:space-x-0">
              <Button variant="outline" onClick={() => setQcCycle(null)}>Fechar</Button>
              {canQC && (
                <Button onClick={handleSaveQC} disabled={qcSaving}>
                  {qcSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Guardar
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Confirmação de remoção ──────────────────────────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover lavagem?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (
                <>
                  Esta ação remove definitivamente {deleteTarget.plate} · {WASH_TYPE_MAP[deleteTarget.wash_type]?.label ?? deleteTarget.wash_type} ({fmtTime(effectiveAt(deleteTarget))}) e não pode ser anulada.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); confirmDelete(); }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
