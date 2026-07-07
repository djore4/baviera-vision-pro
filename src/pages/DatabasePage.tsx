import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Trash2, X, Check, SlidersHorizontal, ChevronDown, ChevronUp, Filter, Database, Search } from 'lucide-react';
import { useData } from '@/contexts/DataContext';
import { replaceControlRecords } from '@/lib/control-records';

interface ControlRecord {
  id: string;
  status: string; neg: string | null; mes1: string; resp: string; id_cliente: string;
  local: string; type: string; origin: string; profile: string; biz: string;
  enc: string; chas: string; mat: string; model: string; version: string; gar: string;
  qor: number; xev: number; bev: number; m: number; mpa: number; gkl: number;
  csc: number; cme: number | null;
  fin: string; week198: string; dmat: string | null; date298: string | null; app: string | null; obs: string;
}

type RecordForm = Omit<ControlRecord, 'id'>;

const EMPTY: RecordForm = {
  status: '', neg: '', mes1: '', resp: '', id_cliente: '', local: '',
  type: '', origin: '', profile: '', biz: '', enc: '', chas: '', mat: '',
  model: '', version: '', gar: '', qor: 0, xev: 0, bev: 0, m: 0, mpa: 0, gkl: 0,
  csc: 0, cme: null, fin: '', week198: '', dmat: '', date298: '', app: '', obs: '',
};

const STATUS_OPTS = ['Frio','Morno','Quente','Carteira','Matricula','Retail','Adiado','Perdido'];
const TYPE_OPTS   = ['VN','VD','VP'];
const PROFILE_OPTS = ['Part','ENI','PE','BUS','FLE','CA','RAC','INT'];
const GAR_OPTS    = ['GAR','nGAR'];
const FIN_OPTS    = ['PP','FS','Fint','Fext'];
const CLASS_FLAGS  = ['qor','xev','bev','m','mpa','gkl'] as const;
const CLASS_LABELS: Record<string, string> = { qor:'QoR', xev:'xEV', bev:'BEV', m:'M', mpa:'MPA', gkl:'GKL' };
const MONTHS_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

interface ColDef { key: keyof ControlRecord; label: string; type?: 'date' | 'number'; group?: string }

const ALL_COLS: ColDef[] = [
  { key: 'status',     label: 'STATUS',  group: 'Geral' },
  { key: 'neg',        label: 'NEG',     type: 'date', group: 'Geral' },
  { key: 'mes1',       label: 'MÊS',     group: 'Geral' },
  { key: 'resp',       label: 'RESP',    group: 'Geral' },
  { key: 'id_cliente', label: 'ID',      group: 'Geral' },
  { key: 'type',       label: 'TYPE',    group: 'Veículo' },
  { key: 'profile',    label: 'PROFILE', group: 'Veículo' },
  { key: 'model',      label: 'MODEL',   group: 'Veículo' },
  { key: 'version',    label: 'VERSION', group: 'Veículo' },
  { key: 'gar',        label: 'GAR',     group: 'Veículo' },
  { key: 'mat',        label: 'MAT',     group: 'Veículo' },
  { key: 'fin',        label: 'FIN',     group: 'Financeiro' },
  { key: 'qor',        label: 'QoR',     type: 'number', group: 'Classificação' },
  { key: 'xev',        label: 'xEV',     type: 'number', group: 'Classificação' },
  { key: 'bev',        label: 'BEV',     type: 'number', group: 'Classificação' },
  { key: 'm',          label: 'M',       type: 'number', group: 'Classificação' },
  { key: 'mpa',        label: 'MPA',     type: 'number', group: 'Classificação' },
  { key: 'gkl',        label: 'GKL',     type: 'number', group: 'Classificação' },
  { key: 'dmat',       label: 'DMAT',    type: 'date', group: 'Datas' },
  { key: 'date298',    label: '298',     type: 'date', group: 'Datas' },
  { key: 'app',        label: 'APP',     type: 'date', group: 'Datas' },
  { key: 'obs',        label: 'OBS',     group: 'Obs.' },
  // hidden by default but available
  { key: 'local',    label: 'LOCAL',   group: 'Geral' },
  { key: 'origin',   label: 'ORIGIN',  group: 'Veículo' },
  { key: 'biz',      label: 'BIZ',     group: 'Veículo' },
  { key: 'enc',      label: 'ENC',     group: 'Veículo' },
  { key: 'chas',     label: 'CHAS',    group: 'Veículo' },
  { key: 'csc',      label: 'CSC',     type: 'number', group: 'Financeiro' },
  { key: 'cme',      label: 'CME',     type: 'number', group: 'Financeiro' },
  { key: 'week198',  label: '198',     group: 'Datas' },
];

const DEFAULT_HIDDEN = new Set(['local','origin','biz','enc','chas','csc','cme','week198','version']);

/* ── Filtros (valores distintos por campo, seleção de 1 ou vários) ── */
interface SlicerDef { key: keyof ControlRecord; label: string; fmt?: (v: string) => string }
const VALUE_FILTERS: SlicerDef[] = [
  { key: 'status',   label: 'STATUS' },
  { key: 'mes1',     label: 'MÊS',   fmt: v => v || '(sem data)' },
  { key: 'resp',     label: 'RESP' },
  { key: 'type',     label: 'TYPE' },
  { key: 'model',    label: 'MODEL' },
  { key: 'gar',      label: 'GAR' },
  { key: 'week198',  label: '198',  fmt: v => v || '(vazio)' },
];

/* ── Filtro agregado "Segment": flags de classificação (0/1) num só filtro ── */
const SEGMENT_OPTIONS: { key: 'bev' | 'xev' | 'm' | 'qor' | 'mpa' | 'gkl'; label: string }[] = [
  { key: 'bev', label: 'BEV' },
  { key: 'xev', label: 'PHEV' },
  { key: 'm',   label: 'M' },
  { key: 'qor', label: 'QoR' },
  { key: 'mpa', label: 'MPA' },
  { key: 'gkl', label: 'GKL' },
];
const SEGMENT_LABELS: Record<string, string> = Object.fromEntries(SEGMENT_OPTIONS.map(o => [o.key, o.label]));

function fmtDate(v: unknown) {
  if (!v) return '—';
  try { return new Date(v as string).toLocaleDateString('pt-PT'); } catch { return String(v); }
}
function fmtVal(col: ColDef, v: unknown) {
  if (v === null || v === undefined || v === '') return '—';
  if (col.type === 'date') return fmtDate(v);
  if (col.group === 'Classificação') return Number(v) === 1 ? '✓' : '—';
  return String(v);
}

/* ── Month picker component ──
   Mês e ano são independentemente opcionais. Formatos guardados em mes1:
   "" (vazio) · "AAAA" (só ano) · "MM" (só mês) · "AAAA/MM" (ambos). */
function MonthPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const now = new Date();
  const years = Array.from({ length: 6 }, (_, i) => now.getFullYear() - 1 + i);

  // Descodifica o valor guardado em mês/ano.
  let curYear = '', curMonth = '';
  if (value) {
    if (value.includes('/')) { const [y, m] = value.split('/'); curYear = y; curMonth = m; }
    else if (value.length === 4) { curYear = value; }
    else { curMonth = value.padStart(2, '0'); }
  }

  function emit(m: string, y: string) {
    if (y && m) onChange(`${y}/${m}`);
    else if (y) onChange(y);
    else if (m) onChange(m);
    else onChange('');
  }

  return (
    <div className="flex gap-2">
      <select
        value={curMonth}
        onChange={e => emit(e.target.value, curYear)}
        className="flex-1 min-w-0 px-2.5 py-1.5 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
      >
        <option value="">— sem mês —</option>
        {MONTHS_PT.map((m, i) => <option key={i + 1} value={String(i + 1).padStart(2, '0')}>{m}</option>)}
      </select>
      <select
        value={curYear}
        onChange={e => emit(curMonth, e.target.value)}
        className="w-28 px-2.5 py-1.5 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
      >
        <option value="">— sem ano —</option>
        {years.map(y => <option key={y} value={String(y)}>{y}</option>)}
      </select>
    </div>
  );
}

/* ── Filtro compacto (chip com popover de checkboxes) ── */
function FilterChip({ label, values, active, fmt, onChange, initialOpen }: {
  label: string; values: string[]; active: Set<string>;
  fmt?: (v: string) => string; onChange: (v: Set<string>) => void; initialOpen?: boolean;
}) {
  const [open, setOpen] = useState(!!initialOpen);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setQuery(''); } }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const toggle = (v: string) => { const n = new Set(active); n.has(v) ? n.delete(v) : n.add(v); onChange(n); };
  const disp = (v: string) => (fmt ? fmt(v) : (v || '(vazio)'));
  const isActive = active.size > 0;
  const summary = active.size === 1 ? disp([...active][0]) : `${active.size}`;
  const shown = query ? values.filter(v => disp(v).toLowerCase().includes(query.toLowerCase())) : values;

  return (
    <div ref={ref} className="relative">
      <div
        className={`flex items-center rounded-full border transition-colors ${
          isActive
            ? 'bg-amber-500/15 border-amber-500/50 text-amber-600 dark:text-amber-400 font-medium'
            : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
        }`}
      >
        <button
          onClick={() => setOpen(o => !o)}
          className={`flex items-center gap-1 py-1 text-xs ${isActive ? 'pl-2.5 pr-1' : 'pl-2.5 pr-2'}`}
        >
          <span>{label}</span>
          {isActive && <span className="max-w-[110px] truncate opacity-90">· {summary}</span>}
          {!isActive && <ChevronDown className="h-3 w-3 opacity-60" />}
        </button>
        {isActive && (
          <button
            onClick={() => onChange(new Set())}
            title="Limpar"
            className="pr-2 pl-0.5 py-1 rounded-r-full hover:text-amber-500"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 bg-popover border border-border rounded-lg shadow-xl p-2 w-56 max-h-[320px] flex flex-col">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</span>
            {isActive && <button onClick={() => onChange(new Set())} className="text-[10px] text-amber-500 hover:underline">limpar</button>}
          </div>
          {values.length > 8 && (
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Procurar..."
              className="mb-1.5 px-2 py-1 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
            />
          )}
          <div className="overflow-y-auto -mr-1 pr-1">
            {shown.length === 0 && <p className="text-[11px] text-muted-foreground px-1 py-1">sem valores</p>}
            {shown.map(v => {
              const on = active.has(v);
              return (
                <button
                  key={v}
                  onClick={() => toggle(v)}
                  className={`w-full flex items-center gap-2 text-left px-1.5 py-1 text-xs rounded transition-colors ${on ? 'text-amber-600 dark:text-amber-400 font-medium' : 'hover:bg-muted text-foreground/80'}`}
                >
                  <span className={`h-3.5 w-3.5 rounded-[4px] border flex items-center justify-center shrink-0 ${on ? 'bg-amber-500 border-amber-500' : 'border-border'}`}>
                    {on && <Check className="h-2.5 w-2.5 text-black" />}
                  </span>
                  <span className="truncate">{disp(v)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Persistência da vista (filtros, ordenação, colunas) ── */
const VIEW_KEY = 'db_view_state_v1';
interface ViewState {
  colFilters?: Record<string, string[]>;
  segment?: string[];
  hiddenCols?: string[];
  sort?: { key: string; dir: 'asc' | 'desc' } | null;
}
function loadViewState(): ViewState | null {
  try { const raw = localStorage.getItem(VIEW_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}

/* ── Main page ── */
export default function DatabasePage() {
  const [records, setRecords] = useState<ControlRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<RecordForm>(EMPTY);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const persisted = useMemo(loadViewState, []);
  const [search, setSearch] = useState('');
  const [colFilters, setColFilters] = useState<Record<string, Set<string>>>(() => {
    const cf = persisted?.colFilters;
    if (!cf) return {};
    const valid = new Set(VALUE_FILTERS.map(f => f.key as string));
    const out: Record<string, Set<string>> = {};
    Object.entries(cf).forEach(([k, arr]) => { if (arr?.length && valid.has(k)) out[k] = new Set(arr); });
    return out;
  });
  const [segmentFilter, setSegmentFilter] = useState<Set<string>>(() => new Set(persisted?.segment ?? []));
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(persisted?.sort ?? null);
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(() =>
    persisted?.hiddenCols ? new Set(persisted.hiddenCols) : DEFAULT_HIDDEN);
  const [showColPanel, setShowColPanel] = useState(false);
  const colPanelRef = useRef<HTMLDivElement>(null);

  // Persiste a configuração da vista (não inclui a pesquisa por texto).
  useEffect(() => {
    const state: ViewState = {
      colFilters: Object.fromEntries(Object.entries(colFilters).map(([k, s]) => [k, [...s]])),
      segment: [...segmentFilter],
      hiddenCols: [...hiddenCols],
      sort,
    };
    try { localStorage.setItem(VIEW_KEY, JSON.stringify(state)); } catch { /* ignore */ }
  }, [colFilters, segmentFilter, hiddenCols, sort]);

  useEffect(() => {
    function h(e: MouseEvent) { if (colPanelRef.current && !colPanelRef.current.contains(e.target as Node)) setShowColPanel(false); }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('control_records').select('*').order('neg', { ascending: false });
    setRecords((data as ControlRecord[]) ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  // Dados do Excel já carregados pelo DataContext (fallback enquanto a tabela
  // está vazia) — permitem importar para a base de dados com um clique.
  const { data: excelData } = useData();
  const backupRecords = excelData?.control ?? [];
  const [importingBackup, setImportingBackup] = useState(false);
  const [importBackupError, setImportBackupError] = useState<string | null>(null);

  async function importFromBackup() {
    if (backupRecords.length === 0) return;
    setImportingBackup(true);
    setImportBackupError(null);
    try {
      await replaceControlRecords(backupRecords);
      await load();
    } catch (e) {
      setImportBackupError(e instanceof Error ? e.message : 'Erro ao importar dados do Excel');
    } finally {
      setImportingBackup(false);
    }
  }

  const visibleCols = ALL_COLS.filter(c => !hiddenCols.has(c.key));

  const colUniqueValues = useMemo(() => {
    const map: Record<string, string[]> = {};
    ALL_COLS.forEach(col => {
      const vals = [...new Set(records.map(r => {
        const v = r[col.key];
        return (v === null || v === undefined || v === '') ? '' : String(v);
      }))].sort();
      map[col.key] = vals;
    });
    return map;
  }, [records]);

  const filtered = useMemo(() => {
    let out = records.filter(r =>
      Object.entries(colFilters).every(([key, vals]) => {
        if (vals.size === 0) return true;
        const v = r[key as keyof ControlRecord];
        return vals.has((v === null || v === undefined || v === '') ? '' : String(v));
      })
    );

    // Segment: registo passa se tiver QUALQUER um dos segmentos selecionados (flag = 1).
    if (segmentFilter.size > 0) {
      out = out.filter(r => [...segmentFilter].some(k => Number(r[k as keyof ControlRecord]) === 1));
    }

    const q = search.trim().toLowerCase();
    if (q) {
      out = out.filter(r =>
        [r.id_cliente, r.chas, r.mat, r.model, r.enc, r.resp, r.version]
          .some(f => f && String(f).toLowerCase().includes(q))
      );
    }

    if (sort) {
      const col = ALL_COLS.find(c => c.key === sort.key);
      const dir = sort.dir === 'asc' ? 1 : -1;
      out = [...out].sort((a, b) => {
        const av = a[sort.key as keyof ControlRecord];
        const bv = b[sort.key as keyof ControlRecord];
        let cmp: number;
        if (col?.type === 'date') {
          cmp = (av ? new Date(av as string).getTime() : 0) - (bv ? new Date(bv as string).getTime() : 0);
        } else if (col?.type === 'number') {
          cmp = (Number(av) || 0) - (Number(bv) || 0);
        } else {
          cmp = String(av ?? '').localeCompare(String(bv ?? ''), 'pt');
        }
        return cmp * dir;
      });
    }
    return out;
  }, [records, colFilters, segmentFilter, search, sort]);

  const activeFilterCount = Object.values(colFilters).filter(s => s.size > 0).length + (segmentFilter.size > 0 ? 1 : 0);

  const setColFilter = (key: string, vals: Set<string>) =>
    setColFilters(f => {
      if (vals.size === 0) { const n = { ...f }; delete n[key]; return n; }
      return { ...f, [key]: vals };
    });

  function clearAllFilters() {
    setColFilters({});
    setSegmentFilter(new Set());
  }
  function toggleSort(key: string) {
    setSort(s => (!s || s.key !== key) ? { key, dir: 'asc' } : s.dir === 'asc' ? { key, dir: 'desc' } : null);
  }

  function openNew() { setForm(EMPTY); setEditId(null); setShowForm(true); }
  function openEdit(r: ControlRecord) { const { id, ...rest } = r; setForm(rest); setEditId(id); setShowForm(true); }

  async function save() {
    setSaving(true);
    const payload = {
      ...form,
      qor: form.qor ? 1 : 0, xev: form.xev ? 1 : 0, bev: form.bev ? 1 : 0,
      m: form.m ? 1 : 0, mpa: form.mpa ? 1 : 0, gkl: form.gkl ? 1 : 0,
      csc: Number(form.csc) || 0,
      cme: form.cme !== null && String(form.cme) !== '' ? Number(form.cme) : null,
      neg: form.neg || null, dmat: form.dmat || null, date298: form.date298 || null, app: form.app || null,
    };
    if (editId) { await supabase.from('control_records').update(payload).eq('id', editId); }
    else { await supabase.from('control_records').insert(payload); }
    setSaving(false); setShowForm(false); load();
  }

  async function remove(id: string) {
    await supabase.from('control_records').delete().eq('id', id);
    setDeleteId(null); load();
  }

  const setField = <K extends keyof RecordForm>(key: K, val: RecordForm[K]) =>
    setForm(f => ({ ...f, [key]: val }));

  function SelectField({ k, label, opts }: { k: keyof RecordForm; label: string; opts: string[] }) {
    return (
      <div>
        <label className="block text-[10px] font-medium text-muted-foreground mb-1">{label}</label>
        <select
          value={String(form[k] ?? '')}
          onChange={e => setField(k, e.target.value as RecordForm[typeof k])}
          className="w-full px-2.5 py-1.5 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">— seleccionar —</option>
          {opts.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
    );
  }

  function TextField({ k, label, type = 'text' }: { k: keyof RecordForm; label: string; type?: string }) {
    return (
      <div>
        <label className="block text-[10px] font-medium text-muted-foreground mb-1">{label}</label>
        <input
          type={type}
          value={String(form[k] ?? '')}
          onChange={e => setField(k, e.target.value as RecordForm[typeof k])}
          className="w-full px-2.5 py-1.5 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Importar dados do Excel para a base de dados (quando a tabela está vazia) */}
      {!loading && records.length === 0 && backupRecords.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-lg border border-amber-500/40 bg-amber-500/10">
          <Database className="h-5 w-5 text-amber-500 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">Há {backupRecords.length} registos do Excel por importar</p>
            <p className="text-xs text-muted-foreground">
              A base de dados está vazia. Importa os dados do Excel para os consultar e editar aqui.
            </p>
            {importBackupError && <p className="text-xs text-destructive mt-1">{importBackupError}</p>}
          </div>
          <button
            onClick={importFromBackup}
            disabled={importingBackup}
            className="px-3 py-1.5 text-xs bg-amber-500 text-black font-semibold rounded hover:bg-amber-400 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            {importingBackup ? 'A importar...' : `Importar ${backupRecords.length} registos`}
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex-1 space-y-2 min-w-0">
          {/* Pesquisa */}
          <div className="relative max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Pesquisar cliente, chassis, matrícula, modelo..."
              className="w-full pl-8 pr-8 py-1.5 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Barra de filtros: todos visíveis, cada um multi-seleção */}
          <div className="flex flex-wrap items-center gap-1.5">
            <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            {VALUE_FILTERS.map(s => (
              <FilterChip
                key={s.key}
                label={s.label}
                values={colUniqueValues[s.key] ?? []}
                active={colFilters[s.key] ?? new Set()}
                fmt={s.fmt}
                onChange={vals => setColFilter(s.key, vals)}
              />
            ))}
            <FilterChip
              label="SEGMENT"
              values={SEGMENT_OPTIONS.map(o => o.key)}
              active={segmentFilter}
              fmt={k => SEGMENT_LABELS[k] ?? k}
              onChange={setSegmentFilter}
            />
            {activeFilterCount > 0 && (
              <button onClick={clearAllFilters} className="text-[11px] text-muted-foreground hover:text-destructive ml-0.5">
                limpar tudo
              </button>
            )}
          </div>
        </div>

        {/* Ações */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-muted-foreground">{filtered.length} registos</span>

          {/* Visibilidade de colunas */}
          <div ref={colPanelRef} className="relative">
            <button onClick={() => setShowColPanel(o => !o)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded hover:bg-muted transition-colors">
              <SlidersHorizontal className="h-3.5 w-3.5" />Colunas<ChevronDown className="h-3 w-3 text-muted-foreground" />
            </button>
            {showColPanel && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-popover border border-border rounded-lg shadow-xl p-3 w-72 max-h-[420px] overflow-y-auto">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Mostrar / ocultar colunas</p>
                {['Geral','Veículo','Financeiro','Classificação','Datas','Obs.'].map(grp => (
                  <div key={grp} className="mb-3">
                    <p className="text-[10px] text-muted-foreground uppercase mb-1">{grp}</p>
                    <div className="flex flex-wrap gap-1">
                      {ALL_COLS.filter(c => c.group === grp).map(col => {
                        const hidden = hiddenCols.has(col.key);
                        return (
                          <button key={col.key} onClick={() => setHiddenCols(s => { const n = new Set(s); n.has(col.key) ? n.delete(col.key) : n.add(col.key); return n; })}
                            className={`px-2 py-0.5 text-[10px] rounded font-medium transition-colors ${hidden ? 'bg-muted text-muted-foreground' : 'bg-amber-500/20 text-amber-600 dark:text-amber-400'}`}>
                            {col.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button onClick={openNew} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-amber-500 text-black font-semibold rounded hover:bg-amber-400 transition-colors">
            <Plus className="h-3.5 w-3.5" /> Novo registo
          </button>
        </div>
      </div>

      {/* ── Form modal ── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border sticky top-0 bg-card z-10">
              <h2 className="text-sm font-semibold">{editId ? 'Editar Registo' : 'Novo Registo'}</h2>
              <button onClick={() => setShowForm(false)}><X className="h-4 w-4 text-muted-foreground" /></button>
            </div>
            <div className="p-5 space-y-6">

              {/* Geral */}
              <div>
                <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Geral</h3>
                <div className="grid grid-cols-2 gap-3">
                  <SelectField k="status" label="STATUS" opts={STATUS_OPTS} />
                  <TextField k="neg" label="NEG — Data de negócio" type="date" />
                  <TextField k="resp" label="RESP — Vendedor" />
                  <TextField k="id_cliente" label="ID — Cliente" />
                  <div className="col-span-2">
                    <label className="block text-[10px] font-medium text-muted-foreground mb-1">MÊS — Entrega (opcional)</label>
                    <MonthPicker value={form.mes1} onChange={v => setField('mes1', v)} />
                    <p className="text-[10px] text-muted-foreground mt-1">Podes deixar mês e/ou ano por preencher se ainda não há previsão de entrega.</p>
                  </div>
                </div>
              </div>

              {/* Veículo */}
              <div>
                <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Veículo</h3>
                <div className="grid grid-cols-2 gap-3">
                  <SelectField k="type" label="TYPE" opts={TYPE_OPTS} />
                  <SelectField k="profile" label="PROFILE" opts={PROFILE_OPTS} />
                  <TextField k="model" label="MODEL" />
                  <TextField k="version" label="VERSION" />
                  <SelectField k="gar" label="GAR — Garantia de entrega" opts={GAR_OPTS} />
                  <TextField k="mat" label="MAT — Matrícula" />
                </div>
              </div>

              {/* Financeiro */}
              <div>
                <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Pagamento</h3>
                <div className="grid grid-cols-2 gap-3">
                  <SelectField k="fin" label="FIN — Forma de pagamento" opts={FIN_OPTS} />
                </div>
              </div>

              {/* Classificação */}
              <div>
                <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Classificação</h3>
                <div className="flex flex-wrap gap-2">
                  {CLASS_FLAGS.map(flag => {
                    const active = !!form[flag];
                    return (
                      <button
                        key={flag}
                        type="button"
                        onClick={() => setField(flag, active ? 0 : 1)}
                        className={`px-3 py-1.5 text-xs rounded-full font-semibold border transition-colors ${
                          active
                            ? 'bg-amber-500 text-black border-amber-500'
                            : 'bg-background text-muted-foreground border-border hover:border-amber-400 hover:text-amber-400'
                        }`}
                      >
                        {CLASS_LABELS[flag]}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-muted-foreground mt-1.5">Podes seleccionar várias em simultâneo</p>
              </div>

              {/* Datas */}
              <div>
                <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Datas</h3>
                <div className="grid grid-cols-2 gap-3">
                  <TextField k="week198" label="198 — Semana prevista" />
                  <TextField k="dmat" label="DMAT — Data da matrícula" type="date" />
                  <TextField k="date298" label="298 — Retail / Entrega cliente" type="date" />
                  <TextField k="app" label="APP — Data do Apping" type="date" />
                </div>
              </div>

              {/* Observações */}
              <div>
                <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Observações</h3>
                <textarea
                  value={form.obs ?? ''}
                  onChange={e => setField('obs', e.target.value)}
                  rows={3}
                  className="w-full px-2.5 py-1.5 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                  placeholder="Notas adicionais..."
                />
              </div>

            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t border-border sticky bottom-0 bg-card">
              <button onClick={() => setShowForm(false)} className="px-3 py-1.5 text-xs border border-border rounded hover:bg-muted transition-colors">Cancelar</button>
              <button onClick={save} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-amber-500 text-black font-semibold rounded hover:bg-amber-400 disabled:opacity-50 transition-colors">
                <Check className="h-3.5 w-3.5" />{saving ? 'A guardar...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-card border border-border rounded-xl shadow-xl p-6 w-full max-w-sm text-center space-y-4">
            <p className="text-sm font-medium">Eliminar este registo?</p>
            <div className="flex justify-center gap-2">
              <button onClick={() => setDeleteId(null)} className="px-4 py-1.5 text-xs border border-border rounded hover:bg-muted">Cancelar</button>
              <button onClick={() => remove(deleteId)} className="px-4 py-1.5 text-xs bg-destructive text-white rounded hover:bg-destructive/90">Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="py-16 text-center text-sm text-muted-foreground">A carregar...</div>
      ) : (
        <div className="overflow-auto rounded-lg border border-border">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/50">
                {visibleCols.map(col => {
                  const sorted = sort?.key === col.key;
                  return (
                    <th
                      key={col.key}
                      onClick={() => toggleSort(col.key)}
                      title="Ordenar"
                      className="px-2 py-2 text-left border-b border-border whitespace-nowrap cursor-pointer select-none group"
                    >
                      <span className={`inline-flex items-center gap-1 font-semibold ${sorted ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground group-hover:text-foreground'}`}>
                        {col.label}
                        {sorted
                          ? (sort!.dir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)
                          : <ChevronDown className="h-3 w-3 opacity-0 group-hover:opacity-40" />}
                      </span>
                    </th>
                  );
                })}
                <th className="px-2 py-2 border-b border-border w-12" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr
                  key={r.id}
                  onClick={() => openEdit(r)}
                  title="Clicar para editar"
                  className="border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer"
                >
                  {visibleCols.map(col => (
                    <td key={col.key} className="px-2 py-1.5 whitespace-nowrap text-foreground/80">
                      {col.key === 'status' ? (
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          r.status === 'Retail' || r.status === 'Matricula' ? 'bg-green-500/20 text-green-600 dark:text-green-400' :
                          r.status === 'Perdido' || r.status === 'Adiado' ? 'bg-red-500/20 text-red-600 dark:text-red-400' :
                          r.status === 'Carteira' ? 'bg-blue-500/20 text-blue-600 dark:text-blue-400' :
                          r.status === 'Quente' ? 'bg-orange-500/20 text-orange-600 dark:text-orange-400' :
                          'bg-muted text-muted-foreground'
                        }`}>{r.status || '—'}</span>
                      ) : fmtVal(col, r[col.key])}
                    </td>
                  ))}
                  <td className="px-2 py-1.5">
                    <button
                      onClick={e => { e.stopPropagation(); setDeleteId(r.id); }}
                      title="Eliminar"
                      className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="py-10 text-center text-xs text-muted-foreground">
              {records.length === 0
                ? <><strong>Nenhum registo.</strong> Clica em Novo registo para adicionar.</>
                : 'Nenhum resultado com os filtros activos.'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
