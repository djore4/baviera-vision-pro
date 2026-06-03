import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Pencil, Trash2, X, Check, Search } from 'lucide-react';

interface ControlRecord {
  id: string;
  status: string;
  neg: string | null;
  mes1: string;
  resp: string;
  id_cliente: string;
  local: string;
  type: string;
  origin: string;
  profile: string;
  biz: string;
  enc: string;
  chas: string;
  mat: string;
  model: string;
  version: string;
  gar: string;
  qor: number;
  xev: number;
  bev: number;
  m: number;
  csc: number;
  cme: number | null;
  fin: string;
  week198: string;
  dmat: string | null;
  date298: string | null;
  app: string | null;
  obs: string;
}

const EMPTY: Omit<ControlRecord, 'id'> = {
  status: '', neg: '', mes1: '', resp: '', id_cliente: '', local: '',
  type: '', origin: '', profile: '', biz: '', enc: '', chas: '', mat: '',
  model: '', version: '', gar: '', qor: 0, xev: 0, bev: 0, m: 0,
  csc: 0, cme: null, fin: '', week198: '', dmat: '', date298: '', app: '', obs: '',
};

const COLS: { key: keyof ControlRecord; label: string }[] = [
  { key: 'status', label: 'STATUS' },
  { key: 'neg', label: 'NEG' },
  { key: 'mes1', label: 'MÊS1' },
  { key: 'resp', label: 'RESP' },
  { key: 'id_cliente', label: 'ID' },
  { key: 'local', label: 'LOCAL' },
  { key: 'type', label: 'TYPE' },
  { key: 'origin', label: 'ORIGIN' },
  { key: 'profile', label: 'PROFILE' },
  { key: 'biz', label: 'BIZ' },
  { key: 'enc', label: 'ENC' },
  { key: 'chas', label: 'CHAS' },
  { key: 'mat', label: 'MAT' },
  { key: 'model', label: 'MODEL' },
  { key: 'version', label: 'VERSION' },
  { key: 'gar', label: 'GAR' },
  { key: 'qor', label: 'QoR' },
  { key: 'xev', label: 'xEV' },
  { key: 'bev', label: 'BEV' },
  { key: 'm', label: 'M' },
  { key: 'csc', label: 'CSC' },
  { key: 'cme', label: 'CME' },
  { key: 'fin', label: 'FIN' },
  { key: 'week198', label: '198' },
  { key: 'dmat', label: 'DMAT' },
  { key: 'date298', label: '298' },
  { key: 'app', label: 'APP' },
  { key: 'obs', label: 'OBS' },
];

const FORM_GROUPS = [
  {
    title: 'Geral',
    fields: [
      { key: 'status', label: 'STATUS' },
      { key: 'neg', label: 'NEG', type: 'date' },
      { key: 'mes1', label: 'MÊS1' },
      { key: 'resp', label: 'RESP' },
      { key: 'id_cliente', label: 'ID' },
      { key: 'local', label: 'LOCAL' },
    ],
  },
  {
    title: 'Veículo',
    fields: [
      { key: 'type', label: 'TYPE' },
      { key: 'origin', label: 'ORIGIN' },
      { key: 'profile', label: 'PROFILE' },
      { key: 'biz', label: 'BIZ' },
      { key: 'model', label: 'MODEL' },
      { key: 'version', label: 'VERSION' },
      { key: 'gar', label: 'GAR' },
      { key: 'chas', label: 'CHAS' },
      { key: 'mat', label: 'MAT' },
      { key: 'enc', label: 'ENC' },
    ],
  },
  {
    title: 'Financeiro',
    fields: [
      { key: 'fin', label: 'FIN' },
      { key: 'qor', label: 'QoR', type: 'number' },
      { key: 'xev', label: 'xEV', type: 'number' },
      { key: 'bev', label: 'BEV', type: 'number' },
      { key: 'm', label: 'M', type: 'number' },
      { key: 'csc', label: 'CSC', type: 'number' },
      { key: 'cme', label: 'CME', type: 'number' },
    ],
  },
  {
    title: 'Datas',
    fields: [
      { key: 'dmat', label: 'DMAT', type: 'date' },
      { key: 'date298', label: '298', type: 'date' },
      { key: 'app', label: 'APP', type: 'date' },
      { key: 'week198', label: '198' },
    ],
  },
  {
    title: 'Observações',
    fields: [{ key: 'obs', label: 'OBS', textarea: true }],
  },
] as const;

function fmt(val: unknown) {
  if (val === null || val === undefined || val === '') return '—';
  return String(val);
}

export default function DatabasePage() {
  const [records, setRecords] = useState<ControlRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Omit<ControlRecord, 'id'>>(EMPTY);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('control_records')
      .select('*')
      .order('neg', { ascending: false });
    setRecords((data as ControlRecord[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => records.filter(r => {
    if (statusFilter && r.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        r.id_cliente?.toLowerCase().includes(q) ||
        r.resp?.toLowerCase().includes(q) ||
        r.model?.toLowerCase().includes(q) ||
        r.chas?.toLowerCase().includes(q) ||
        r.mat?.toLowerCase().includes(q)
      );
    }
    return true;
  }), [records, search, statusFilter]);

  const statuses = useMemo(() => [...new Set(records.map(r => r.status).filter(Boolean))].sort(), [records]);

  function openNew() {
    setForm(EMPTY);
    setEditId(null);
    setShowForm(true);
  }

  function openEdit(r: ControlRecord) {
    const { id, ...rest } = r;
    setForm(rest);
    setEditId(id);
    setShowForm(true);
  }

  async function save() {
    setSaving(true);
    const payload = {
      ...form,
      qor: Number(form.qor) || 0,
      xev: Number(form.xev) || 0,
      bev: Number(form.bev) || 0,
      m: Number(form.m) || 0,
      csc: Number(form.csc) || 0,
      cme: form.cme !== null && form.cme !== undefined && String(form.cme) !== '' ? Number(form.cme) : null,
      neg: form.neg || null,
      dmat: form.dmat || null,
      date298: form.date298 || null,
      app: form.app || null,
    };
    if (editId) {
      await supabase.from('control_records').update(payload).eq('id', editId);
    } else {
      await supabase.from('control_records').insert(payload);
    }
    setSaving(false);
    setShowForm(false);
    load();
  }

  async function remove(id: string) {
    await supabase.from('control_records').delete().eq('id', id);
    setDeleteId(null);
    load();
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="Cliente, responsável, modelo, chassis..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          className="px-3 py-1.5 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
        >
          <option value="">Todos os estados</option>
          {statuses.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className="text-xs text-muted-foreground">{filtered.length} registos</span>
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
              {FORM_GROUPS.map(group => (
                <div key={group.title}>
                  <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">{group.title}</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {group.fields.map((f) => {
                      const key = f.key as keyof typeof form;
                      const isTextarea = 'textarea' in f && f.textarea;
                      return (
                        <div key={String(f.key)} className={isTextarea ? 'col-span-2' : ''}>
                          <label className="block text-[10px] font-medium text-muted-foreground mb-1">{f.label}</label>
                          {isTextarea ? (
                            <textarea
                              value={String(form[key] ?? '')}
                              onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                              rows={2}
                              className="w-full px-2.5 py-1.5 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                            />
                          ) : (
                            <input
                              type={'type' in f ? f.type : 'text'}
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
              <button
                onClick={save}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-amber-500 text-black font-semibold rounded hover:bg-amber-400 disabled:opacity-50 transition-colors"
              >
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
            <p className="text-sm font-medium">Tens a certeza que queres eliminar este registo?</p>
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
                {COLS.map(c => (
                  <th key={c.key} className="px-2 py-2 text-left font-semibold text-muted-foreground whitespace-nowrap border-b border-border">{c.label}</th>
                ))}
                <th className="px-2 py-2 border-b border-border" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  {COLS.map(c => (
                    <td key={c.key} className="px-2 py-1.5 whitespace-nowrap text-foreground/80">
                      {c.key === 'status' ? (
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          r.status === 'V' ? 'bg-green-500/20 text-green-600 dark:text-green-400' :
                          r.status === 'C' ? 'bg-red-500/20 text-red-600 dark:text-red-400' :
                          'bg-blue-500/20 text-blue-600 dark:text-blue-400'
                        }`}>{fmt(r[c.key])}</span>
                      ) : fmt(r[c.key])}
                    </td>
                  ))}
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEdit(r)} className="p-1 text-muted-foreground hover:text-foreground transition-colors" title="Editar">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => setDeleteId(r.id)} className="p-1 text-muted-foreground hover:text-destructive transition-colors" title="Eliminar">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="py-10 text-center text-xs text-muted-foreground">
              Nenhum registo encontrado. Clica em <strong>Novo registo</strong> para adicionar.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
