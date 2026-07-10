import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Plus, X, SlidersHorizontal, ChevronDown, ChevronUp, Filter, Database, Search } from 'lucide-react';
import { useData } from '@/contexts/DataContext';
import { replaceControlRecords } from '@/lib/control-records';
import { useRecordEditor, RECORDS_CHANGED_EVENT } from '@/components/RecordEditor';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface ControlRecord {
  id: string;
  status: string; neg: string | null; mes1: string; resp: string; id_cliente: string;
  local: string; type: string; origin: string; profile: string; biz: string;
  enc: string; chas: string; mat: string; model: string; version: string; gar: string;
  qor: number; xev: number; bev: number; m: number; mpa: number; gkl: number;
  csc: number; cme: number | null;
  fin: string; week198: string; dmat: string | null; date298: string | null; app: string | null; obs: string;
}

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

/* ── Linha de filtro: label + todas as opções sempre visíveis (pills toggle) ── */
function FilterRow({ label, options, active, fmt, onToggle }: {
  label: string; options: string[]; active: Set<string>;
  fmt?: (v: string) => string; onToggle: (v: string) => void;
}) {
  const disp = (v: string) => (fmt ? fmt(v) : (v || '(vazio)'));
  return (
    <div className="flex items-center gap-3 px-3 py-1.5">
      <span className="w-16 shrink-0 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</span>
      {/* 1 filtro = 1 linha: sem wrap, com scroll horizontal quando não cabe */}
      <div className="flex-1 min-w-0 flex flex-nowrap gap-1.5 overflow-x-auto no-scrollbar">
        {options.length === 0 && <span className="text-[11px] text-muted-foreground">—</span>}
        {options.map(v => {
          const on = active.has(v);
          return (
            <button
              key={v}
              type="button"
              onClick={() => onToggle(v)}
              className={`shrink-0 whitespace-nowrap px-2.5 py-1 text-xs rounded-full border transition-colors ${
                on
                  ? 'bg-amber-500 text-black border-amber-500 font-medium'
                  : 'bg-background text-muted-foreground border-border hover:border-amber-400 hover:text-amber-400'
              }`}
            >
              {disp(v)}
            </button>
          );
        })}
      </div>
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
  const { openEditor, openNew } = useRecordEditor();
  const [records, setRecords] = useState<ControlRecord[]>([]);
  const [loading, setLoading] = useState(true);

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

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('control_records').select('*').order('neg', { ascending: false });
    setRecords((data as ControlRecord[]) ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  // Recarrega quando um registo é criado/editado/eliminado (em qualquer tabela).
  useEffect(() => {
    const h = () => { load(); };
    window.addEventListener(RECORDS_CHANGED_EVENT, h);
    return () => window.removeEventListener(RECORDS_CHANGED_EVENT, h);
  }, []);

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
      }))].sort((a, b) => {
        // Vazios/sem data sempre no fim.
        if (a === b) return 0;
        if (a === '') return 1;
        if (b === '') return -1;
        return a < b ? -1 : 1;
      });
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

  const toggleValue = (key: string, v: string) =>
    setColFilters(f => {
      const cur = new Set(f[key] ?? []);
      cur.has(v) ? cur.delete(v) : cur.add(v);
      const n = { ...f };
      if (cur.size === 0) delete n[key]; else n[key] = cur;
      return n;
    });

  const toggleSegment = (v: string) =>
    setSegmentFilter(s => { const n = new Set(s); n.has(v) ? n.delete(v) : n.add(v); return n; });

  function clearAllFilters() {
    setColFilters({});
    setSegmentFilter(new Set());
  }
  function toggleSort(key: string) {
    setSort(s => (!s || s.key !== key) ? { key, dir: 'asc' } : s.dir === 'asc' ? { key, dir: 'desc' } : null);
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

      {/* Toolbar: pesquisa + ações */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
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

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-muted-foreground">{filtered.length} registos</span>

          {/* Visibilidade de colunas */}
          <Popover open={showColPanel} onOpenChange={setShowColPanel}>
            <PopoverTrigger asChild>
              <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded hover:bg-muted transition-colors">
                <SlidersHorizontal className="h-3.5 w-3.5" />Colunas<ChevronDown className="h-3 w-3 text-muted-foreground" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" collisionPadding={8} className="w-72 max-w-[calc(100vw-1rem)] max-h-[70vh] overflow-y-auto p-3">
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
            </PopoverContent>
          </Popover>

          <button onClick={openNew} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-amber-500 text-black font-semibold rounded hover:bg-amber-400 transition-colors">
            <Plus className="h-3.5 w-3.5" /> Novo registo
          </button>
        </div>
      </div>

      {/* Painel de filtros: cada campo numa linha, todas as opções sempre visíveis */}
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="flex items-center justify-between px-3 py-1.5 bg-[#002060] text-white">
          <span className="text-[10px] font-semibold uppercase tracking-wide flex items-center gap-1.5">
            <Filter className="h-3 w-3" /> Filtros
          </span>
          {activeFilterCount > 0 && (
            <button onClick={clearAllFilters} className="text-[11px] text-amber-300 hover:underline">
              limpar tudo ({activeFilterCount})
            </button>
          )}
        </div>
        <div className="divide-y divide-border/40 max-h-[45vh] overflow-y-auto">
          {VALUE_FILTERS.map(s => (
            <FilterRow
              key={s.key}
              label={s.label}
              options={colUniqueValues[s.key] ?? []}
              active={colFilters[s.key] ?? new Set()}
              fmt={s.fmt}
              onToggle={v => toggleValue(s.key, v)}
            />
          ))}
          <FilterRow
            label="SEGMENT"
            options={SEGMENT_OPTIONS.map(o => o.key)}
            active={segmentFilter}
            fmt={k => SEGMENT_LABELS[k] ?? k}
            onToggle={toggleSegment}
          />
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="py-16 text-center text-sm text-muted-foreground">A carregar...</div>
      ) : (
        <div className="overflow-auto rounded-lg border border-border">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[#002060] text-white">
                {visibleCols.map(col => {
                  const sorted = sort?.key === col.key;
                  return (
                    <th
                      key={col.key}
                      onClick={() => toggleSort(col.key)}
                      title="Ordenar"
                      className="px-2 py-2 text-left whitespace-nowrap cursor-pointer select-none group"
                    >
                      <span className={`inline-flex items-center gap-1 font-semibold ${sorted ? 'text-amber-300' : 'text-white/90 group-hover:text-white'}`}>
                        {col.label}
                        {sorted
                          ? (sort!.dir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)
                          : <ChevronDown className="h-3 w-3 opacity-0 group-hover:opacity-40" />}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr
                  key={r.id}
                  onClick={() => r.id && openEditor(r.id)}
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
