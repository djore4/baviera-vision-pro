import { useEffect, useMemo, useState } from 'react';
import { getISOWeek } from 'date-fns';
import {
  Loader2, Save, Users, Plus, Trash2, ChevronLeft, ChevronRight, RotateCcw, Check, FileDown, Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const ESCALA_BUCKET = 'excel-files';
const ESCALA_REPSOL_PATH = 'escala-repsol.json';

// ---- Domain constants -------------------------------------------------------

const MONTHS_PT = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
const MONTHS_PT_FULL = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
const WEEKDAYS_PT = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];

// Faixas de turno escalonadas (como na escala real do posto: 7h–23h).
type ShiftKey = '07-15' | '08-16' | '09-17' | '12-20' | '15-23';
interface ShiftDef {
  key: ShiftKey;
  label: string; // compacto para a grelha
  full: string;  // extenso para o PDF/legenda
  start: number;
  end: number;
  tint: string;  // cor da célula na grelha
  hex: string;   // cor equivalente no PDF
}
const SHIFTS: ShiftDef[] = [
  { key: '07-15', label: '07–15', full: '07H00–15H00', start: 7, end: 15, tint: 'bg-sky-100 text-sky-900 dark:bg-sky-950/50 dark:text-sky-200', hex: '#e0f2fe' },
  { key: '08-16', label: '08–16', full: '08H00–16H00', start: 8, end: 16, tint: 'bg-cyan-100 text-cyan-900 dark:bg-cyan-950/50 dark:text-cyan-200', hex: '#cffafe' },
  { key: '09-17', label: '09–17', full: '09H00–17H00', start: 9, end: 17, tint: 'bg-teal-100 text-teal-900 dark:bg-teal-950/50 dark:text-teal-200', hex: '#ccfbf1' },
  { key: '12-20', label: '12–20', full: '12H00–20H00', start: 12, end: 20, tint: 'bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200', hex: '#fef3c7' },
  { key: '15-23', label: '15–23', full: '15H00–23H00', start: 15, end: 23, tint: 'bg-violet-100 text-violet-900 dark:bg-violet-950/50 dark:text-violet-200', hex: '#ede9fe' },
];
const SHIFT_BY_KEY: Record<ShiftKey, ShiftDef> =
  SHIFTS.reduce((a, s) => { a[s.key] = s; return a; }, {} as Record<ShiftKey, ShiftDef>);

const OPEN_HOUR = 7;   // abertura do posto
const CLOSE_HOUR = 23; // fecho do posto

// Estado de um funcionário num dia: uma faixa de turno, Folga ou Férias.
type DayStatus = ShiftKey | 'Folga' | 'Férias';

function isShift(status: DayStatus | undefined): status is ShiftKey {
  return !!status && status !== 'Folga' && status !== 'Férias';
}

const HORARIO_LINES = [
  'Posto: 7h – 23h (todos os dias)',
  'Turnos: 07–15 · 08–16 · 09–17 · 12–20 · 15–23',
  '(L) = turno responsável pela limpeza',
  'Aberto fins-de-semana e feriados*',
  '*Salvo exceções a comunicar',
];

// ---- Types ------------------------------------------------------------------

interface Member {
  id: string;
  name: string;
  initials: string;
}

// { "YYYY-MM-DD": { [memberId]: { status, limpeza? } } }
interface CellVal { status: DayStatus; limpeza?: boolean }
type DayAssign = Record<string, CellVal>;
type Assignments = Record<string, DayAssign>;

interface EscalaState {
  version: 2;
  year: number;
  month: number; // 0-11
  team: Member[];
  assignments: Assignments;
}

// Funcionários do posto Repsol.
const DEFAULT_TEAM: Member[] = [
  { id: 'DR', name: 'Deborah Raposo', initials: 'DR' },
  { id: 'RJ', name: 'Rhayane José', initials: 'RJ' },
  { id: 'AF', name: 'Ana Ferreira', initials: 'AF' },
  { id: 'GG', name: 'Grazielle Guidinelle', initials: 'GG' },
  { id: 'JA', name: 'José António', initials: 'JA' },
];

// Cor identificadora por pessoa (cabeçalho e resumo).
const PERSON_DOT = [
  'bg-blue-600', 'bg-red-600', 'bg-amber-500', 'bg-violet-600', 'bg-emerald-600',
  'bg-orange-600', 'bg-cyan-600', 'bg-fuchsia-600', 'bg-lime-600', 'bg-pink-600',
];

function defaultState(): EscalaState {
  return {
    version: 2,
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

function firstName(name: string, fallback: string): string {
  return (name.trim().split(/\s+/)[0] || fallback).toUpperCase();
}

// Normaliza o estado persistido (tolerante ao formato v1 anterior).
function normalize(parsed: Record<string, unknown>): EscalaState {
  const base = defaultState();
  const team: Member[] = Array.isArray(parsed.team) && parsed.team.length
    ? (parsed.team as Array<Record<string, unknown>>).map(m => ({
        id: String(m.id ?? newMemberId()),
        name: String(m.name ?? m.initials ?? ''),
        initials: String(m.initials ?? 'XX'),
      }))
    : base.team;

  const validStatus = new Set<DayStatus>(['Folga', 'Férias', ...SHIFTS.map(s => s.key)]);
  const rawAssign = (parsed.assignments ?? {}) as Record<string, unknown>;
  const assignments: Assignments = {};
  for (const [day, dayVal] of Object.entries(rawAssign)) {
    if (!dayVal || typeof dayVal !== 'object') continue;
    const dayMap: DayAssign = {};
    for (const [memberId, cell] of Object.entries(dayVal as Record<string, unknown>)) {
      if (!cell || typeof cell !== 'object') continue;
      const status = (cell as { status?: unknown }).status as DayStatus;
      if (!validStatus.has(status) || status === 'Folga') continue;
      dayMap[memberId] = {
        status,
        limpeza: isShift(status) ? !!(cell as { limpeza?: unknown }).limpeza : false,
      };
    }
    if (Object.keys(dayMap).length) assignments[day] = dayMap;
  }

  return {
    version: 2,
    year: typeof parsed.year === 'number' ? parsed.year : base.year,
    month: typeof parsed.month === 'number' ? parsed.month : base.month,
    team,
    assignments,
  };
}

// ---- Brand ------------------------------------------------------------------

function RepsolBrand({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span className="grid h-7 w-7 place-items-center rounded-md bg-repsol-orange shadow-sm" aria-hidden>
        {/* Chama estilizada, evocando o emblema Repsol (não é o logótipo oficial). */}
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
          <path d="M12 3c3 3 5 5.5 5 9a5 5 0 0 1-10 0c0-1.6.7-3 1.8-4.2C9 9.5 9.4 11 10.6 11.6 10 10 10.4 6.8 12 3z"
            fill="#fff" />
          <circle cx="12" cy="14.5" r="2.4" fill="#E4032E" />
        </svg>
      </span>
      <span className="text-base font-extrabold tracking-tight text-repsol-orange">Repsol</span>
    </span>
  );
}

// ---- Cell (escolhe o turno/estado da pessoa nesse dia) ----------------------

function DayCell({
  value, onSet, onToggleLimpeza,
}: {
  value: CellVal | undefined;
  onSet: (status: DayStatus) => void;
  onToggleLimpeza: () => void;
}) {
  const [open, setOpen] = useState(false);
  const status = value?.status;
  const shift = isShift(status) ? SHIFT_BY_KEY[status] : null;

  const cellClass = shift
    ? shift.tint
    : status === 'Férias'
      ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200'
      : 'text-muted-foreground/40';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={`flex min-h-[1.9rem] w-full items-center justify-center gap-1 rounded px-0.5 py-1 text-[11px] font-semibold leading-tight outline-none transition-colors hover:ring-1 hover:ring-repsol-orange ${cellClass}`}
        >
          {shift ? (
            <>
              <span className="tabular-nums">{shift.label}</span>
              {value?.limpeza && (
                <span className="rounded-sm bg-repsol-orange px-1 text-[9px] font-bold text-white" title="Limpeza">L</span>
              )}
            </>
          ) : status === 'Férias' ? (
            <span>Férias</span>
          ) : (
            <span>—</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-40 p-1">
        <button
          onClick={() => { onSet('Folga'); setOpen(false); }}
          className="flex w-full items-center justify-between rounded px-2 py-1.5 text-sm hover:bg-accent"
        >
          <span className="text-muted-foreground">Folga</span>
          {status === undefined && <Check className="h-4 w-4 text-repsol-orange" />}
        </button>
        {SHIFTS.map(s => (
          <button
            key={s.key}
            onClick={() => { onSet(s.key); setOpen(false); }}
            className="flex w-full items-center justify-between rounded px-2 py-1.5 text-sm hover:bg-accent"
          >
            <span className="flex items-center gap-1.5 font-medium">
              <span className={`h-3 w-3 rounded-sm ${s.tint.split(' ')[0]}`} />
              {s.full}
            </span>
            {status === s.key && <Check className="h-4 w-4 text-repsol-orange" />}
          </button>
        ))}
        <button
          onClick={() => { onSet('Férias'); setOpen(false); }}
          className="flex w-full items-center justify-between rounded px-2 py-1.5 text-sm hover:bg-accent"
        >
          <span className="flex items-center gap-1.5 font-medium">
            <span className="h-3 w-3 rounded-sm bg-emerald-500" />
            Férias
          </span>
          {status === 'Férias' && <Check className="h-4 w-4 text-repsol-orange" />}
        </button>
        <div className="my-1 border-t border-border" />
        <button
          onClick={() => { if (isShift(status)) { onToggleLimpeza(); setOpen(false); } }}
          disabled={!isShift(status)}
          className="flex w-full items-center justify-between rounded px-2 py-1.5 text-sm hover:bg-accent disabled:opacity-40"
        >
          <span className="flex items-center gap-1.5 font-medium">
            <Sparkles className="h-3.5 w-3.5 text-repsol-orange" />
            Limpeza (L)
          </span>
          {value?.limpeza && <Check className="h-4 w-4 text-repsol-orange" />}
        </button>
      </PopoverContent>
    </Popover>
  );
}

// ---- Component --------------------------------------------------------------

export default function EscalaRepsolPage() {
  const [state, setState] = useState<EscalaState>(defaultState);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.storage
          .from(ESCALA_BUCKET)
          .download(ESCALA_REPSOL_PATH);
        if (!error && data) {
          const text = await data.text();
          const parsed = JSON.parse(text) as Record<string, unknown>;
          if (!cancelled && parsed && Array.isArray(parsed.team)) {
            setState(normalize(parsed));
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

  const colorOf = (i: number) => PERSON_DOT[i % PERSON_DOT.length];

  const days = useMemo(() => {
    const total = daysInMonth(year, month);
    return Array.from({ length: total }, (_, i) => {
      const day = i + 1;
      const d = new Date(year, month, day);
      const dow = d.getDay();
      return {
        day,
        key: dateKey(year, month, day),
        weekday: WEEKDAYS_PT[dow],
        week: getISOWeek(d),
        weekend: dow === 0 || dow === 6,
      };
    });
  }, [year, month]);

  // Cobertura por dia: abertura (alguém às 7h), fecho (alguém até às 23h), limpeza atribuída.
  const coverage = useMemo(() => {
    const perDay = days.map(d => {
      const dayMap = assignments[d.key] ?? {};
      let opening = false, closing = false, limpeza = false;
      for (const cell of Object.values(dayMap)) {
        if (!isShift(cell.status)) continue;
        const s = SHIFT_BY_KEY[cell.status];
        if (s.start <= OPEN_HOUR) opening = true;
        if (s.end >= CLOSE_HOUR) closing = true;
        if (cell.limpeza) limpeza = true;
      }
      return { key: d.key, opening, closing, limpeza };
    });
    return {
      perDay: perDay.reduce((a, c) => { a[c.key] = c; return a; }, {} as Record<string, { opening: boolean; closing: boolean; limpeza: boolean }>),
      noOpen: perDay.filter(c => !c.opening).length,
      noClose: perDay.filter(c => !c.closing).length,
      noLimpeza: perDay.filter(c => !c.limpeza).length,
    };
  }, [days, assignments]);

  // Resumo por pessoa.
  const summary = useMemo(() => {
    const totalDays = days.length;
    return team.map((m, i) => {
      let work = 0, fds = 0, fer = 0, lim = 0;
      for (const d of days) {
        const cell = assignments[d.key]?.[m.id];
        if (!cell) continue; // sem entrada = folga
        if (cell.status === 'Férias') { fer++; continue; }
        if (isShift(cell.status)) {
          work++;
          if (d.weekend) fds++;
          if (cell.limpeza) lim++;
        }
      }
      const fol = totalDays - work - fer;
      return { id: m.id, name: m.name, initials: m.initials, color: colorOf(i), work, fds, fol, fer, lim };
    });
  }, [team, days, assignments]);

  // ---- Mutations ----
  const setCell = (dayKey: string, memberId: string, status: DayStatus) => {
    setState(prev => {
      const day: DayAssign = { ...(prev.assignments[dayKey] ?? {}) };
      if (status === 'Folga') {
        delete day[memberId];
      } else {
        const prevCell = day[memberId];
        day[memberId] = { status, limpeza: isShift(status) ? !!prevCell?.limpeza : false };
      }
      const nextAssign = { ...prev.assignments };
      if (Object.keys(day).length) nextAssign[dayKey] = day; else delete nextAssign[dayKey];
      return { ...prev, assignments: nextAssign };
    });
    setDirty(true);
  };

  const toggleLimpeza = (dayKey: string, memberId: string) => {
    setState(prev => {
      const day: DayAssign = {};
      const prevDay = prev.assignments[dayKey] ?? {};
      const turnOn = !prevDay[memberId]?.limpeza;
      for (const [id, cell] of Object.entries(prevDay)) {
        // Apenas um turno de limpeza por dia.
        day[id] = { ...cell, limpeza: turnOn ? id === memberId : cell.limpeza && id !== memberId };
      }
      return { ...prev, assignments: { ...prev.assignments, [dayKey]: day } };
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
    setState(prev => ({ ...prev, team: prev.team.map(m => (m.id === id ? { ...m, ...patch } : m)) }));
    setDirty(true);
  };

  const addMember = () => {
    setState(prev => ({ ...prev, team: [...prev.team, { id: newMemberId(), name: '', initials: 'XX' }] }));
    setDirty(true);
  };

  const removeMember = (id: string) => {
    setState(prev => {
      const assignments: Assignments = {};
      for (const [k, day] of Object.entries(prev.assignments)) {
        const clean: DayAssign = {};
        for (const [mid, cell] of Object.entries(day)) if (mid !== id) clean[mid] = cell;
        if (Object.keys(clean).length) assignments[k] = clean;
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
    const cellHtml = (cell: CellVal | undefined) => {
      if (!cell) return '<span style="color:#cbd5e1">—</span>';
      if (cell.status === 'Férias') return '<span style="color:#047857;font-weight:700">Férias</span>';
      if (isShift(cell.status)) {
        const s = SHIFT_BY_KEY[cell.status];
        const l = cell.limpeza ? ' <span style="background:#EF7D00;color:#fff;border-radius:2px;padding:0 3px;font-size:8px;font-weight:700">L</span>' : '';
        return `<span style="white-space:nowrap">${esc(s.full)}${l}</span>`;
      }
      return '<span style="color:#cbd5e1">—</span>';
    };
    const shiftBg = (cell: CellVal | undefined) => {
      if (!cell) return '#ffffff';
      if (cell.status === 'Férias') return '#d1fae5';
      if (isShift(cell.status)) return SHIFT_BY_KEY[cell.status].hex;
      return '#ffffff';
    };

    const head = ['SEM', 'DATA', 'DIA', ...team.map(m => firstName(m.name, m.initials))]
      .map(h => `<th>${esc(h)}</th>`).join('');
    const bodyRows = days.map(d => {
      const dateCell = `${String(d.day).padStart(2, '0')} ${MONTHS_PT[month]}`;
      const wdStyle = d.weekend ? 'font-weight:700;color:#c2610a' : 'font-weight:600';
      const cov = coverage.perDay[d.key];
      const flag = cov && (!cov.opening || !cov.closing) ? ' style="color:#dc2626;font-weight:700"' : '';
      const cells = team.map(m => {
        const cell = assignments[d.key]?.[m.id];
        return `<td style="background:${shiftBg(cell)}">${cellHtml(cell)}</td>`;
      }).join('');
      return `<tr><td>${d.week}</td><td style="white-space:nowrap"${flag}>${dateCell}</td><td style="${wdStyle}">${d.weekday}</td>${cells}</tr>`;
    }).join('');

    const sumHead = ['RESUMO', 'DIAS', 'FDS', 'FOLGA', 'FÉRIAS', 'LIMP.'].map(h => `<th>${esc(h)}</th>`).join('');
    const sumRows = summary.map(s =>
      `<tr><td style="text-align:left">${esc(s.name || s.initials)}</td><td style="font-weight:700">${s.work}</td><td>${s.fds}</td><td>${s.fol}</td><td>${s.fer}</td><td>${s.lim}</td></tr>`
    ).join('');

    const legendShifts = SHIFTS.map(s =>
      `<span style="display:inline-flex;align-items:center;gap:4px;margin:0 8px 4px 0"><span style="width:10px;height:10px;border-radius:2px;background:${s.hex};border:1px solid #cbd5e1"></span><span style="font-size:9px;color:#374151">${esc(s.full)}</span></span>`
    ).join('');
    const horario = HORARIO_LINES.map(l => `<div${l.startsWith('*') ? ' style="font-style:italic"' : ''}>${esc(l)}</div>`).join('');

    const title = `Escala ${MONTHS_PT_FULL[month]} ${year}`;
    const fileTitle = `Escala_Repsol_${MONTHS_PT[month]}_${year}`;

    const html = `<!doctype html><html lang="pt"><head><meta charset="utf-8" />
<title>${esc(fileTitle)}</title>
<style>
  *{-webkit-print-color-adjust:exact;print-color-adjust:exact;box-sizing:border-box}
  body{font-family:Arial,Helvetica,sans-serif;color:#111827;margin:16px}
  h1{font-size:16px;margin:0 0 2px;color:#c2610a}
  .sub{font-size:11px;color:#6b7280;margin:0 0 12px}
  table{width:100%;border-collapse:collapse;font-size:10px;margin-bottom:14px;table-layout:fixed}
  th{background:#EF7D00;color:#fff;padding:3px 4px;text-align:center;font-weight:700}
  td{border:1px solid #e5e7eb;padding:2px 4px;text-align:center;overflow:hidden}
  td:nth-child(1),td:nth-child(2){color:#6b7280}
  .grid{display:flex;gap:18px;flex-wrap:wrap;align-items:flex-start}
  .grid table{width:auto;min-width:240px;table-layout:auto}
  .box{font-size:10px}
  .box h2{font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#6b7280;margin:0 0 4px}
  @page{size:A4 landscape;margin:8mm}
</style></head><body>
  <h1>ESCALA | Posto Repsol</h1>
  <p class="sub">${esc(title)}</p>
  <table><thead><tr>${head}</tr></thead><tbody>${bodyRows}</tbody></table>
  <div class="grid">
    <table style="width:auto;min-width:240px;table-layout:auto"><thead><tr>${sumHead}</tr></thead><tbody>${sumRows}</tbody></table>
    <div class="box"><h2>Turnos</h2><div>${legendShifts}</div></div>
    <div class="box"><h2>Horário</h2>${horario}</div>
  </div>
  <script>window.onload=function(){window.focus();window.print();};</script>
</body></html>`;

    const w = window.open('', '_blank');
    if (!w) { toast.error('Permite pop-ups para exportar o PDF.'); return; }
    w.document.write(html);
    w.document.close();
  };

  const save = async () => {
    setSaving(true);
    try {
      const blob = new Blob([JSON.stringify(state)], { type: 'application/json' });
      const { error } = await supabase.storage
        .from(ESCALA_BUCKET)
        .upload(ESCALA_REPSOL_PATH, blob, { upsert: true, contentType: 'application/json' });
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
        <Loader2 className="h-8 w-8 animate-spin text-repsol-orange" />
        <p className="text-sm text-muted-foreground">A carregar escala...</p>
      </div>
    );
  }

  const warnings: string[] = [];
  if (coverage.noOpen) warnings.push(`${coverage.noOpen} ${coverage.noOpen === 1 ? 'dia sem abertura (7h)' : 'dias sem abertura (7h)'}`);
  if (coverage.noClose) warnings.push(`${coverage.noClose} ${coverage.noClose === 1 ? 'dia sem fecho (23h)' : 'dias sem fecho (23h)'}`);
  if (coverage.noLimpeza) warnings.push(`${coverage.noLimpeza} ${coverage.noLimpeza === 1 ? 'dia sem limpeza (L)' : 'dias sem limpeza (L)'}`);

  return (
    <div className="flex w-full flex-col gap-4">
      {/* Brand header */}
      <div className="flex items-center justify-between rounded-lg border border-repsol-orange/30 bg-repsol-orange/5 px-3 py-2">
        <RepsolBrand />
        <span className="hidden text-[11px] font-semibold uppercase tracking-wider text-repsol-orange/80 sm:inline">
          Escala do Posto de Combustível
        </span>
      </div>

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
          <Button size="sm" onClick={save} disabled={saving || !dirty}
            className="bg-repsol-orange text-white hover:bg-repsol-orange/90">
            {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
            {dirty ? 'Guardar' : 'Guardado'}
          </Button>
        </div>
      </div>

      {/* Cobertura */}
      {warnings.length > 0 && (
        <div className="rounded-md border border-repsol-red/30 bg-repsol-red/5 px-3 py-2 text-[11px] font-medium text-repsol-red">
          Cobertura por rever: {warnings.join(' · ')}.
        </div>
      )}

      {/* Team editor */}
      {teamOpen && (
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Funcionários</span>
            <Button variant="ghost" size="sm" onClick={addMember}>
              <Plus className="h-4 w-4 mr-1" /> Funcionário
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {team.map((m, i) => (
              <div key={m.id} className="flex items-center gap-1 rounded border border-border bg-background px-1.5 py-1">
                <span className={`h-3 w-3 shrink-0 rounded-sm ${colorOf(i)}`} />
                <Input
                  value={m.name}
                  placeholder="Nome"
                  onChange={e => updateMember(m.id, { name: e.target.value.slice(0, 40) })}
                  className="h-7 w-40 text-xs"
                />
                <Input
                  value={m.initials}
                  onChange={e => updateMember(m.id, { initials: e.target.value.toUpperCase().slice(0, 4) })}
                  className="h-7 w-14 text-center text-xs font-semibold uppercase"
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
            Cada célula define o turno da pessoa nesse dia (ou Folga/Férias). Marca <strong>(L)</strong> no turno responsável pela limpeza — só um por dia.
          </p>
        </div>
      )}

      {/* Schedule grid: linhas = dias, colunas = funcionários */}
      <div className="w-full overflow-x-auto rounded-lg border border-border">
        <table className="w-full table-fixed border-collapse text-xs">
          <colgroup>
            <col className="w-[6%]" />
            <col className="w-[11%]" />
            <col className="w-[8%]" />
            {team.map(m => <col key={m.id} style={{ width: `${75 / Math.max(team.length, 1)}%` }} />)}
          </colgroup>
          <thead>
            <tr className="bg-repsol-orange text-white">
              <th className="px-1 py-1.5 text-left font-semibold">SEM</th>
              <th className="px-1 py-1.5 text-left font-semibold">DATA</th>
              <th className="px-1 py-1.5 text-left font-semibold">DIA</th>
              {team.map((m, i) => (
                <th key={m.id} className="px-1 py-1.5 text-center font-semibold">
                  <span className="flex items-center justify-center gap-1 leading-tight">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${colorOf(i)} ring-1 ring-white/60`} />
                    <span className="truncate" title={m.name || m.initials}>{firstName(m.name, m.initials)}</span>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map(d => {
              const rowBg = d.weekend ? 'bg-orange-100/50 dark:bg-orange-950/20' : 'odd:bg-background even:bg-muted/20';
              const cov = coverage.perDay[d.key];
              const gap = cov && (!cov.opening || !cov.closing);
              return (
                <tr key={d.key} className={rowBg}>
                  <td className="px-1 py-1 text-muted-foreground tabular-nums">{d.week}</td>
                  <td className="px-1 py-1 tabular-nums whitespace-nowrap">
                    {String(d.day).padStart(2, '0')} {MONTHS_PT[month]}
                  </td>
                  <td className="px-1 py-1">
                    <span className="flex items-center gap-1">
                      {gap && (
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full bg-repsol-red"
                          title={[!cov.opening && 'Sem abertura (7h)', !cov.closing && 'Sem fecho (23h)'].filter(Boolean).join(' · ')}
                          aria-hidden
                        />
                      )}
                      <span className={`font-medium ${d.weekend ? 'text-repsol-orange' : ''}`}>{d.weekday}</span>
                    </span>
                  </td>
                  {team.map(m => (
                    <td key={m.id} className="px-0.5 py-0.5">
                      <DayCell
                        value={assignments[d.key]?.[m.id]}
                        onSet={status => setCell(d.key, m.id, status)}
                        onToggleLimpeza={() => toggleLimpeza(d.key, m.id)}
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Summary + legend */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 overflow-x-auto rounded-lg border border-border">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-muted text-muted-foreground">
                <th className="px-2 py-1.5 text-left font-semibold">RESUMO</th>
                <th className="px-2 py-1.5 text-center font-semibold" title="Dias de trabalho">DIAS</th>
                <th className="px-2 py-1.5 text-center font-semibold" title="Fins-de-semana trabalhados">FDS</th>
                <th className="px-2 py-1.5 text-center font-semibold" title="Dias de folga">FOLGA</th>
                <th className="px-2 py-1.5 text-center font-semibold" title="Dias de férias">FÉRIAS</th>
                <th className="px-2 py-1.5 text-center font-semibold" title="Turnos de limpeza atribuídos">LIMP.</th>
              </tr>
            </thead>
            <tbody>
              {summary.map(s => (
                <tr key={s.id} className="odd:bg-background even:bg-muted/20">
                  <td className="px-2 py-1 font-semibold">
                    <span className="flex items-center gap-1.5">
                      <span className={`h-3 w-3 rounded-sm ${s.color}`} />
                      {s.name || s.initials}
                    </span>
                  </td>
                  <td className="px-2 py-1 text-center font-semibold tabular-nums">{s.work}</td>
                  <td className="px-2 py-1 text-center tabular-nums">{s.fds}</td>
                  <td className="px-2 py-1 text-center tabular-nums">{s.fol}</td>
                  <td className="px-2 py-1 text-center tabular-nums">{s.fer}</td>
                  <td className="px-2 py-1 text-center tabular-nums">{s.lim}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-lg border border-border bg-card p-3 space-y-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Turnos</div>
            <div className="flex flex-col gap-1">
              {SHIFTS.map(s => (
                <span key={s.key} className="flex items-center gap-1.5 text-[11px]">
                  <span className={`h-3 w-3 rounded-sm ${s.tint.split(' ')[0]}`} />
                  <span className="text-muted-foreground">{s.full}</span>
                </span>
              ))}
              <span className="mt-0.5 flex items-center gap-1.5 text-[11px]">
                <span className="rounded-sm bg-repsol-orange px-1 text-[9px] font-bold text-white">L</span>
                <span className="text-muted-foreground">turno responsável pela limpeza</span>
              </span>
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
