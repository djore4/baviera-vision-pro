import { useEffect, useMemo, useState } from 'react';
import { getISOWeek } from 'date-fns';
import { Loader2, Save, Users, Plus, Trash2, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const ESCALA_BUCKET = 'excel-files';
const ESCALA_TESTE_PATH = 'escala-teste.json';

// ---- Domain constants -------------------------------------------------------

const MONTHS_PT = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
const MONTHS_PT_FULL = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
const WEEKDAYS_PT = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];

type Role = '' | 'PG' | 'STAND' | 'APOIO' | 'LIVRE' | 'FOLGA' | 'FÉRIAS' | 'FORMAÇÃO';

const ROLES: Role[] = ['', 'PG', 'STAND', 'APOIO', 'LIVRE', 'FOLGA', 'FÉRIAS', 'FORMAÇÃO'];

// Roles that count as a worked day (Σ) and towards weekend duty (FDS)
const WORK_ROLES: Role[] = ['PG', 'STAND', 'APOIO', 'LIVRE'];
// "Outros" bucket in the summary (matches COUNTIF over APOIO + LIVRE columns)
const OUTROS_ROLES: Role[] = ['APOIO', 'LIVRE'];

const ROLE_STYLES: Record<Role, string> = {
  '': 'bg-muted/40 text-muted-foreground',
  PG: 'bg-[#002060] text-white',
  STAND: 'bg-blue-500 text-white',
  APOIO: 'bg-teal-500 text-white',
  LIVRE: 'bg-emerald-200 text-emerald-900',
  FOLGA: 'bg-amber-400 text-amber-950',
  'FÉRIAS': 'bg-purple-500 text-white',
  'FORMAÇÃO': 'bg-orange-500 text-white',
};

const HORARIO_LINES = [
  'Semana: 9h - 19h',
  'Stand: 9h - 12h e 13:30h - 19h',
  'Apoio: 10h - 13h30 e 15h - 18h',
  'Sábado: 10h - 13h e 14h - 18h*',
  '*Salvo exceções a comunicar',
];

// ---- Types ------------------------------------------------------------------

interface Member {
  id: string;
  initials: string;
}

// assignments: { "YYYY-MM-DD": { [memberId]: Role } }
type Assignments = Record<string, Record<string, Role>>;

interface EscalaState {
  version: 1;
  year: number;
  month: number; // 0-11
  team: Member[];
  assignments: Assignments;
}

const DEFAULT_TEAM: Member[] = [
  { id: 'JD', initials: 'JD' },
  { id: 'BR', initials: 'BR' },
  { id: 'FS', initials: 'FS' },
  { id: 'NC', initials: 'NC' },
  { id: 'PM', initials: 'PM' },
  { id: 'TS', initials: 'TS' },
];

function defaultState(): EscalaState {
  return {
    version: 1,
    year: 2026,
    month: 7, // Agosto (0-based)
    team: DEFAULT_TEAM.map(m => ({ ...m })),
    assignments: {},
  };
}

// ---- Helpers ----------------------------------------------------------------

function dateKey(year: number, month: number, day: number): string {
  const mm = String(month + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function newMemberId(): string {
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

// ---- Component --------------------------------------------------------------

export default function EscalaTestePage() {
  const [state, setState] = useState<EscalaState>(defaultState);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);

  // Load persisted schedule
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.storage
          .from(ESCALA_BUCKET)
          .download(ESCALA_TESTE_PATH);
        if (!error && data) {
          const text = await data.text();
          const parsed = JSON.parse(text) as Partial<EscalaState>;
          if (!cancelled && parsed && Array.isArray(parsed.team)) {
            setState({
              version: 1,
              year: parsed.year ?? 2026,
              month: parsed.month ?? 7,
              team: parsed.team.length ? parsed.team : defaultState().team,
              assignments: parsed.assignments ?? {},
            });
          }
        }
      } catch {
        // keep default
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const { year, month, team, assignments } = state;

  const days = useMemo(() => {
    const total = daysInMonth(year, month);
    return Array.from({ length: total }, (_, i) => {
      const day = i + 1;
      const d = new Date(year, month, day);
      const dow = d.getDay(); // 0=Sun..6=Sat
      return {
        day,
        key: dateKey(year, month, day),
        weekday: WEEKDAYS_PT[dow],
        week: getISOWeek(d),
        weekend: dow === 0 || dow === 6,
      };
    });
  }, [year, month]);

  // Per-person summary for the visible month
  const summary = useMemo(() => {
    return team.map(m => {
      let pg = 0, std = 0, outros = 0, fds = 0;
      for (const d of days) {
        const role = assignments[d.key]?.[m.id] ?? '';
        if (role === 'PG') pg++;
        else if (role === 'STAND') std++;
        else if (role === 'APOIO' || role === 'LIVRE') outros++;
        if (d.weekend && WORK_ROLES.includes(role)) fds++;
      }
      return { id: m.id, initials: m.initials, pg, std, outros, total: pg + std + outros, fds };
    });
  }, [team, days, assignments]);

  // ---- Mutations ----
  const setRole = (dayKey: string, memberId: string, role: Role) => {
    setState(prev => {
      const dayMap = { ...(prev.assignments[dayKey] ?? {}) };
      if (role === '') delete dayMap[memberId];
      else dayMap[memberId] = role;
      return { ...prev, assignments: { ...prev.assignments, [dayKey]: dayMap } };
    });
    setDirty(true);
  };

  const changeMonth = (delta: number) => {
    setState(prev => {
      let m = prev.month + delta;
      let y = prev.year;
      if (m < 0) { m = 11; y--; }
      if (m > 11) { m = 0; y++; }
      return { ...prev, month: m, year: y };
    });
  };

  const updateMember = (id: string, initials: string) => {
    setState(prev => ({
      ...prev,
      team: prev.team.map(m => (m.id === id ? { ...m, initials } : m)),
    }));
    setDirty(true);
  };

  const addMember = () => {
    setState(prev => ({
      ...prev,
      team: [...prev.team, { id: newMemberId(), initials: 'XX' }],
    }));
    setDirty(true);
  };

  const removeMember = (id: string) => {
    setState(prev => {
      const assignments: Assignments = {};
      for (const [k, v] of Object.entries(prev.assignments)) {
        const { [id]: _removed, ...rest } = v;
        assignments[k] = rest;
      }
      return { ...prev, team: prev.team.filter(m => m.id !== id), assignments };
    });
    setDirty(true);
  };

  const clearMonth = () => {
    setState(prev => {
      const assignments = { ...prev.assignments };
      for (const d of days) delete assignments[d.key];
      return { ...prev, assignments };
    });
    setDirty(true);
    toast.info('Escala do mês limpa (guarda para confirmar).');
  };

  const save = async () => {
    setSaving(true);
    try {
      const blob = new Blob([JSON.stringify(state)], { type: 'application/json' });
      const { error } = await supabase.storage
        .from(ESCALA_BUCKET)
        .upload(ESCALA_TESTE_PATH, blob, { upsert: true, contentType: 'application/json' });
      if (error) throw error;
      setDirty(false);
      toast.success('Escala guardada.');
    } catch (e) {
      toast.error('Falha ao guardar a escala.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center space-y-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">A carregar escala...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => changeMonth(-1)} aria-label="Mês anterior">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-[9rem] text-center">
            <div className="text-sm font-semibold text-foreground">{MONTHS_PT_FULL[month]} {year}</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Escala mensal</div>
          </div>
          <Button variant="outline" size="icon" onClick={() => changeMonth(1)} aria-label="Mês seguinte">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setTeamOpen(o => !o)}>
            <Users className="h-4 w-4 mr-1.5" /> Equipa
          </Button>
          <Button variant="outline" size="sm" onClick={clearMonth}>
            <RotateCcw className="h-4 w-4 mr-1.5" /> Limpar mês
          </Button>
          <Button size="sm" onClick={save} disabled={saving || !dirty}>
            {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
            {dirty ? 'Guardar' : 'Guardado'}
          </Button>
        </div>
      </div>

      {/* Team editor */}
      {teamOpen && (
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Equipa</span>
            <Button variant="ghost" size="sm" onClick={addMember}>
              <Plus className="h-4 w-4 mr-1" /> Adicionar
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {team.map(m => (
              <div key={m.id} className="flex items-center gap-1 rounded border border-border bg-background px-1.5 py-1">
                <Input
                  value={m.initials}
                  onChange={e => updateMember(m.id, e.target.value.toUpperCase().slice(0, 4))}
                  className="h-7 w-16 text-center text-xs font-semibold uppercase"
                />
                <button
                  onClick={() => removeMember(m.id)}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label="Remover"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            As iniciais aparecem como colunas na grelha. Remover uma pessoa apaga as suas atribuições.
          </p>
        </div>
      )}

      {/* Schedule grid */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-[#002060] text-white">
              <th className="sticky left-0 z-10 bg-[#002060] px-2 py-1.5 text-left font-semibold">SEM</th>
              <th className="px-2 py-1.5 text-left font-semibold">DATA</th>
              <th className="px-2 py-1.5 text-left font-semibold">DIA</th>
              {team.map(m => (
                <th key={m.id} className="px-1 py-1.5 text-center font-semibold min-w-[5.5rem]">{m.initials}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map(d => (
              <tr key={d.key} className={d.weekend ? 'bg-muted/50' : 'odd:bg-background even:bg-muted/20'}>
                <td className="sticky left-0 z-10 bg-inherit px-2 py-1 text-muted-foreground tabular-nums">{d.week}</td>
                <td className="px-2 py-1 tabular-nums whitespace-nowrap">
                  {String(d.day).padStart(2, '0')} {MONTHS_PT[month]}
                </td>
                <td className={`px-2 py-1 font-medium ${d.weekend ? 'text-primary' : ''}`}>{d.weekday}</td>
                {team.map(m => {
                  const role = (assignments[d.key]?.[m.id] ?? '') as Role;
                  return (
                    <td key={m.id} className="px-0.5 py-0.5">
                      <select
                        value={role}
                        onChange={e => setRole(d.key, m.id, e.target.value as Role)}
                        className={`w-full cursor-pointer rounded border-0 px-1 py-1 text-center text-[11px] font-semibold outline-none focus:ring-1 focus:ring-primary ${ROLE_STYLES[role]}`}
                      >
                        {ROLES.map(r => (
                          <option key={r || 'none'} value={r} className="bg-background text-foreground">
                            {r === '' ? '—' : r}
                          </option>
                        ))}
                      </select>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Summary + legend */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Summary table */}
        <div className="lg:col-span-2 overflow-x-auto rounded-lg border border-border">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-muted text-muted-foreground">
                <th className="px-2 py-1.5 text-left font-semibold">RESUMO</th>
                <th className="px-2 py-1.5 text-center font-semibold" title="Dias como PG">PG</th>
                <th className="px-2 py-1.5 text-center font-semibold" title="Dias no Stand">STD</th>
                <th className="px-2 py-1.5 text-center font-semibold" title="Apoio + Livre">OU</th>
                <th className="px-2 py-1.5 text-center font-semibold" title="Total de dias de trabalho">Σ</th>
                <th className="px-2 py-1.5 text-center font-semibold" title="Fins-de-semana trabalhados">FDS</th>
              </tr>
            </thead>
            <tbody>
              {summary.map(s => (
                <tr key={s.id} className="odd:bg-background even:bg-muted/20">
                  <td className="px-2 py-1 font-semibold">{s.initials}</td>
                  <td className="px-2 py-1 text-center tabular-nums">{s.pg}</td>
                  <td className="px-2 py-1 text-center tabular-nums">{s.std}</td>
                  <td className="px-2 py-1 text-center tabular-nums">{s.outros}</td>
                  <td className="px-2 py-1 text-center font-semibold tabular-nums">{s.total}</td>
                  <td className="px-2 py-1 text-center tabular-nums">{s.fds}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Legend / Horário */}
        <div className="rounded-lg border border-border bg-card p-3 space-y-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Funções</div>
            <div className="flex flex-wrap gap-1.5">
              {ROLES.filter(r => r !== '').map(r => (
                <span key={r} className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${ROLE_STYLES[r]}`}>{r}</span>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Horário</div>
            <ul className="space-y-0.5 text-[11px] text-muted-foreground">
              {HORARIO_LINES.map(l => (
                <li key={l} className={l.startsWith('*') ? 'italic' : ''}>{l}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
