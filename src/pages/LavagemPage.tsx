import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Car, Loader2, CheckCircle2, Timer, CalendarDays, Trash2, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/App';
import {
  WASH_TYPES, WASH_TYPE_MAP, type WashTypeId, type CarWashCycle,
  listCycles, listActiveCycles, createCycle, endCycle, deleteCycle,
} from '@/lib/lavagem';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';

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
const DEFAULT_START_HOUR = 8;
const DEFAULT_END_HOUR = 20;

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

type PlacedCycle = { c: CarWashCycle; start: number; dur: number; lane: number };

/* Distribui os ciclos de um dia por "faixas" para evitar sobreposição visual. */
function layoutDay(items: CarWashCycle[]): { placed: PlacedCycle[]; lanes: number } {
  const evs = items
    .map(c => ({ c, start: minutesOfDay(c.started_at), dur: Math.max(c.duration_min, 5) }))
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

  const [plate, setPlate] = useState('');
  const [washType, setWashType] = useState<WashTypeId | ''>('');
  const [submitting, setSubmitting] = useState(false);

  const [cycles, setCycles] = useState<CarWashCycle[]>([]);
  const [active, setActive] = useState<CarWashCycle[]>([]);
  const [loading, setLoading] = useState(true);

  // Semana selecionada (segunda-feira 00:00); navegável para trás/frente.
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const weekEnd = useMemo(() => addDays(weekStart, 5), [weekStart]);        // exclusivo (sábado 00:00)
  const currentWeekStart = useMemo(() => mondayOf(new Date()), []);
  const isCurrentWeek = weekStart.getTime() === currentWeekStart.getTime();

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [rows, act] = await Promise.all([
        listCycles({ from: weekStart.toISOString(), to: weekEnd.toISOString() }),
        listActiveCycles(),
      ]);
      setCycles(rows);
      setActive(act);
    } catch (e) {
      toast.error('Não foi possível carregar as lavagens.');
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [weekStart, weekEnd]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!plate.trim()) { toast.error('Indica a matrícula ou chassis.'); return; }
    if (!washType) { toast.error('Escolhe o tipo de lavagem.'); return; }
    setSubmitting(true);
    try {
      await createCycle({ plate, wash_type: washType, created_by: session?.user.email ?? null });
      toast.success('Lavagem iniciada.');
      setPlate('');
      setWashType('');
      await refresh();
    } catch (err) {
      toast.error('Não foi possível iniciar a lavagem.');
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEnd = async (id: string) => {
    try { await endCycle(id); toast.success('Lavagem terminada.'); await refresh(); }
    catch (err) { toast.error('Não foi possível terminar a lavagem.'); console.error(err); }
  };
  const handleDelete = async (id: string) => {
    try { await deleteCycle(id); await refresh(); }
    catch (err) { toast.error('Não foi possível remover o registo.'); console.error(err); }
  };

  const activeSorted = useMemo(
    () => [...active].sort((a, b) => a.started_at.localeCompare(b.started_at)),
    [active],
  );

  // Ciclos agrupados por dia útil da semana selecionada.
  const days = useMemo(() => {
    const base = WEEKDAYS.map((label, i) => ({ label, date: addDays(weekStart, i), items: [] as CarWashCycle[] }));
    cycles.forEach(c => {
      const idx = Math.floor((new Date(c.started_at).getTime() - weekStart.getTime()) / DAY_MS);
      if (idx >= 0 && idx < 5) base[idx].items.push(c);
    });
    return base;
  }, [cycles, weekStart]);

  // Janela horária da agenda: 8h–20h por defeito, expandida para caber os eventos.
  const [startHour, endHour] = useMemo(() => {
    let min = DEFAULT_START_HOUR, max = DEFAULT_END_HOUR;
    cycles.forEach(c => {
      const s = minutesOfDay(c.started_at);
      const e = s + Math.max(c.duration_min, 5);
      min = Math.min(min, Math.floor(s / 60));
      max = Math.max(max, Math.ceil(e / 60));
    });
    return [Math.max(0, min), Math.min(24, max)];
  }, [cycles]);

  const windowStartMin = startHour * 60;
  const gridHeight = (endHour - startHour) * HOUR_PX;
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i);

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

      {/* ── Formulário: abrir ciclo ─────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Nova lavagem</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
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

            <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Timer className="h-4 w-4" />}
              Iniciar
            </Button>
          </form>

          {selectedType && (
            <p className="mt-2 text-xs text-muted-foreground">
              Duração prevista: <span className="font-medium text-foreground">{selectedType.duration} min</span>
            </p>
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
              <Loader2 className="h-4 w-4 animate-spin" /> A carregar…
            </div>
          ) : activeSorted.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">Nenhuma lavagem em curso.</p>
          ) : (
            <ul className="space-y-2">
              {activeSorted.map(c => {
                const t = WASH_TYPE_MAP[c.wash_type];
                return (
                  <li
                    key={c.id}
                    className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 ${t?.block ?? ''}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`inline-block h-2.5 w-2.5 rounded-full flex-shrink-0 ${t?.dot ?? 'bg-slate-400'}`} />
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{c.plate}</div>
                        <div className="text-xs opacity-80">
                          {t?.label ?? c.wash_type} · {c.duration_min} min · início {fmtTime(c.started_at)}
                        </div>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleEnd(c.id)}
                      className="flex-shrink-0"
                    >
                      <CheckCircle2 className="h-4 w-4" /> Terminar
                    </Button>
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

      {/* ── Agenda semanal (dias úteis) ─────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <CalendarDays className="h-4 w-4" /> Semana {weekLabel}
            </CardTitle>
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
                {hours.map(h => (
                  <div
                    key={h}
                    className="absolute right-1 -translate-y-1/2 text-[10px] text-muted-foreground tabular-nums"
                    style={{ top: (h * 60 - windowStartMin) * PX_PER_MIN }}
                  >
                    {String(h).padStart(2, '0')}:00
                  </div>
                ))}
              </div>

              {/* Colunas dos dias */}
              {days.map((day, i) => {
                const { placed, lanes } = layoutDay(day.items);
                const isToday = isCurrentWeek && i === todayIdx;
                return (
                  <div key={day.label} className="flex-1 relative border-l border-border">
                    {/* Linhas de hora */}
                    {hours.map(h => (
                      <div
                        key={h}
                        className="absolute inset-x-0 border-t border-border/60"
                        style={{ top: (h * 60 - windowStartMin) * PX_PER_MIN }}
                      />
                    ))}
                    {/* Indicador de "agora" */}
                    {isToday && nowMin >= windowStartMin && nowMin <= endHour * 60 && (
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
                      return (
                        <div
                          key={p.c.id}
                          className={`group absolute rounded border px-1.5 py-0.5 overflow-hidden text-[11px] leading-tight ${t?.block ?? ''} ${p.c.ended_at ? 'opacity-60' : ''}`}
                          style={{
                            top, height,
                            left: `calc(${p.lane * widthPct}% + 2px)`,
                            width: `calc(${widthPct}% - 4px)`,
                          }}
                          title={`${p.c.plate} · ${t?.label ?? p.c.wash_type} · ${p.c.duration_min} min · ${fmtTime(p.c.started_at)}`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-semibold truncate">{p.c.plate}</span>
                            <button
                              onClick={() => handleDelete(p.c.id)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                              title="Remover"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                          {!compact && (
                            <div className="opacity-80 truncate">
                              {fmtTime(p.c.started_at)} · {t?.label ?? p.c.wash_type} · {p.c.duration_min}m
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
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> A carregar…
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
