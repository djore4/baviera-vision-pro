import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Pencil, Trash2, X, Check, SlidersHorizontal, ChevronDown, Filter } from 'lucide-react';

interface ControlRecord {
  id: string;
  status: string; neg: string | null; mes1: string; resp: string; id_cliente: string;
  local: string; type: string; origin: string; profile: string; biz: string;
  enc: string; chas: string; mat: string; model: string; version: string; gar: string;
  qor: number; xev: number; bev: number; m: number; csc: number; cme: number | null;
  fin: string; week198: string; dmat: string | null; date298: string | null; app: string | null; obs: string;
}

type RecordForm = Omit<ControlRecord, 'id'>;

const EMPTY: RecordForm = {
  status: '', neg: '', mes1: '', resp: '', id_cliente: '', local: '',
  type: '', origin: '', profile: '', biz: '', enc: '', chas: '', mat: '',
  model: '', version: '', gar: '', qor: 0, xev: 0, bev: 0, m: 0,
  csc: 0, cme: null, fin: '', week198: '', dmat: '', date298: '', app: '', obs: '',
};

interface ColDef { key: keyof ControlRecord; label: string; type?: 'date' | 'number'; group?: string }

const ALL_COLS: ColDef[] = [
  { key: 'status', label: 'STATUS', group: 'Geral' },
  { key: 'neg', label: 'NEG', type: 'date', group: 'Geral' },
  { key: 'mes1', label: 'MÊS', group: 'Geral' },
  { key: 'resp', label: 'RESP', group: 'Geral' },
  { key: 'id_cliente', label: 'ID', group: 'Geral' },
  { key: 'local', label: 'LOCAL', group: 'Geral' },
  { key: 'type', label: 'TYPE', group: 'Veículo' },
  { key: 'origin', label: 'ORIGIN', group: 'Veículo' },
  { key: 'profile', label: 'PROFILE', group: 'Veículo' },
  { key: 'biz', label: 'BIZ', group: 'Veículo' },
  { key: 'model', label: 'MODEL', group: 'Veículo' },
  { key: 'version', label: 'VERSION', group: 'Veículo' },
  { key: 'gar', label: 'GAR', group: 'Veículo' },
  { key: 'enc', label: 'ENC', group: 'Veículo' },
  { key: 'chas', label: 'CHAS', group: 'Veículo' },
  { key: 'mat', label: 'MAT', group: 'Veículo' },
  { key: 'fin', label: 'FIN', group: 'Financeiro' },
  { key: 'qor', label: 'QoR', type: 'number', group: 'Financeiro' },
  { key: 'xev', label: 'xEV', type: 'number', group: 'Financeiro' },
  { key: 'bev', label: 'BEV', type: 'number', group: 'Financeiro' },
  { key: 'm', label: 'M', type: 'number', group: 'Financeiro' },
  { key: 'csc', label: 'CSC', type: 'number', group: 'Financeiro' },
  { key: 'cme', label: 'CME', type: 'number', group: 'Financeiro' },
  { key: 'week198', label: '198', group: 'Datas' },
  { key: 'dmat', label: 'DMAT', type: 'date', group: 'Datas' },
  { key: 'date298', label: '298', type: 'date', group: 'Datas' },
  { key: 'app', label: 'APP', type: 'date', group: 'Datas' },
  { key: 'obs', label: 'OBS', group: 'Obs.' },
];

const FORM_GROUPS = [
  { title: 'Geral', keys: ['status','neg','mes1','resp','id_cliente','local'] },
  { title: 'Veículo', keys: ['type','origin','profile','biz','model','version','gar','chas','mat','enc'] },
  { title: 'Financeiro', keys: ['fin','qor','xev','bev','m','csc','cme'] },
  { title: 'Datas', keys: ['dmat','date298','app','week198'] },
  { title: 'Observações', keys: ['obs'] },
];

function fmtDate(v: unknown) {
  if (!v) return '—';
  try { return new Date(v as string).toLocaleDateString('pt-PT'); } catch { return String(v); }
}
function fmtVal(col: ColDef, v: unknown) {
  if (v === null || v === undefined || v === '') return '—';
  if (col.type === 'date') return fmtDate(v);
  return String(v);
}

// Column filter popover
function ColFilter({ col, values, active, onChange }: {
  col: ColDef; values: string[]; active: Set<string>; onChange: (v: Set<string>) => void
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const toggle = (v: string) => {
    const next = new Set(active);
    if (next.has(v)) next.delete(v); else next.add(v);
    onChange(next);
  };

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => setOpen(o => !o)}
        className={`p-0.5 rounded transition-colors ${active.size > 0 ? 'text-amber-500' : 'text-white/30 hover:text-white/60'}`}
        title="Filtrar"
      >
        <Filter className="h-3 w-3" />
      </button>
      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 bg-popover border border-border rounded-lg shadow-xl p-2 min-w-[140px] max-h-[280px] overflow-y-auto">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase">{col.label}</span>
            {active.size > 0 && (
              <button onClick={() => onChange(new Set())} className="text-[10px] text-amber-500 hover:underline">limpar</button>
            )}
          </div>
          <div className="space-y-0.5">
            {values.map(v => (
              <button
                key={v}
                onClick={() => toggle(v)}
                className={`w-full text-left px-2 py-1 text-xs rounded transition-colors ${
                  active.has(v) ? 'bg-amber-500 text-black font-medium' : 'hover:bg-muted text-foreground'
                }`}
              >
                {v || '(vazio)'}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function DatabasePage() {
  const [records, setRecords] = useState<ControlRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<RecordForm>(EMPTY);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [colFilters, setColFilters] = useState<Record<string, Set<string>>>({});
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(new Set(['origin','biz','enc','chas','version','csc','cme','week198','local']));
  const [showColPanel, setShowColPanel] = useState(false);
  const colPanelRef = useRef<HTMLDivElement>(null);

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

  const visibleCols = ALL_COLS.filter(c => !hiddenCols.has(c.key));

  // Unique values per column for filter chips
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

  const filtered = useMemo(() => records.filter(r => {
    return Object.entries(colFilters).every(([key, vals]) => {
      if (vals.size === 0) return true;
      const v = r[key as keyof ControlRecord];
      const s = (v === null || v === undefined || v === '') ? '' : String(v);
      return vals.has(s);
    });
  }), [records, colFilters]);

  const activeFilterCount = Object.values(colFilters).filter(s => s.size > 0).length;

  function openNew() { setForm(EMPTY); setEditId(null); setShowForm(true); }
  function openEdit(r: ControlRecord) { const { id, ...rest } = r; setForm(rest); setEditId(id); setShowForm(true); }

  async function save() {
    setSaving(true);
    const payload = {
      ...form,
      qor: Number(form.qor) || 0, xev: Number(form.xev) || 0, bev: Number(form.bev) || 0,
      m: Number(form.m) || 0, csc: Number(form.csc) || 0,
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

  const groups = FORM_GROUPS.map(g => ({
    ...g,
    fields: g.keys.map(k => ALL_COLS.find(c => c.key === k)!).filter(Boolean),
  }));

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* Active filter tags */}
        {activeFilterCount > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {Object.entries(colFilters).filter(([, s]) => s.size > 0).map(([key, vals]) => {
              const col = ALL_COLS.find(c => c.key === key);
              return (
                <span key={key} className="flex items-center gap-1 px-2 py-0.5 bg-amber-500/20 text-amber-600 dark:text-amber-400 text-[10px] rounded-full font-medium">
                  {col?.label}: {[...vals].join(', ')}
                  <button onClick={() => setColFilters(f => { const n = {...f}; delete n[key]; return n; })}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              );
            })}
            <button onClick={() => setColFilters({})} className="text-[10px] text-muted-foreground hover:text-destructive">limpar tudo</button>
          </div>
        )}
        <span className="text-xs text-muted-foreground ml-auto">{filtered.length} registos</span>

        {/* Column visibility */}
        <div ref={colPanelRef} className="relative">
          <button
            onClick={() => setShowColPanel(o => !o)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded hover:bg-muted transition-colors"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Colunas
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </button>
          {showColPanel && (
            <div className="absolute right-0 top-full mt-1 z-50 bg-popover border border-border rounded-lg shadow-xl p-3 w-72 max-h-[400px] overflow-y-auto">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Mostrar / ocultar colunas</p>
              {['Geral','Veículo','Financeiro','Datas','Obs.'].map(grp => (
                <div key={grp} className="mb-3">
                  <p className="text-[10px] text-muted-foreground uppercase mb-1">{grp}</p>
                  <div className="grid grid-cols-3 gap-1">
                    {ALL_COLS.filter(c => c.group === grp).map(col => {
                      const hidden = hiddenCols.has(col.key);
                      return (
                        <button
                          key={col.key}
                          onClick={() => setHiddenCols(s => { const n = new Set(s); if (n.has(col.key)) n.delete(col.key); else n.add(col.key); return n; })}
                          className={`px-2 py-1 text-[10px] rounded transition-colors font-medium ${hidden ? 'bg-muted text-muted-foreground' : 'bg-amber-500/20 text-amber-600 dark:text-amber-400'}`}
                        >
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

        <button
          onClick={openNew}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-amber-500 text-black font-semibold rounded hover:bg-amber-400 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" /> Novo registo
        </button>
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border sticky top-0 bg-card z-10">
              <h2 className="text-sm font-semibold">{editId ? 'Editar Registo' : 'Novo Registo'}</h2>
              <button onClick={() => setShowForm(false)}><X className="h-4 w-4 text-muted-foreground" /></button>
            </div>
            <div className="p-5 space-y-5">
              {groups.map(group => (
                <div key={group.title}>
                  <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">{group.title}</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {group.fields.map(col => {
                      const key = col.key as keyof RecordForm;
                      const isTextarea = col.key === 'obs';
                      return (
                        <div key={col.key} className={isTextarea ? 'col-span-2' : ''}>
                          <label className="block text-[10px] font-medium text-muted-foreground mb-1">{col.label}</label>
                          {isTextarea ? (
                            <textarea
                              value={String(form[key] ?? '')}
                              onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                              rows={2}
                              className="w-full px-2.5 py-1.5 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                            />
                          ) : (
                            <input
                              type={col.type ?? 'text'}
                              value={String(form[key] ?? '')}
                              onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                              className="w-full px-2.5 py-1.5 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
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
                {visibleCols.map(col => (
                  <th key={col.key} className="px-2 py-2 text-left border-b border-border whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      <span className="font-semibold text-muted-foreground">{col.label}</span>
                      <ColFilter
                        col={col}
                        values={colUniqueValues[col.key] ?? []}
                        active={colFilters[col.key] ?? new Set()}
                        onChange={vals => setColFilters(f => vals.size === 0 ? (() => { const n = {...f}; delete n[col.key]; return n; })() : { ...f, [col.key]: vals })}
                      />
                    </div>
                  </th>
                ))}
                <th className="px-2 py-2 border-b border-border w-12" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  {visibleCols.map(col => (
                    <td key={col.key} className="px-2 py-1.5 whitespace-nowrap text-foreground/80">
                      {col.key === 'status' ? (
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          r.status === 'V' ? 'bg-green-500/20 text-green-600 dark:text-green-400' :
                          r.status === 'C' ? 'bg-red-500/20 text-red-600 dark:text-red-400' :
                          'bg-blue-500/20 text-blue-600 dark:text-blue-400'
                        }`}>{r.status || '—'}</span>
                      ) : fmtVal(col, r[col.key])}
                    </td>
                  ))}
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEdit(r)} className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"><Pencil className="h-3.5 w-3.5" /></button>
                      <button onClick={() => setDeleteId(r.id)} className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="py-10 text-center text-xs text-muted-foreground">
              {records.length === 0 ? <>Nenhum registo. Clica em <strong>Novo registo</strong> para adicionar.</> : 'Nenhum resultado com os filtros activos.'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
