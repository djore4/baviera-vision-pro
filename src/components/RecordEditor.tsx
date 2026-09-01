import { createContext, useCallback, useContext, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useData } from '@/contexts/DataContext';
import { X, Check, Trash2 } from 'lucide-react';

/* ── Form shape (colunas de control_records) ── */
export interface RecordForm {
  status: string; neg: string | null; mes1: string; resp: string; id_cliente: string;
  type: string; biz: string;
  enc: string; chas: string; mat: string; model: string; version: string; gar: string;
  qor: number; xev: number; bev: number; m: number; mpa: number; gkl: number;
  csc: number; cme: number | null;
  fin: string; week198: string; dmat: string | null; date298: string | null; app: string | null; obs: string;
}

const EMPTY: RecordForm = {
  status: '', neg: '', mes1: '', resp: '', id_cliente: '',
  type: '', biz: '', enc: '', chas: '', mat: '',
  model: '', version: '', gar: '', qor: 0, xev: 0, bev: 0, m: 0, mpa: 0, gkl: 0,
  csc: 0, cme: null, fin: '', week198: '', dmat: '', date298: '', app: '', obs: '',
};

const STATUS_OPTS = ['Frio','Morno','Quente','Carteira','Matricula','Retail','Adiado','Perdido'];
const TYPE_OPTS   = ['VN','VD','VP'];
const GAR_OPTS    = ['GAR','nGAR'];
const FIN_OPTS    = ['PP','FS','Fint','Fext'];
const CLASS_FLAGS  = ['qor','xev','bev','m','mpa','gkl'] as const;
const CLASS_LABELS: Record<string, string> = { qor:'QoR', xev:'xEV', bev:'BEV', m:'M', mpa:'MPA', gkl:'GKL' };
const MONTHS_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

/** Evento global emitido após criar/editar/eliminar um registo. */
export const RECORDS_CHANGED_EVENT = 'control-records-changed';

/* ── Month picker (mês e ano independentemente opcionais) ── */
function MonthPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const now = new Date();
  const years = Array.from({ length: 6 }, (_, i) => now.getFullYear() - 1 + i);
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
      <select value={curMonth} onChange={e => emit(e.target.value, curYear)}
        className="flex-1 min-w-0 px-2.5 py-1.5 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary">
        <option value="">— sem mês —</option>
        {MONTHS_PT.map((m, i) => <option key={i + 1} value={String(i + 1).padStart(2, '0')}>{m}</option>)}
      </select>
      <select value={curYear} onChange={e => emit(curMonth, e.target.value)}
        className="w-28 px-2.5 py-1.5 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary">
        <option value="">— sem ano —</option>
        {years.map(y => <option key={y} value={String(y)}>{y}</option>)}
      </select>
    </div>
  );
}

/* ── Context ── */
interface RecordEditorValue {
  openEditor: (id: string) => void;
  openNew: () => void;
}
const RecordEditorContext = createContext<RecordEditorValue | null>(null);

export function useRecordEditor() {
  const ctx = useContext(RecordEditorContext);
  if (!ctx) throw new Error('useRecordEditor must be used within RecordEditorProvider');
  return ctx;
}

export function RecordEditorProvider({ children }: { children: React.ReactNode }) {
  const { refresh } = useData();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<RecordForm>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [loadingRow, setLoadingRow] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const openNew = useCallback(() => {
    setForm(EMPTY); setEditId(null); setConfirmDelete(false); setOpen(true);
  }, []);

  const openEditor = useCallback(async (id: string) => {
    setEditId(id); setForm(EMPTY); setConfirmDelete(false); setOpen(true); setLoadingRow(true);
    const { data } = await supabase.from('control_records').select('*').eq('id', id).single();
    if (data) {
      const row = data as Record<string, unknown>;
      const next = { ...EMPTY } as Record<string, unknown>;
      for (const k of Object.keys(EMPTY)) {
        if (row[k] !== undefined && row[k] !== null) next[k] = row[k];
      }
      setForm(next as unknown as RecordForm);
    }
    setLoadingRow(false);
  }, []);

  const setField = <K extends keyof RecordForm>(key: K, val: RecordForm[K]) =>
    setForm(f => ({ ...f, [key]: val }));

  const notifyChanged = async () => {
    await refresh();
    window.dispatchEvent(new CustomEvent(RECORDS_CHANGED_EVENT));
  };

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
    setSaving(false); setOpen(false);
    await notifyChanged();
  }

  async function remove() {
    if (!editId) return;
    await supabase.from('control_records').delete().eq('id', editId);
    setConfirmDelete(false); setOpen(false);
    await notifyChanged();
  }

  function SelectField({ k, label, opts }: { k: keyof RecordForm; label: string; opts: string[] }) {
    return (
      <div>
        <label className="block text-[10px] font-medium text-muted-foreground mb-1">{label}</label>
        <select value={String(form[k] ?? '')} onChange={e => setField(k, e.target.value as RecordForm[typeof k])}
          className="w-full px-2.5 py-1.5 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary">
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
        <input type={type} value={String(form[k] ?? '')} onChange={e => setField(k, e.target.value as RecordForm[typeof k])}
          className="w-full px-2.5 py-1.5 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary" />
      </div>
    );
  }

  return (
    <RecordEditorContext.Provider value={{ openEditor, openNew }}>
      {children}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border sticky top-0 bg-card z-10">
              <h2 className="text-sm font-semibold">{editId ? 'Editar Registo' : 'Novo Registo'}</h2>
              <button onClick={() => setOpen(false)}><X className="h-4 w-4 text-muted-foreground" /></button>
            </div>

            <div className="p-5 space-y-6">
              {loadingRow && <p className="text-xs text-muted-foreground">A carregar registo...</p>}

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

              <div>
                <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Veículo</h3>
                <div className="grid grid-cols-2 gap-3">
                  <SelectField k="type" label="TYPE" opts={TYPE_OPTS} />
                  <TextField k="model" label="MODEL" />
                  <TextField k="version" label="VERSION" />
                  <SelectField k="gar" label="GAR — Garantia de entrega" opts={GAR_OPTS} />
                  <TextField k="mat" label="MAT — Matrícula" />
                </div>
              </div>

              <div>
                <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Pagamento</h3>
                <div className="grid grid-cols-2 gap-3">
                  <SelectField k="fin" label="FIN — Forma de pagamento" opts={FIN_OPTS} />
                </div>
              </div>

              <div>
                <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Classificação</h3>
                <div className="flex flex-wrap gap-2">
                  {CLASS_FLAGS.map(flag => {
                    const active = !!form[flag];
                    return (
                      <button key={flag} type="button" onClick={() => setField(flag, active ? 0 : 1)}
                        className={`px-3 py-1.5 text-xs rounded-full font-semibold border transition-colors ${
                          active ? 'bg-amber-500 text-black border-amber-500'
                                 : 'bg-background text-muted-foreground border-border hover:border-amber-400 hover:text-amber-400'
                        }`}>
                        {CLASS_LABELS[flag]}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-muted-foreground mt-1.5">Podes seleccionar várias em simultâneo</p>
              </div>

              <div>
                <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Datas</h3>
                <div className="grid grid-cols-2 gap-3">
                  <TextField k="week198" label="198 — Semana prevista" />
                  <TextField k="dmat" label="DMAT — Data da matrícula" type="date" />
                  <TextField k="date298" label="298 — Retail / Entrega cliente" type="date" />
                  <TextField k="app" label="APP — Data do Apping" type="date" />
                </div>
              </div>

              <div>
                <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Observações</h3>
                <textarea value={form.obs ?? ''} onChange={e => setField('obs', e.target.value)} rows={3}
                  className="w-full px-2.5 py-1.5 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                  placeholder="Notas adicionais..." />
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-border sticky bottom-0 bg-card">
              <div>
                {editId && (
                  confirmDelete ? (
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground">Eliminar?</span>
                      <button onClick={remove} className="px-2.5 py-1.5 text-xs bg-destructive text-white rounded hover:bg-destructive/90">Sim, eliminar</button>
                      <button onClick={() => setConfirmDelete(false)} className="px-2.5 py-1.5 text-xs border border-border rounded hover:bg-muted">Não</button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmDelete(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-destructive border border-destructive/30 rounded hover:bg-destructive/10 transition-colors">
                      <Trash2 className="h-3.5 w-3.5" /> Eliminar
                    </button>
                  )
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setOpen(false)} className="px-3 py-1.5 text-xs border border-border rounded hover:bg-muted transition-colors">Cancelar</button>
                <button onClick={save} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-amber-500 text-black font-semibold rounded hover:bg-amber-400 disabled:opacity-50 transition-colors">
                  <Check className="h-3.5 w-3.5" />{saving ? 'A guardar...' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </RecordEditorContext.Provider>
  );
}
