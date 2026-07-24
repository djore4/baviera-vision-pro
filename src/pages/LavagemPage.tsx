import { useState, useEffect, useCallback, useMemo } from 'react';
import { Car, Loader2, CheckCircle2, Timer, CalendarDays, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/App';
import {
  WASH_TYPES, WASH_TYPE_MAP, type WashTypeId, type CarWashCycle,
  listCycles, createCycle, endCycle, deleteCycle,
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
 * Em baixo, vista semanal (dias úteis) com os ciclos, coloridos por tipo.
 * ──────────────────────────────────────────────────────────────────────────── */

const WEEKDAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'];

/* Segunda-feira (00:00) da semana da data dada. */
function mondayOf(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const dow = x.getDay();                 // 0 = domingo
  const diff = dow === 0 ? -6 : 1 - dow;  // recuar até segunda
  x.setDate(x.getDate() + diff);
  return x;
}

const fmtTime = (iso: string) =>
  new Intl.DateTimeFormat('pt-PT', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

const fmtDayMonth = (d: Date) =>
  new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: '2-digit' }).format(d);

export default function LavagemPage() {
  const { session } = useAuth();

  const [plate, setPlate] = useState('');
  const [washType, setWashType] = useState<WashTypeId | ''>('');
  const [submitting, setSubmitting] = useState(false);

  const [cycles, setCycles] = useState<CarWashCycle[]>([]);
  const [loading, setLoading] = useState(true);

  // Vista semanal fixada na semana atual (dias úteis).
  const weekStart = useMemo(() => mondayOf(new Date()), []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      // Trazer os ciclos desde o início da semana para popular a vista.
      const rows = await listCycles(weekStart.toISOString());
      setCycles(rows);
    } catch (e) {
      toast.error('Não foi possível carregar as lavagens.');
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [weekStart]);

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
    try {
      await endCycle(id);
      toast.success('Lavagem terminada.');
      await refresh();
    } catch (err) {
      toast.error('Não foi possível terminar a lavagem.');
      console.error(err);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteCycle(id);
      await refresh();
    } catch (err) {
      toast.error('Não foi possível remover o registo.');
      console.error(err);
    }
  };

  const activeCycles = useMemo(
    () => cycles.filter(c => !c.ended_at).sort((a, b) => a.started_at.localeCompare(b.started_at)),
    [cycles],
  );

  // Agrupar ciclos por dia útil da semana atual.
  const byDay = useMemo(() => {
    const days = WEEKDAYS.map((label, i) => {
      const date = new Date(weekStart);
      date.setDate(date.getDate() + i);
      return { label, date, items: [] as CarWashCycle[] };
    });
    cycles.forEach(c => {
      const start = new Date(c.started_at);
      const idx = Math.floor((start.getTime() - weekStart.getTime()) / 86400000);
      if (idx >= 0 && idx < 5) days[idx].items.push(c);
    });
    days.forEach(d => d.items.sort((a, b) => a.started_at.localeCompare(b.started_at)));
    return days;
  }, [cycles, weekStart]);

  const selectedType = washType ? WASH_TYPE_MAP[washType] : null;
  // Índice do dia de hoje (0=segunda … 4=sexta); -1 no fim-de-semana.
  const todayIdx = Math.round((new Date().setHours(0, 0, 0, 0) - weekStart.getTime()) / 86400000);

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
            <span className="text-xs font-normal text-muted-foreground">({activeCycles.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" /> A carregar…
            </div>
          ) : activeCycles.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">Nenhuma lavagem em curso.</p>
          ) : (
            <ul className="space-y-2">
              {activeCycles.map(c => {
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

      {/* ── Vista semanal (dias úteis) ──────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <CalendarDays className="h-4 w-4" /> Semana ({fmtDayMonth(weekStart)})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
            {byDay.map((day, i) => (
              <div
                key={day.label}
                className={`rounded-md border p-2 min-h-[8rem] ${i === todayIdx ? 'ring-2 ring-primary/50' : ''}`}
              >
                <div className="mb-2 flex items-baseline justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide">{day.label}</span>
                  <span className="text-[10px] text-muted-foreground">{fmtDayMonth(day.date)}</span>
                </div>
                {day.items.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">—</p>
                ) : (
                  <ul className="space-y-1.5">
                    {day.items.map(c => {
                      const t = WASH_TYPE_MAP[c.wash_type];
                      return (
                        <li
                          key={c.id}
                          className={`group rounded border px-1.5 py-1 text-[11px] ${t?.block ?? ''} ${c.ended_at ? 'opacity-60' : ''}`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-semibold truncate">{c.plate}</span>
                            <button
                              onClick={() => handleDelete(c.id)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                              title="Remover"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                          <div className="flex items-center justify-between gap-1 opacity-80">
                            <span>{t?.label ?? c.wash_type} · {c.duration_min}m</span>
                            <span>{fmtTime(c.started_at)}</span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
