import { useEffect, useMemo, useState } from 'react';
import { getISOWeek } from 'date-fns';
import {
  Loader2, Save, Users, Plus, Trash2, ChevronLeft, ChevronRight, RotateCcw, Flag, Check, FileDown,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const ESCALA_BUCKET = 'excel-files';
const ESCALA_TESTE_PATH = 'escala-teste.json';

// ---- Domain constants -------------------------------------------------------

const MONTHS_PT = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
const MONTHS_PT_FULL = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
const WEEKDAYS_PT = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];

// Colunas = tipologias de presença (como no ficheiro Escala_Aveiro)
type Typology = 'PG' | 'STAND' | 'APOIO' | 'LIVRE' | 'FOLGAS' | 'FÉRIAS' | 'FORMAÇÃO';
const TYPOLOGIES: Typology[] = ['PG', 'STAND', 'APOIO', 'LIVRE', 'FOLGAS', 'FÉRIAS', 'FORMAÇÃO'];

// Tipologias que contam como dia de trabalho (Σ) e para fins-de-semana (FDS)
const WORK_TYPOLOGIES: Typology[] = ['PG', 'STAND', 'APOIO', 'LIVRE'];

// Cor própria por pessoa (atribuída por ordem na equipa)
const PERSON_PALETTE = [
  'bg-blue-600 text-white',
  'bg-emerald-600 text-white',
  'bg-amber-500 text-black',
  'bg-purple-600 text-white',
  'bg-rose-600 text-white',
  'bg-teal-600 text-white',
  'bg-orange-600 text-white',
  'bg-cyan-600 text-white',
  'bg-lime-500 text-black',
  'bg-fuchsia-600 text-white',
];

// Equivalente em hex para a exportação PDF (mesma ordem da paleta acima)
const PERSON_HEX: Array<{ bg: string; text: string }> = [
  { bg: '#2563eb', text: '#ffffff' },
  { bg: '#059669', text: '#ffffff' },
  { bg: '#f59e0b', text: '#000000' },
  { bg: '#9333ea', text: '#ffffff' },
  { bg: '#e11d48', text: '#ffffff' },
  { bg: '#0d9488', text: '#ffffff' },
  { bg: '#ea580c', text: '#ffffff' },
  { bg: '#0891b2', text: '#ffffff' },
  { bg: '#84cc16', text: '#000000' },
  { bg: '#c026d3', text: '#ffffff' },
];

const HORARIO_LINES = [
  'Semana: 9h - 19h',
  'Stand: 9h - 12h e 13:30h - 19h',
  'Apoio: 10h - 13h30 e 15h - 18h',
  'Sábado: 10h - 13h e 14h - 18h*',
  '*Salvo exceções a comunicar',
];

// ---- Types ------------------------------------------------------------------

type MemberKind = 'PG' | 'VEND';

interface Member {
  id: string;
  initials: string;
  kind: MemberKind; // PG = gerente (só coluna PG); VEND = vendedor (restantes colunas)
}

// assignments: { "YYYY-MM-DD": { [Typology]: memberId[] } }
type DayAssign = Partial<Record<Typology, string[]>>;
type Assignments = Record<string, DayAssign>;

interface EscalaState {
  version: 2;
  year: number;
  month: number; // 0-11
  team: Member[];
  assignments: Assignments;
  holidays: string[]; // date keys "YYYY-MM-DD" em que não se trabalha
}

const DEFAULT_TEAM: Member[] = [
  { id: 'JD', initials: 'JD', kind: 'PG' },
  { id: 'BR', initials: 'BR', kind: 'VEND' },
  { id: 'FS', initials: 'FS', kind: 'VEND' },
  { id: 'NC', initials: 'NC', kind: 'VEND' },
  { id: 'PM', initials: 'PM', kind: 'VEND' },
  { id: 'TS', initials: 'TS', kind: 'VEND' },
];

function defaultState(): EscalaState {
  return {
    version: 2,
    year: 2026,
    month: 7, // Agosto (0-based)
    team: DEFAULT_TEAM.map(m => ({ ...m })),
    assignments: {},
    holidays: [],
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

// Migra formato antigo (v1: por pessoa -> função) para v2 (por tipologia -> pessoas)
function migrate(parsed: Record<string, unknown>): EscalaState {
  const base = defaultState();
  const team: Member[] = Array.isArray(parsed.team) && parsed.team.length
    ? (parsed.team as Array<Record<string, unknown>>).map(m => ({
        id: String(m.id ?? newMemberId()),
        initials: String(m.initials ?? 'XX'),
        kind: (m.kind === 'PG' || String(m.initials) === 'JD') ? 'PG' : 'VEND',
      }))
    : base.team;

  const rawAssign = (parsed.assignments ?? {}) as Record<string, Record<string, unknown>>;
  const assignments: Assignments = {};
  for (const [day, dayVal] of Object.entries(rawAssign)) {
    if (!dayVal || typeof dayVal !== 'object') continue;
    const dayMap: DayAssign = {};
    for (const [k, v] of Object.entries(dayVal)) {
      if (Array.isArray(v)) {
        // já é v2: k = tipologia, v = ids
        dayMap[k as Typology] = v as string[];
      } else if (typeof v === 'string' && v) {
        // v1: k = memberId, v = função
        const typ = (v === 'FOLGA' ? 'FOLGAS' : v) as Typology;
        if (TYPOLOGIES.includes(typ)) {
          (dayMap[typ] ??= []).push(k);
        }
      }
    }
    assignments[day] = dayMap;
  }

  return {
    version: 2,
    year: typeof parsed.year === 'number' ? parsed.year : base.year,
    month: typeof parsed.month === 'number' ? parsed.month : base.month,
    team,
    assignments,
    holidays: Array.isArray(parsed.holidays) ? (parsed.holidays as string[]) : [],
  };
}

// ---- Cell (multi-select de pessoas por tipologia) ---------------------------

function AssignCell({
  eligible, selectedIds, typ, colorOf, onToggle,
}: {
  eligible: Member[];
  selectedIds: string[];
  typ: Typology;
  colorOf: (memberId: string) => string;
  onToggle: (memberId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedMembers = eligible.filter(m => selectedIds.includes(m.id));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="flex min-h-[1.75rem] w-full flex-wrap items-center justify-center gap-0.5 rounded px-1 py-1 outline-none transition-colors hover:ring-1 hover:ring-primary">
          {selectedMembers.length ? (
            selectedMembers.map(m => (
              <span key={m.id} className={`rounded px-1 py-0.5 text-[11px] font-semibold ${colorOf(m.id)}`}>
                {m.initials}
              </span>
            ))
          ) : (
            <span className="text-[11px] font-semibold text-muted-foreground/50">—</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-44 p-1">
        <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{typ}</div>
        {eligible.length === 0 && (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">Sem pessoas elegíveis</div>
        )}
        {eligible.map(m => {
          const checked = selectedIds.includes(m.id);
          return (
            <button
              key={m.id}
              onClick={() => onToggle(m.id)}
              className="flex w-full items-center justify-between rounded px-2 py-1.5 text-sm hover:bg-accent"
            >
              <span className="flex items-center gap-1.5 font-medium">
                <span className={`h-3 w-3 rounded-sm ${colorOf(m.id)}`} />
                {m.initials}
              </span>
              {checked && <Check className="h-4 w-4 text-primary" />}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
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
          const parsed = JSON.parse(text) as Record<string, unknown>;
          if (!cancelled && parsed && Array.isArray(parsed.team)) {
            setState(migrate(parsed));
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
  const holidaySet = useMemo(() => new Set(state.holidays), [state.holidays]);

  const colorMap = useMemo(() => {
    const map: Record<string, string> = {};
    team.forEach((m, i) => { map[m.id] = PERSON_PALETTE[i % PERSON_PALETTE.length]; });
    return map;
  }, [team]);
  const colorOf = (id: string) => colorMap[id] ?? 'bg-muted text-foreground';

  const eligibleByTyp = (typ: Typology) =>
    team.filter(m => (typ === 'PG' ? m.kind === 'PG' : m.kind === 'VEND'));

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
        sunday: dow === 0, // domingo: encerrado, nunca se trabalha
      };
    });
  }, [year, month]);

  // Per-person summary for the visible month
  const summary = useMemo(() => {
    return team.map(m => {
      let pg = 0, std = 0, outros = 0, fds = 0;
      for (const d of days) {
        if (d.sunday || holidaySet.has(d.key)) continue; // domingo/feriado: ninguém trabalha
        const dayMap = assignments[d.key];
        if (!dayMap) continue;
        let typ: Typology | null = null;
        for (const t of TYPOLOGIES) {
          if (dayMap[t]?.includes(m.id)) { typ = t; break; }
        }
        if (!typ) continue;
        if (typ === 'PG') pg++;
        else if (typ === 'STAND') std++;
        else if (typ === 'APOIO' || typ === 'LIVRE') outros++;
        if (d.weekend && WORK_TYPOLOGIES.includes(typ)) fds++;
      }
      return { id: m.id, initials: m.initials, pg, std, outros, total: pg + std + outros, fds };
    });
  }, [team, days, assignments, holidaySet]);

  // ---- Mutations ----
  const toggleAssign = (dayKey: string, typ: Typology, memberId: string) => {
    setState(prev => {
      const day: DayAssign = {};
      const prevDay = prev.assignments[dayKey] ?? {};
      for (const t of TYPOLOGIES) day[t] = [...(prevDay[t] ?? [])];
      const already = day[typ]!.includes(memberId);
      // uma pessoa está numa só tipologia por dia
      for (const t of TYPOLOGIES) day[t] = day[t]!.filter(id => id !== memberId);
      if (!already) day[typ]!.push(memberId);
      // limpa arrays vazios
      const clean: DayAssign = {};
      for (const t of TYPOLOGIES) if (day[t]!.length) clean[t] = day[t]!;
      return { ...prev, assignments: { ...prev.assignments, [dayKey]: clean } };
    });
    setDirty(true);
  };

  const toggleHoliday = (dayKey: string) => {
    setState(prev => {
      const has = prev.holidays.includes(dayKey);
      return {
        ...prev,
        holidays: has ? prev.holidays.filter(k => k !== dayKey) : [...prev.holidays, dayKey],
      };
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

  const updateMember = (id: string, patch: Partial<Member>) => {
    setState(prev => ({
      ...prev,
      team: prev.team.map(m => (m.id === id ? { ...m, ...patch } : m)),
    }));
    setDirty(true);
  };

  const addMember = (kind: MemberKind) => {
    setState(prev => ({
      ...prev,
      team: [...prev.team, { id: newMemberId(), initials: 'XX', kind }],
    }));
    setDirty(true);
  };

  const removeMember = (id: string) => {
    setState(prev => {
      const assignments: Assignments = {};
      for (const [k, day] of Object.entries(prev.assignments)) {
        const clean: DayAssign = {};
        for (const t of TYPOLOGIES) {
          const arr = (day[t] ?? []).filter(mid => mid !== id);
          if (arr.length) clean[t] = arr;
        }
        assignments[k] = clean;
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

  const exportPdf = () => {
    const esc = (s: string) => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
    const idxOf = (id: string) => team.findIndex(m => m.id === id);
    const chip = (id: string) => {
      const c = PERSON_HEX[idxOf(id) % PERSON_HEX.length] ?? { bg: '#e5e7eb', text: '#111827' };
      const mem = team.find(m => m.id === id);
      return `<span style="display:inline-block;background:${c.bg};color:${c.text};border-radius:3px;padding:1px 4px;margin:1px;font-weight:700;font-size:9px">${esc(mem?.initials ?? '')}</span>`;
    };

    const head = ['SEM', 'DATA', 'DIA', ...TYPOLOGIES].map(h => `<th>${esc(h)}</th>`).join('');
    const bodyRows = days.map(d => {
      const isHol = holidaySet.has(d.key);
      const bg = isHol ? '#ffe4e6' : d.sunday ? '#bae6fd' : d.weekend ? '#e0f2fe' : '#ffffff';
      const dateCell = `${String(d.day).padStart(2, '0')} ${MONTHS_PT[month]}`;
      const wdStyle = isHol ? 'font-weight:700;color:#be123c' : d.weekend ? 'font-weight:700;color:#0369a1' : 'font-weight:600';
      if (isHol || d.sunday) {
        const label = isHol ? 'Feriado' : 'Encerrado';
        const color = isHol ? '#be123c' : '#075985';
        return `<tr style="background:${bg}"><td>${d.week}</td><td style="white-space:nowrap">${dateCell}</td><td style="${wdStyle}">${d.weekday}</td><td colspan="${TYPOLOGIES.length}" style="text-align:center;color:${color};font-weight:700;text-transform:uppercase;letter-spacing:.5px">${label}</td></tr>`;
      }
      const dayMap = assignments[d.key] ?? {};
      const cells = TYPOLOGIES.map(t => {
        const ids = dayMap[t] ?? [];
        return `<td>${ids.length ? ids.map(chip).join('') : '<span style="color:#cbd5e1">—</span>'}</td>`;
      }).join('');
      return `<tr style="background:${bg}"><td>${d.week}</td><td style="white-space:nowrap">${dateCell}</td><td style="${wdStyle}">${d.weekday}</td>${cells}</tr>`;
    }).join('');

    const sumHead = ['RESUMO', 'PG', 'STD', 'OU', 'Σ', 'FDS'].map(h => `<th>${esc(h)}</th>`).join('');
    const sumRows = summary.map(s =>
      `<tr><td style="text-align:left">${chip(s.id)}</td><td>${s.pg}</td><td>${s.std}</td><td>${s.outros}</td><td style="font-weight:700">${s.total}</td><td>${s.fds}</td></tr>`
    ).join('');

    const legend = team.map(m => chip(m.id)).join(' ');
    const horario = HORARIO_LINES.map(l => `<div${l.startsWith('*') ? ' style="font-style:italic"' : ''}>${esc(l)}</div>`).join('');

    const title = `Escala ${MONTHS_PT_FULL[month]} ${year}`;
    const fileTitle = `Escala_${MONTHS_PT[month]}_${year}`;

    const html = `<!doctype html><html lang="pt"><head><meta charset="utf-8" />
<title>${esc(fileTitle)}</title>
<style>
  *{-webkit-print-color-adjust:exact;print-color-adjust:exact;box-sizing:border-box}
  body{font-family:Arial,Helvetica,sans-serif;color:#111827;margin:16px}
  h1{font-size:16px;margin:0 0 2px}
  .sub{font-size:11px;color:#6b7280;margin:0 0 12px}
  table{width:100%;border-collapse:collapse;font-size:10px;margin-bottom:14px}
  th{background:#002060;color:#fff;padding:3px 4px;text-align:center;font-weight:700}
  td{border:1px solid #e5e7eb;padding:2px 4px;text-align:center}
  td:nth-child(1),td:nth-child(2){color:#6b7280}
  td:nth-child(3){text-align:left}
  .grid{display:flex;gap:18px;flex-wrap:wrap;align-items:flex-start}
  .grid table{width:auto;min-width:260px}
  .box{font-size:10px}
  .box h2{font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#6b7280;margin:0 0 4px}
  @page{size:A4 portrait;margin:10mm}
</style></head><body>
  <h1>ESCALA | CAETANO BMW Aveiro</h1>
  <p class="sub">${esc(title)}</p>
  <table><thead><tr>${head}</tr></thead><tbody>${bodyRows}</tbody></table>
  <div class="grid">
    <table><thead><tr>${sumHead}</tr></thead><tbody>${sumRows}</tbody></table>
    <div class="box"><h2>Equipa</h2><div>${legend}</div></div>
    <div class="box"><h2>Horário</h2>${horario}</div>
  </div>
  <script>window.onload=function(){window.focus();window.print();};</script>
</body></html>`;

    const w = window.open('', '_blank');
    if (!w) {
      toast.error('Permite pop-ups para exportar o PDF.');
      return;
    }
    w.document.write(html);
    w.document.close();
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
    } catch {
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
          <Button variant="outline" size="sm" onClick={exportPdf}>
            <FileDown className="h-4 w-4 mr-1.5" /> Exportar PDF
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
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={() => addMember('PG')}>
                <Plus className="h-4 w-4 mr-1" /> PG
              </Button>
              <Button variant="ghost" size="sm" onClick={() => addMember('VEND')}>
                <Plus className="h-4 w-4 mr-1" /> Vendedor
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {team.map(m => (
              <div key={m.id} className="flex items-center gap-1 rounded border border-border bg-background px-1.5 py-1">
                <Input
                  value={m.initials}
                  onChange={e => updateMember(m.id, { initials: e.target.value.toUpperCase().slice(0, 4) })}
                  className="h-7 w-14 text-center text-xs font-semibold uppercase"
                />
                <select
                  value={m.kind}
                  onChange={e => updateMember(m.id, { kind: e.target.value as MemberKind })}
                  className="h-7 rounded border border-border bg-background text-[11px] px-1"
                >
                  <option value="PG">PG</option>
                  <option value="VEND">Vendedor</option>
                </select>
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
            <strong>PG</strong> aparece apenas na coluna PG; <strong>Vendedor</strong> nas restantes colunas.
          </p>
        </div>
      )}

      {/* Schedule grid: linhas = dias, colunas = tipologias */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-[#002060] text-white">
              <th className="sticky left-0 z-10 bg-[#002060] px-2 py-1.5 text-left font-semibold">SEM</th>
              <th className="px-2 py-1.5 text-left font-semibold">DATA</th>
              <th className="px-2 py-1.5 text-left font-semibold">DIA</th>
              {TYPOLOGIES.map(t => (
                <th key={t} className="px-1 py-1.5 text-center font-semibold min-w-[5.5rem]">{t}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map(d => {
              const isHoliday = holidaySet.has(d.key);
              const closed = d.sunday || isHoliday;
              const rowBg = isHoliday
                ? 'bg-rose-100 dark:bg-rose-950/40'
                : d.sunday ? 'bg-sky-200 dark:bg-sky-900/50'
                : d.weekend ? 'bg-sky-100 dark:bg-sky-950/40'
                : 'odd:bg-background even:bg-muted/20';
              const dayMap = assignments[d.key] ?? {};
              return (
                <tr key={d.key} className={rowBg}>
                  <td className="sticky left-0 z-10 bg-inherit px-2 py-1 text-muted-foreground tabular-nums">{d.week}</td>
                  <td className="px-2 py-1 tabular-nums whitespace-nowrap">
                    {String(d.day).padStart(2, '0')} {MONTHS_PT[month]}
                  </td>
                  <td className="px-2 py-1">
                    <div className="flex items-center gap-1.5">
                      {!d.sunday && (
                        <button
                          onClick={() => toggleHoliday(d.key)}
                          title={isHoliday ? 'Desmarcar feriado' : 'Marcar como feriado'}
                          className={isHoliday ? 'text-rose-600' : 'text-muted-foreground/40 hover:text-rose-500'}
                        >
                          <Flag className="h-3.5 w-3.5" fill={isHoliday ? 'currentColor' : 'none'} />
                        </button>
                      )}
                      <span className={`font-medium ${isHoliday ? 'text-rose-700 dark:text-rose-300' : d.sunday ? 'text-sky-800 dark:text-sky-300' : d.weekend ? 'text-primary' : ''}`}>{d.weekday}</span>
                    </div>
                  </td>
                  {closed ? (
                    <td colSpan={TYPOLOGIES.length} className={`px-2 py-1 text-center text-[11px] font-semibold uppercase tracking-wider ${isHoliday ? 'text-rose-700 dark:text-rose-300' : 'text-sky-800 dark:text-sky-300'}`}>
                      {isHoliday ? 'Feriado' : 'Encerrado'}
                    </td>
                  ) : (
                    TYPOLOGIES.map(t => (
                      <td key={t} className="px-0.5 py-0.5">
                        <AssignCell
                          typ={t}
                          eligible={eligibleByTyp(t)}
                          selectedIds={dayMap[t] ?? []}
                          colorOf={colorOf}
                          onToggle={mid => toggleAssign(d.key, t, mid)}
                        />
                      </td>
                    ))
                  )}
                </tr>
              );
            })}
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
                  <td className="px-2 py-1 font-semibold">
                    <span className="flex items-center gap-1.5">
                      <span className={`h-3 w-3 rounded-sm ${colorOf(s.id)}`} />
                      {s.initials}
                    </span>
                  </td>
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
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Equipa</div>
            <div className="flex flex-wrap gap-1.5">
              {team.map(m => (
                <span key={m.id} className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${colorOf(m.id)}`}>{m.initials}</span>
              ))}
            </div>
            <p className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
              <Flag className="h-3 w-3 text-rose-600" fill="currentColor" /> marca o dia como feriado (ninguém trabalha).
            </p>
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
