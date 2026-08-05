import { useEffect, useMemo, useState } from 'react';
import { getISOWeek } from 'date-fns';
import {
  Loader2, Save, Users, Plus, Trash2, ChevronLeft, ChevronRight, RotateCcw, Check, FileDown,
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

// Colunas = tipologias de presença no posto Repsol.
type Typology = 'Turno 1' | 'Turno 2' | 'Folga' | 'Férias';
const TYPOLOGIES: Typology[] = ['Turno 1', 'Turno 2', 'Folga', 'Férias'];

// Tipologias que contam como dia de trabalho (Σ) e para fins-de-semana (FDS).
const WORK_TYPOLOGIES: Typology[] = ['Turno 1', 'Turno 2'];

// Cor própria por pessoa (atribuída por ordem na equipa) — hues bem separadas.
const PERSON_PALETTE = [
  'bg-blue-600 text-white',
  'bg-red-600 text-white',
  'bg-amber-500 text-black',
  'bg-violet-600 text-white',
  'bg-emerald-600 text-white',
  'bg-orange-600 text-white',
  'bg-cyan-600 text-white',
  'bg-fuchsia-600 text-white',
  'bg-lime-600 text-white',
  'bg-pink-600 text-white',
];

// Equivalente em hex para a exportação PDF (mesma ordem da paleta acima).
const PERSON_HEX: Array<{ bg: string; text: string }> = [
  { bg: '#2563eb', text: '#ffffff' },
  { bg: '#dc2626', text: '#ffffff' },
  { bg: '#f59e0b', text: '#000000' },
  { bg: '#7c3aed', text: '#ffffff' },
  { bg: '#059669', text: '#ffffff' },
  { bg: '#ea580c', text: '#ffffff' },
  { bg: '#0891b2', text: '#ffffff' },
  { bg: '#c026d3', text: '#ffffff' },
  { bg: '#65a30d', text: '#ffffff' },
  { bg: '#db2777', text: '#ffffff' },
];

const HORARIO_LINES = [
  'Posto: 7h - 23h (todos os dias)',
  'Turno 1: 7h - 15h',
  'Turno 2: 15h - 23h',
  'Aberto fins-de-semana e feriados*',
  '*Salvo exceções a comunicar',
];

// ---- Types ------------------------------------------------------------------

interface Member {
  id: string;
  name: string;      // nome completo (legenda / editor)
  initials: string;  // sigla mostrada nas células
}

// assignments: { "YYYY-MM-DD": { [Typology]: memberId[] } }
type DayAssign = Partial<Record<Typology, string[]>>;
type Assignments = Record<string, DayAssign>;

interface EscalaState {
  version: 1;
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

// Normaliza o estado persistido (tolerante a formatos parciais).
function normalize(parsed: Record<string, unknown>): EscalaState {
  const base = defaultState();
  const team: Member[] = Array.isArray(parsed.team) && parsed.team.length
    ? (parsed.team as Array<Record<string, unknown>>).map(m => ({
        id: String(m.id ?? newMemberId()),
        name: String(m.name ?? m.initials ?? ''),
        initials: String(m.initials ?? 'XX'),
      }))
    : base.team;

  const rawAssign = (parsed.assignments ?? {}) as Record<string, Record<string, unknown>>;
  const assignments: Assignments = {};
  for (const [day, dayVal] of Object.entries(rawAssign)) {
    if (!dayVal || typeof dayVal !== 'object') continue;
    const dayMap: DayAssign = {};
    for (const [k, v] of Object.entries(dayVal)) {
      if (Array.isArray(v) && TYPOLOGIES.includes(k as Typology)) {
        dayMap[k as Typology] = v as string[];
      }
    }
    assignments[day] = dayMap;
  }

  return {
    version: 1,
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
        <button className="flex min-h-[1.75rem] w-full flex-wrap items-center justify-center gap-0.5 rounded px-1 py-1 outline-none transition-colors hover:ring-1 hover:ring-repsol-orange">
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
      <PopoverContent align="center" className="w-52 p-1">
        <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{typ}</div>
        {eligible.length === 0 && (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">Sem pessoas na equipa</div>
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
                {m.name || m.initials}
              </span>
              {checked && <Check className="h-4 w-4 text-repsol-orange" />}
            </button>
          );
        })}
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

  // Load persisted schedule
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

  const colorMap = useMemo(() => {
    const map: Record<string, string> = {};
    team.forEach((m, i) => { map[m.id] = PERSON_PALETTE[i % PERSON_PALETTE.length]; });
    return map;
  }, [team]);
  const colorOf = (id: string) => colorMap[id] ?? 'bg-muted text-foreground';

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
      let t1 = 0, t2 = 0, fol = 0, fer = 0, fds = 0;
      for (const d of days) {
        const dayMap = assignments[d.key];
        if (!dayMap) continue;
        let typ: Typology | null = null;
        for (const t of TYPOLOGIES) {
          if (dayMap[t]?.includes(m.id)) { typ = t; break; }
        }
        if (!typ) continue;
        if (typ === 'Turno 1') t1++;
        else if (typ === 'Turno 2') t2++;
        else if (typ === 'Folga') fol++;
        else if (typ === 'Férias') fer++;
        if (d.weekend && WORK_TYPOLOGIES.includes(typ)) fds++;
      }
      return { id: m.id, initials: m.initials, t1, t2, total: t1 + t2, fds, fol, fer };
    });
  }, [team, days, assignments]);

  // Cobertura por dia: dias sem qualquer turno atribuído (posto está sempre aberto).
  const uncovered = useMemo(() => {
    let count = 0;
    for (const d of days) {
      const dayMap = assignments[d.key];
      const hasCover = !!dayMap && WORK_TYPOLOGIES.some(t => (dayMap[t]?.length ?? 0) > 0);
      if (!hasCover) count++;
    }
    return count;
  }, [days, assignments]);

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

  const addMember = () => {
    setState(prev => ({
      ...prev,
      team: [...prev.team, { id: newMemberId(), name: '', initials: 'XX' }],
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
      const bg = d.weekend ? '#fff3e6' : '#ffffff';
      const dateCell = `${String(d.day).padStart(2, '0')} ${MONTHS_PT[month]}`;
      const wdStyle = d.weekend ? 'font-weight:700;color:#c2610a' : 'font-weight:600';
      const dayMap = assignments[d.key] ?? {};
      const cells = TYPOLOGIES.map(t => {
        const ids = dayMap[t] ?? [];
        return `<td>${ids.length ? ids.map(chip).join('') : '<span style="color:#cbd5e1">—</span>'}</td>`;
      }).join('');
      return `<tr style="background:${bg}"><td>${d.week}</td><td style="white-space:nowrap">${dateCell}</td><td style="${wdStyle}">${d.weekday}</td>${cells}</tr>`;
    }).join('');

    const sumHead = ['RESUMO', 'T1', 'T2', 'Σ', 'FDS', 'FOL', 'FÉR'].map(h => `<th>${esc(h)}</th>`).join('');
    const sumRows = summary.map(s =>
      `<tr><td style="text-align:left">${chip(s.id)}</td><td>${s.t1}</td><td>${s.t2}</td><td style="font-weight:700">${s.total}</td><td>${s.fds}</td><td>${s.fol}</td><td>${s.fer}</td></tr>`
    ).join('');

    const legend = team.map(m =>
      `<span style="display:inline-flex;align-items:center;gap:4px;margin:0 8px 4px 0">${chip(m.id)}<span style="font-size:9px;color:#374151">${esc(m.name || m.initials)}</span></span>`
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
  table{width:100%;border-collapse:collapse;font-size:10px;margin-bottom:14px}
  th{background:#EF7D00;color:#fff;padding:3px 4px;text-align:center;font-weight:700}
  td{border:1px solid #e5e7eb;padding:2px 4px;text-align:center}
  td:nth-child(1),td:nth-child(2){color:#6b7280}
  td:nth-child(3){text-align:left}
  .grid{display:flex;gap:18px;flex-wrap:wrap;align-items:flex-start}
  .grid table{width:auto;min-width:260px}
  .box{font-size:10px}
  .box h2{font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#6b7280;margin:0 0 4px}
  @page{size:A4 portrait;margin:10mm}
</style></head><body>
  <h1>ESCALA | Posto Repsol</h1>
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

  return (
    <div className="flex flex-col gap-4">
      {/* Brand header */}
      <div className="flex items-center justify-between rounded-lg border border-repsol-orange/30 bg-repsol-orange/5 px-3 py-2">
        <RepsolBrand />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-repsol-orange/80">
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
      {uncovered > 0 && (
        <div className="rounded-md border border-repsol-red/30 bg-repsol-red/5 px-3 py-2 text-[11px] font-medium text-repsol-red">
          {uncovered === 1
            ? '1 dia do mês sem qualquer turno atribuído — o posto tem de ter cobertura todos os dias.'
            : `${uncovered} dias do mês sem qualquer turno atribuído — o posto tem de ter cobertura todos os dias.`}
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
            {team.map(m => (
              <div key={m.id} className="flex items-center gap-1 rounded border border-border bg-background px-1.5 py-1">
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
            Cada funcionário pode ser colocado num só estado por dia: <strong>Turno 1</strong>, <strong>Turno 2</strong>, <strong>Folga</strong> ou <strong>Férias</strong>.
          </p>
        </div>
      )}

      {/* Schedule grid: linhas = dias, colunas = tipologias */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-repsol-orange text-white">
              <th className="sticky left-0 z-10 bg-repsol-orange px-2 py-1.5 text-left font-semibold">SEM</th>
              <th className="px-2 py-1.5 text-left font-semibold">DATA</th>
              <th className="px-2 py-1.5 text-left font-semibold">DIA</th>
              {TYPOLOGIES.map(t => (
                <th key={t} className="px-1 py-1.5 text-center font-semibold min-w-[4.5rem]">{t}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map(d => {
              const rowBg = d.weekend
                ? 'bg-orange-100/60 dark:bg-orange-950/30'
                : 'odd:bg-background even:bg-muted/20';
              const dayMap = assignments[d.key] ?? {};
              const hasCover = WORK_TYPOLOGIES.some(t => (dayMap[t]?.length ?? 0) > 0);
              return (
                <tr key={d.key} className={rowBg}>
                  <td className="sticky left-0 z-10 bg-inherit px-2 py-1 text-muted-foreground tabular-nums">{d.week}</td>
                  <td className="px-2 py-1 tabular-nums whitespace-nowrap">
                    {String(d.day).padStart(2, '0')} {MONTHS_PT[month]}
                  </td>
                  <td className="px-2 py-1">
                    <div className="flex items-center gap-1.5">
                      {!hasCover && (
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full bg-repsol-red"
                          title="Dia sem turno atribuído"
                          aria-hidden
                        />
                      )}
                      <span className={`font-medium ${d.weekend ? 'text-repsol-orange' : ''}`}>{d.weekday}</span>
                    </div>
                  </td>
                  {TYPOLOGIES.map(t => (
                    <td key={t} className="px-0.5 py-0.5">
                      <AssignCell
                        typ={t}
                        eligible={team}
                        selectedIds={dayMap[t] ?? []}
                        colorOf={colorOf}
                        onToggle={mid => toggleAssign(d.key, t, mid)}
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
        {/* Summary table */}
        <div className="lg:col-span-2 overflow-x-auto rounded-lg border border-border">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-muted text-muted-foreground">
                <th className="px-2 py-1.5 text-left font-semibold">RESUMO</th>
                <th className="px-2 py-1.5 text-center font-semibold" title="Dias no Turno 1">T1</th>
                <th className="px-2 py-1.5 text-center font-semibold" title="Dias no Turno 2">T2</th>
                <th className="px-2 py-1.5 text-center font-semibold" title="Total de dias de trabalho">Σ</th>
                <th className="px-2 py-1.5 text-center font-semibold" title="Fins-de-semana trabalhados">FDS</th>
                <th className="px-2 py-1.5 text-center font-semibold" title="Dias de folga">FOL</th>
                <th className="px-2 py-1.5 text-center font-semibold" title="Dias de férias">FÉR</th>
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
                  <td className="px-2 py-1 text-center tabular-nums">{s.t1}</td>
                  <td className="px-2 py-1 text-center tabular-nums">{s.t2}</td>
                  <td className="px-2 py-1 text-center font-semibold tabular-nums">{s.total}</td>
                  <td className="px-2 py-1 text-center tabular-nums">{s.fds}</td>
                  <td className="px-2 py-1 text-center tabular-nums">{s.fol}</td>
                  <td className="px-2 py-1 text-center tabular-nums">{s.fer}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Legend / Horário */}
        <div className="rounded-lg border border-border bg-card p-3 space-y-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Equipa</div>
            <div className="flex flex-col gap-1">
              {team.map(m => (
                <span key={m.id} className="flex items-center gap-1.5 text-[11px]">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${colorOf(m.id)}`}>{m.initials}</span>
                  <span className="text-muted-foreground">{m.name || m.initials}</span>
                </span>
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
