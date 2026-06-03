import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Pencil, Trash2, X, Check } from 'lucide-react';

interface Demo {
  id: string;
  matricula: string;
  modelo: string;
  versao: string | null;
  cor: string | null;
  km: number;
  data_entrada: string | null;
  data_saida: string | null;
  status: 'ativo' | 'inativo' | 'vendido';
  responsavel: string | null;
  observacoes: string | null;
}

const EMPTY: Omit<Demo, 'id'> = {
  matricula: '', modelo: '', versao: '', cor: '', km: 0,
  data_entrada: '', data_saida: '', status: 'ativo', responsavel: '', observacoes: '',
};

const STATUS_BADGE: Record<string, string> = {
  ativo: 'bg-green-500/20 text-green-600 dark:text-green-400',
  inativo: 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400',
  vendido: 'bg-red-500/20 text-red-600 dark:text-red-400',
};

export default function DemosPage() {
  const [demos, setDemos] = useState<Demo[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('ativo');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Omit<Demo, 'id'>>(EMPTY);
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

  const filtered = statusFilter ? demos.filter(d => d.status === statusFilter) : demos;

  function openNew() { setForm(EMPTY); setEditId(null); setShowForm(true); }
  function openEdit(d: Demo) { const { id, ...rest } = d; setForm(rest); setEditId(id); setShowForm(true); }

  async function save() {
    if (!form.matricula || !form.modelo) return;
    setSaving(true);
    const payload = {
      ...form,
      km: Number(form.km) || 0,
      data_entrada: form.data_entrada || null,
      data_saida: form.data_saida || null,
      versao: form.versao || null,
      cor: form.cor || null,
      responsavel: form.responsavel || null,
      observacoes: form.observacoes || null,
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

  const counts = { ativo: demos.filter(d => d.status === 'ativo').length, inativo: demos.filter(d => d.status === 'inativo').length, vendido: demos.filter(d => d.status === 'vendido').length };

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-center">
        {([['', 'Todos', demos.length], ['ativo', 'Ativos', counts.ativo], ['inativo', 'Inativos', counts.inativo], ['vendido', 'Vendidos', counts.vendido]] as [string, string, number][]).map(([val, label, count]) => (
          <button
            key={val}
            onClick={() => setStatusFilter(val)}
            className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${statusFilter === val ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
          >
            {label} ({count})
          </button>
        ))}
        <button
          onClick={openNew}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs bg-amber-500 text-black font-semibold rounded hover:bg-amber-400 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" /> Novo Demo
        </button>
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border sticky top-0 bg-card">
              <h2 className="text-sm font-semibold">{editId ? 'Editar Demo' : 'Novo Demonstrador'}</h2>
              <button onClick={() => setShowForm(false)}><X className="h-4 w-4 text-muted-foreground" /></button>
            </div>
            <div className="p-4 grid grid-cols-2 gap-3">
              {([
                ['matricula', 'Matrícula *', 'text'],
                ['modelo', 'Modelo *', 'text'],
                ['versao', 'Versão', 'text'],
                ['cor', 'Cor', 'text'],
                ['km', 'Km', 'number'],
                ['responsavel', 'Responsável', 'text'],
                ['data_entrada', 'Data Entrada', 'date'],
                ['data_saida', 'Data Saída', 'date'],
              ] as [keyof typeof form, string, string][]).map(([key, label, type]) => (
                <div key={key} className="space-y-1">
                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{label}</label>
                  <input
                    type={type}
                    value={String(form[key] ?? '')}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    className="w-full px-2.5 py-1.5 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              ))}
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Estado *</label>
                <select
                  value={form.status}
                  onChange={e => setForm(f => ({ ...f, status: e.target.value as Demo['status'] }))}
                  className="w-full px-2.5 py-1.5 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="ativo">Ativo</option>
                  <option value="inativo">Inativo</option>
                  <option value="vendido">Vendido</option>
                </select>
              </div>
              <div className="col-span-2 space-y-1">
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Observações</label>
                <textarea
                  value={form.observacoes ?? ''}
                  onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))}
                  rows={2}
                  className="w-full px-2.5 py-1.5 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-4 py-3 border-t border-border sticky bottom-0 bg-card">
              <button onClick={() => setShowForm(false)} className="px-3 py-1.5 text-xs border border-border rounded hover:bg-muted transition-colors">Cancelar</button>
              <button
                onClick={save}
                disabled={saving || !form.matricula || !form.modelo}
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
                {['Matrícula', 'Modelo', 'Versão', 'Cor', 'Km', 'Estado', 'Responsável', 'Entrada', 'Saída', 'Obs.', ''].map(h => (
                  <th key={h} className="px-2 py-2 text-left font-semibold text-muted-foreground whitespace-nowrap border-b border-border">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(d => (
                <tr key={d.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="px-2 py-1.5 font-medium whitespace-nowrap">{d.matricula}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">{d.modelo}</td>
                  <td className="px-2 py-1.5 text-muted-foreground">{d.versao || '—'}</td>
                  <td className="px-2 py-1.5 text-muted-foreground">{d.cor || '—'}</td>
                  <td className="px-2 py-1.5 text-right">{d.km.toLocaleString('pt-PT')}</td>
                  <td className="px-2 py-1.5">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${STATUS_BADGE[d.status]}`}>{d.status}</span>
                  </td>
                  <td className="px-2 py-1.5 text-muted-foreground">{d.responsavel || '—'}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap text-muted-foreground">{d.data_entrada ? new Date(d.data_entrada).toLocaleDateString('pt-PT') : '—'}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap text-muted-foreground">{d.data_saida ? new Date(d.data_saida).toLocaleDateString('pt-PT') : '—'}</td>
                  <td className="px-2 py-1.5 max-w-[140px] truncate text-muted-foreground">{d.observacoes || '—'}</td>
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
              Nenhum demonstrador encontrado. Clica em <strong>Novo Demo</strong> para adicionar.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
