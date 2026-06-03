import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Pencil, Trash2, X, Check, Search } from 'lucide-react';

interface Demo {
  id: string;
  local: string; modelo: string; versao: string; enc: string; chass: string; mat: string;
  data: string | null; ice: string; xev: string; bev: string; qor: string; m: string;
  t1: number | null; pvb: number | null; opc: number | null; bsi: string; pct: number | null;
  eco: number | null; leg_tr: number | null; isv: number | null; pvp: number | null;
  mgb: number | null; esf: number | null; pac: number | null; dem: number | null;
  sup: number | null; dsc_eur: number | null; desc_pct: number | null; iva2: number | null;
  pv_min: number | null; t2: number | null; dep: number | null; dep_eur: number | null;
  mg: number | null; pvp_desc: number | null; s_iva: number | null; net: number | null;
  evento: string;
}

type DemoForm = Omit<Demo, 'id'>;

const EMPTY: DemoForm = {
  local: '', modelo: '', versao: '', enc: '', chass: '', mat: '', data: '',
  ice: '', xev: '', bev: '', qor: '', m: '', t1: null, pvb: null, opc: null,
  bsi: '', pct: null, eco: null, leg_tr: null, isv: null, pvp: null,
  mgb: null, esf: null, pac: null, dem: null, sup: null, dsc_eur: null,
  desc_pct: null, iva2: null, pv_min: null, t2: null, dep: null, dep_eur: null,
  mg: null, pvp_desc: null, s_iva: null, net: null, evento: '',
};

const FORM_GROUPS = [
  {
    title: 'Identificação',
    fields: [
      { key: 'local', label: 'Local' }, { key: 'modelo', label: 'Modelo' },
      { key: 'versao', label: 'Versão' }, { key: 'enc', label: 'ENC' },
      { key: 'chass', label: 'Chassis' }, { key: 'mat', label: 'Matrícula' },
      { key: 'data', label: 'Data', type: 'date' }, { key: 'evento', label: 'Evento' },
    ],
  },
  {
    title: 'Características',
    fields: [
      { key: 'ice', label: 'ICE' }, { key: 'xev', label: 'xEV' },
      { key: 'bev', label: 'BEV' }, { key: 'qor', label: 'QoR' },
      { key: 'm', label: 'M' }, { key: 't1', label: 'T1', type: 'number' },
    ],
  },
  {
    title: 'Preços Base',
    fields: [
      { key: 'pvb', label: 'PVB', type: 'number' }, { key: 'opc', label: 'OPC', type: 'number' },
      { key: 'bsi', label: 'BSI' }, { key: 'pct', label: '%', type: 'number' },
      { key: 'eco', label: 'ECO', type: 'number' }, { key: 'leg_tr', label: 'LEG/TR', type: 'number' },
      { key: 'isv', label: 'ISV', type: 'number' }, { key: 'pvp', label: 'PVP', type: 'number' },
    ],
  },
  {
    title: 'Margens & Descontos',
    fields: [
      { key: 'mgb', label: 'MGB', type: 'number' }, { key: 'esf', label: 'ESF', type: 'number' },
      { key: 'pac', label: 'PAC', type: 'number' }, { key: 'dem', label: 'DEM', type: 'number' },
      { key: 'sup', label: 'SUP', type: 'number' }, { key: 'dsc_eur', label: 'DSC €', type: 'number' },
      { key: 'desc_pct', label: 'DESC %', type: 'number' }, { key: 'iva2', label: 'IVA2', type: 'number' },
      { key: 'pv_min', label: 'PV MIN', type: 'number' },
    ],
  },
  {
    title: 'Depreciação & Final',
    fields: [
      { key: 't2', label: 'T2', type: 'number' }, { key: 'dep', label: 'DEP', type: 'number' },
      { key: 'dep_eur', label: 'DEP (€)', type: 'number' }, { key: 'mg', label: 'MG', type: 'number' },
      { key: 'pvp_desc', label: 'PVP DESC', type: 'number' }, { key: 's_iva', label: 's/ IVA', type: 'number' },
      { key: 'net', label: 'NET', type: 'number' },
    ],
  },
] as const;

const TABLE_COLS: { key: keyof Demo; label: string }[] = [
  { key: 'local', label: 'Local' }, { key: 'modelo', label: 'Modelo' }, { key: 'versao', label: 'Versão' },
  { key: 'mat', label: 'Mat.' }, { key: 'chass', label: 'Chassis' }, { key: 'data', label: 'Data' },
  { key: 'ice', label: 'ICE' }, { key: 'xev', label: 'xEV' }, { key: 'bev', label: 'BEV' },
  { key: 'qor', label: 'QoR' }, { key: 'm', label: 'M' }, { key: 't1', label: 'T1' },
  { key: 'pvb', label: 'PVB' }, { key: 'pvp', label: 'PVP' }, { key: 'pvp_desc', label: 'PVP DESC' },
  { key: 'dsc_eur', label: 'DSC €' }, { key: 'desc_pct', label: 'DESC %' },
  { key: 'mg', label: 'MG' }, { key: 'net', label: 'NET' }, { key: 'evento', label: 'Evento' },
];

function numFmt(val: unknown) {
  if (val === null || val === undefined || val === '') return '—';
  const n = Number(val);
  if (isNaN(n)) return String(val);
  return n.toLocaleString('pt-PT', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

const PRICE_KEYS = new Set(['pvb','opc','pvp','dsc_eur','pv_min','pvp_desc','s_iva','net','dep_eur','mg','eco','leg_tr','isv','iva2']);
const PCT_KEYS = new Set(['pct','mgb','esf','pac','dem','dep','desc_pct']);

function cellFmt(key: string, val: unknown) {
  if (val === null || val === undefined || val === '') return '—';
  const n = Number(val);
  if (!isNaN(n)) {
    if (PRICE_KEYS.has(key)) return `${n.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
    if (PCT_KEYS.has(key)) return `${(n * 100).toLocaleString('pt-PT', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%`;
  }
  return String(val);
}

export default function DemosPage() {
  const [demos, setDemos] = useState<Demo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<DemoForm>(EMPTY);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('demos').select('*').order('created_at', { ascending: false });
    setDemos((data as Demo[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    if (!search) return demos;
    const q = search.toLowerCase();
    return demos.filter(d =>
      d.modelo?.toLowerCase().includes(q) ||
      d.versao?.toLowerCase().includes(q) ||
      d.mat?.toLowerCase().includes(q) ||
      d.chass?.toLowerCase().includes(q) ||
      d.local?.toLowerCase().includes(q) ||
      d.evento?.toLowerCase().includes(q)
    );
  }, [demos, search]);

  function openNew() { setForm(EMPTY); setEditId(null); setShowForm(true); }
  function openEdit(d: Demo) { const { id, ...rest } = d; setForm(rest); setEditId(id); setShowForm(true); }

  async function save() {
    setSaving(true);
    const toNum = (v: unknown) => (v === '' || v === null || v === undefined) ? null : Number(v);
    const payload: DemoForm = {
      ...form,
      data: form.data || null,
      t1: toNum(form.t1), pvb: toNum(form.pvb), opc: toNum(form.opc),
      pct: toNum(form.pct), eco: toNum(form.eco), leg_tr: toNum(form.leg_tr),
      isv: toNum(form.isv), pvp: toNum(form.pvp), mgb: toNum(form.mgb),
      esf: toNum(form.esf), pac: toNum(form.pac), dem: toNum(form.dem),
      sup: toNum(form.sup), dsc_eur: toNum(form.dsc_eur), desc_pct: toNum(form.desc_pct),
      iva2: toNum(form.iva2), pv_min: toNum(form.pv_min), t2: toNum(form.t2),
      dep: toNum(form.dep), dep_eur: toNum(form.dep_eur), mg: toNum(form.mg),
      pvp_desc: toNum(form.pvp_desc), s_iva: toNum(form.s_iva), net: toNum(form.net),
    };
    if (editId) {
      await supabase.from('demos').update(payload).eq('id', editId);
    } else {
      await supabase.from('demos').insert(payload);
    }
    setSaving(false);
    setShowForm(false);
    load();
  }

  async function remove(id: string) {
    await supabase.from('demos').delete().eq('id', id);
    setDeleteId(null);
    load();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="Modelo, versão, matrícula, chassis, evento..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <span className="text-xs text-muted-foreground">{filtered.length} demos</span>
        <button
          onClick={openNew}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-amber-500 text-black font-semibold rounded hover:bg-amber-400 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" /> Novo Demo
        </button>
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border sticky top-0 bg-card z-10">
              <h2 className="text-sm font-semibold">{editId ? 'Editar Demo' : 'Novo Demonstrador'}</h2>
              <button onClick={() => setShowForm(false)}><X className="h-4 w-4 text-muted-foreground" /></button>
            </div>
            <div className="p-5 space-y-5">
              {FORM_GROUPS.map(group => (
                <div key={group.title}>
                  <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">{group.title}</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {group.fields.map(f => {
                      const key = f.key as keyof DemoForm;
                      return (
                        <div key={String(f.key)}>
                          <label className="block text-[10px] font-medium text-muted-foreground mb-1">{f.label}</label>
                          <input
                            type={'type' in f ? f.type : 'text'}
                            value={String(form[key] ?? '')}
                            onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                            className="w-full px-2.5 py-1.5 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
                          />
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
            <p className="text-sm font-medium">Eliminar este demonstrador?</p>
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
                {TABLE_COLS.map(c => (
                  <th key={c.key} className="px-2 py-2 text-left font-semibold text-muted-foreground whitespace-nowrap border-b border-border">{c.label}</th>
                ))}
                <th className="px-2 py-2 border-b border-border" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(d => (
                <tr key={d.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  {TABLE_COLS.map(c => (
                    <td key={c.key} className="px-2 py-1.5 whitespace-nowrap text-foreground/80">
                      {c.key === 'data'
                        ? (d.data ? new Date(d.data).toLocaleDateString('pt-PT') : '—')
                        : cellFmt(String(c.key), d[c.key])}
                    </td>
                  ))}
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEdit(d)} className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="Editar">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => setDeleteId(d.id)} className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors" title="Eliminar">
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
              Nenhum demonstrador. Clica em <strong>Novo Demo</strong> para adicionar.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
