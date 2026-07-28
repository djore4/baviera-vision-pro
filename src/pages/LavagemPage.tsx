import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Car, Loader2, CheckCircle2, Timer, CalendarDays, Trash2, ChevronLeft, ChevronRight,
  BarChart3, FileSpreadsheet, Star, ClipboardCheck, Play, ListOrdered, ArrowRight,
  ChevronsUp, ChevronUp, ChevronDown,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/App';
import { usePermissions } from '@/contexts/PermissionsContext';
import {
  WASH_TYPES, WASH_TYPE_MAP, type WashTypeId, type CarWashCycle,
  cycleStatus, effectiveAt, queueKey, startDeviationMin,
  listCycles, listActiveCycles, createCycle, startCycle, setQueueOrder, endCycle, deleteCycle, setQuality, exportCyclesToExcel,
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
  const { isAdmin, roleName } = usePermissions();
  // Permissões específicas dentro do tab Lavagem (ver tab: qualquer perfil com acesso).
  const canSchedule = isAdmin || roleName === 'Preparador';                         // agendar (marcação)
  const canStart = isAdmin || roleName === 'Lavador';                               // iniciar (imediata/agendada)
  const canReorder = isAdmin || roleName === 'Preparador';                          // reordenar/antecipar a fila
  const canCreate = canSchedule || canStart;                                        // ver formulário
  const canTerminate = isAdmin || roleName === 'Lavador';                           // terminar
  const canQC = isAdmin || roleName === 'Preparador' || roleName === 'Vendedor';    // controlo de qualidade
  const canExport = isAdmin;                                                        // exportar Excel
  const canDelete = isAdmin;                                                        // remover registos

  const [plate, setPlate] = useState('');
  const [washType, setWashType] = useState<WashTypeId | ''>('');
  const [schedAt, setSchedAt] = useState('');   // agendamento (datetime-local); vazio = imediata
  const [submitting, setSubmitting] = useState(false);

  const [cycles, setCycles] = useState<CarWashCycle[]>([]);
  const [active, setActive] = useState<CarWashCycle[]>([]);
  const [statsCycles, setStatsCycles] = useState<CarWashCycle[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
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
      const [rows, act, stats] = await Promise.all([
        listCycles({ from: weekStart.toISOString(), to: weekEnd.toISOString() }),
        listActiveCycles(),
        listCycles({ from: statsFrom.toISOString() }),
      ]);
      setCycles(rows);
      setActive(act);
      setStatsCycles(stats);
    } catch (e) {
      toast.error('Não foi possível carregar as lavagens.');
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [weekStart, weekEnd, statsFrom]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const all = await listCycles();     // histórico completo
      if (all.length === 0) { toast.info('Ainda não há lavagens para exportar.'); return; }
      exportCyclesToExcel(all);
      toast.success('Relatório exportado.');
    } catch (err) {
      toast.error('Não foi possível exportar o relatório.');
      console.error(err);
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => { refresh(); }, [refresh]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreate) return;
    if (!plate.trim()) { toast.error('Indica a matrícula ou chassis.'); return; }
    if (!washType) { toast.error('Escolhe o tipo de lavagem.'); return; }

    let scheduledAt: string | undefined;
    if (schedAt) {
      if (!canSchedule) { toast.error('Sem permissão para agendar lavagens.'); return; }
      const d = new Date(schedAt);
      if (isNaN(d.getTime())) { toast.error('Data de agendamento inválida.'); return; }
      scheduledAt = d.toISOString();
    } else if (!canStart) {
      toast.error('Indica a hora do agendamento.'); return;
    }

    setSubmitting(true);
    try {
      await createCycle({ plate, wash_type: washType, created_by: session?.user.email ?? null, scheduled_at: scheduledAt });
      toast.success(scheduledAt ? 'Lavagem agendada.' : 'Lavagem iniciada.');
      setPlate('');
      setWashType('');
      setSchedAt('');
      await refresh();
    } catch (err) {
      toast.error('Não foi possível registar a lavagem.');
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleStart = async (id: string) => {
    if (!canStart) return;
    try { await startCycle(id); toast.success('Lavagem iniciada.'); await refresh(); }
    catch (err) { toast.error('Não foi possível iniciar a lavagem.'); console.error(err); }
  };

  // Ajustes operacionais da fila (Admin/Preparador). A nova chave é calculada a
  // partir dos vizinhos visíveis, sem tocar no plano (scheduled_at).
  const applyOrder = async (id: string, order: number) => {
    if (!canReorder) return;
    try { await setQueueOrder(id, order); await refresh(); }
    catch (err) { toast.error('Não foi possível reordenar a fila.'); console.error(err); }
  };
  const moveTop = (i: number) => {
    if (i <= 0) return;
    applyOrder(queue[i].id, queueKey(queue[0]) - 1);
  };
  const moveUp = (i: number) => {
    if (i <= 0) return;
    const order = i - 1 === 0
      ? queueKey(queue[0]) - 1
      : (queueKey(queue[i - 2]) + queueKey(queue[i - 1])) / 2;
    applyOrder(queue[i].id, order);
  };
  const moveDown = (i: number) => {
    if (i >= queue.length - 1) return;
    const last = queue.length - 1;
    const order = i + 1 === last
      ? queueKey(queue[last]) + 1
      : (queueKey(queue[i + 1]) + queueKey(queue[i + 2])) / 2;
    applyOrder(queue[i].id, order);
  };
  const handleEnd = async (id: string) => {
    if (!canTerminate) return;
    try { await endCycle(id); toast.success('Lavagem terminada.'); await refresh(); }
    catch (err) { toast.error('Não foi possível terminar a lavagem.'); console.error(err); }
  };
  // Remoção (só admin) — pede sempre confirmação antes de apagar. Qualquer
  // origem (slot da agenda, fila ou controlo de qualidade) passa pelo mesmo diálogo.
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

  // "Em curso" = lavagens já iniciadas e por terminar.
  const activeSorted = useMemo(() =>
    active
      .filter(c => cycleStatus(c) === 'in_progress')
      .sort((a, b) => (a.started_at ?? '').localeCompare(b.started_at ?? '')),
    [active]);

  // Fila de execução (agendamentos por iniciar): ordem manual, se definida,
  // senão a hora marcada. Dá ao lavador a noção do "próximo carro a lavar";
  // Admin/Preparador podem antecipar/reordenar sem mexer no plano.
  const queue = useMemo(() =>
    active
      .filter(c => cycleStatus(c) === 'scheduled')
      .sort((a, b) => queueKey(a) - queueKey(b)),
    [active]);

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
  // Perfis que só podem agendar (ex.: Preparador) submetem sempre um agendamento.
  const willSchedule = !!schedAt || !canStart;
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

      {/* ── Formulário: agendar / iniciar lavagem ────────────────────────────
       * Admin e Preparador agendam (marcação numa hora futura → entra na fila e
       * na agenda). Admin e Lavador iniciam de imediato (walk-in). */}
      {canCreate && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">
              {canSchedule ? (canStart ? 'Nova lavagem' : 'Agendar lavagem') : 'Nova lavagem'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={handleSubmit}
              className={`grid gap-3 sm:grid-cols-2 sm:items-end ${canSchedule ? 'lg:grid-cols-[1fr_1fr_1fr_auto]' : 'lg:grid-cols-[1fr_1fr_auto]'}`}
            >
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

              {canSchedule && (
                <div className="space-y-1.5">
                  <Label htmlFor="sched">
                    Agendar para {canStart && <span className="text-muted-foreground font-normal">(opcional)</span>}
                  </Label>
                  <Input
                    id="sched"
                    type="datetime-local"
                    value={schedAt}
                    onChange={e => setSchedAt(e.target.value)}
                  />
                </div>
              )}

              <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
                {submitting
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : willSchedule ? <CalendarDays className="h-4 w-4" /> : <Timer className="h-4 w-4" />}
                {willSchedule ? 'Agendar' : 'Iniciar'}
              </Button>
            </form>

            {selectedType && (
              <p className="mt-2 text-xs text-muted-foreground">
                Duração prevista: <span className="font-medium text-foreground">{selectedType.duration} min</span>
                {willSchedule ? ' · será colocada na agenda e na fila à hora indicada' : ''}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Fila de agendamentos ────────────────────────────────────────────
       * O "próximo carro a lavar" para o lavador: lavagens agendadas por ordem
       * da hora marcada. A primeira é destacada como "A seguir". */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <ListOrdered className="h-4 w-4" /> Próximas lavagens
            <span className="text-xs font-normal text-muted-foreground">({queue.length})</span>
          </CardTitle>
          {canReorder && queue.length > 1 && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Ordem de execução — antecipe ou reordene sem alterar a marcação na agenda.
            </p>
          )}
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" /> {loadingLabel}
            </div>
          ) : queue.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              Sem lavagens agendadas.{canSchedule ? ' Agende uma acima para a colocar na fila.' : ''}
            </p>
          ) : (
            <ul className="space-y-2">
              {queue.map((c, idx) => {
                const t = WASH_TYPE_MAP[c.wash_type];
                const next = idx === 0;
                const overdue = !!c.scheduled_at && new Date(c.scheduled_at).getTime() < Date.now();
                const reordered = c.queue_order != null;   // ordem ajustada face ao plano
                return (
                  <li
                    key={c.id}
                    className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 ${next ? 'border-primary/60 bg-primary/5' : ''}`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {canReorder && (
                        <div className="flex flex-col -my-1 flex-shrink-0">
                          <button
                            onClick={() => moveTop(idx)}
                            disabled={idx === 0}
                            title="Antecipar (topo)"
                            className="text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground"
                          >
                            <ChevronsUp className="h-3.5 w-3.5" />
                          </button>
                          <div className="flex">
                            <button
                              onClick={() => moveUp(idx)}
                              disabled={idx === 0}
                              title="Subir"
                              className="text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground"
                            >
                              <ChevronUp className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => moveDown(idx)}
                              disabled={idx === queue.length - 1}
                              title="Descer"
                              className="text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground"
                            >
                              <ChevronDown className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      )}
                      <span className="text-xs font-semibold tabular-nums text-muted-foreground w-4 text-right flex-shrink-0">{idx + 1}</span>
                      <span className={`inline-block h-2.5 w-2.5 rounded-full flex-shrink-0 ${t?.dot ?? 'bg-slate-400'}`} />
                      <div className="min-w-0">
                        <div className="font-semibold truncate flex items-center gap-1.5">
                          {c.plate}
                          {next && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                              <ArrowRight className="h-3 w-3" /> A seguir
                            </span>
                          )}
                          {reordered && (
                            <span
                              className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full"
                              title="Ordem ajustada face à marcação"
                            >
                              ajustada
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {t?.label ?? c.wash_type} · {c.duration_min} min · {c.scheduled_at ? fmtDayTime(c.scheduled_at) : 'sem hora'}
                          {overdue && <span className="ml-1 font-semibold text-red-600 dark:text-red-400">· em atraso</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {canStart && (
                        <Button size="sm" onClick={() => handleStart(c.id)}>
                          <Play className="h-4 w-4" /> Iniciar
                        </Button>
                      )}
                      {canDelete && (
                        <Button size="sm" variant="ghost" onClick={() => requestDelete(c)} title="Remover agendamento">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* ── Ciclos em curso ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Timer className="h-4 w-4" /> Em curso
            <span className="text-xs font-normal text-muted-foreground">({activeSorted.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" /> {loadingLabel}
            </div>
          ) : activeSorted.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">Nenhuma lavagem em curso.</p>
          ) : (
            <ul className="space-y-2">
              {activeSorted.map(c => {
                const t = WASH_TYPE_MAP[c.wash_type];
                const dev = startDeviationMin(c);   // desvio face à marcação
                return (
                  <li
                    key={c.id}
                    className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 ${t?.block ?? ''}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`inline-block h-2.5 w-2.5 rounded-full flex-shrink-0 ${t?.dot ?? 'bg-slate-400'}`} />
                      <div className="min-w-0">
                        <div className="font-semibold truncate flex items-center gap-1.5">
                          {c.plate}
                          {dev != null && dev <= -5 && (
                            <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 dark:bg-emerald-500/20 dark:text-emerald-300 px-1.5 py-0.5 rounded-full" title="Iniciada antes da hora marcada">
                              antecipada {Math.abs(dev)}min
                            </span>
                          )}
                          {dev != null && dev >= 15 && (
                            <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 dark:bg-amber-500/20 dark:text-amber-300 px-1.5 py-0.5 rounded-full" title="Iniciada depois da hora marcada">
                              atraso {dev}min
                            </span>
                          )}
                          {c.quality_score != null && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-600">
                              <Star className="h-3 w-3 fill-amber-500 text-amber-500" />{c.quality_score}
                            </span>
                          )}
                        </div>
                        <div className="text-xs opacity-80">
                          {t?.label ?? c.wash_type} · {c.duration_min} min · início {fmtTime(effectiveAt(c))}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button size="sm" variant="ghost" onClick={() => openQC(c)} title="Controlo de qualidade">
                        <ClipboardCheck className="h-4 w-4" />
                      </Button>
                      {canTerminate && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleEnd(c.id)}
                        >
                          <CheckCircle2 className="h-4 w-4" /> Terminar
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

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
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BarChart3 className="h-4 w-4" /> Estatísticas
            </CardTitle>
            {canExport && (
              <Button variant="outline" size="sm" className="h-7 gap-1.5" onClick={handleExport} disabled={exporting}>
                {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />}
                Exportar Excel
              </Button>
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
            <div className="flex min-w-[640px] relative" style={{ height: gridHeight }}>
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
                      return (
                        <div
                          key={p.c.id}
                          onClick={() => openQC(p.c)}
                          className={`group absolute rounded border px-1.5 py-0.5 overflow-hidden text-[11px] leading-tight cursor-pointer ${t?.block ?? ''} ${p.c.ended_at ? 'opacity-60' : ''} ${scheduled ? 'border-dashed' : ''}`}
                          style={{
                            top, height,
                            left: `calc(${p.lane * widthPct}% + 2px)`,
                            width: `calc(${widthPct}% - 4px)`,
                          }}
                          title={`${p.c.plate} · ${t?.label ?? p.c.wash_type} · ${p.c.duration_min} min · ${fmtTime(effectiveAt(p.c))}${scheduled ? ' · agendada' : ''}${p.c.quality_score != null ? ` · QC ${p.c.quality_score}/10` : ''}`}
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
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>

          {loading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> {loadingLabel}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Dialog: controlo de qualidade ───────────────────────────────────── */}
      <Dialog open={!!qcCycle} onOpenChange={(o) => { if (!o) setQcCycle(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4" /> Controlo de qualidade
            </DialogTitle>
            {qcCycle && (
              <DialogDescription>
                {qcCycle.plate} · {WASH_TYPE_MAP[qcCycle.wash_type]?.label ?? qcCycle.wash_type} · {fmtTime(effectiveAt(qcCycle))}
              </DialogDescription>
            )}
          </DialogHeader>

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

          <DialogFooter className="sm:justify-between">
            {/* Remover lavagem/agendamento — só admin. Botão discreto (texto), à
             * esquerda no ecrã largo; pede confirmação antes de apagar. */}
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

      {/* ── Confirmação de remoção (admin) ──────────────────────────────────── */}
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
