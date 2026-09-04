import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/App';
import { usePermissions } from '@/contexts/PermissionsContext';
import {
  Plus, Pencil, Trash2, X, Check, Search, Archive, ArchiveRestore, ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';

/* ── Tab Retoma (admin) ────────────────────────────────────────────────────────
 * Repositório e stock de viaturas de retoma. Permite inserir/consultar retomas
 * e arquivá-las (saindo da carteira ativa, mas mantendo-se consultáveis).
 * O acesso é controlado pela matriz de permissões (tab 'retoma').
 * ──────────────────────────────────────────────────────────────────────────── */

type Motorizacao = 'ice' | 'phev' | 'bev';

interface Retoma {
  id: string;
  marca: string;
  modelo: string;
  motorizacao: Motorizacao | null;
  matricula: string | null;
  data_matricula: string | null;
  quilometragem: number | null;
  importado: boolean;
  link_caetano: string | null;
  link_maxterauto: string | null;
  link_fotos: string | null;
  arquivada: boolean;
  arquivada_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface RetomaForm {
  marca: string;
  modelo: string;
  motorizacao: Motorizacao | '';
  matricula: string;
  data_matricula: string;
  quilometragem: string;
  importado: boolean;
  link_caetano: string;
  link_maxterauto: string;
  link_fotos: string;
}

const EMPTY: RetomaForm = {
  marca: '', modelo: '', motorizacao: '', matricula: '', data_matricula: '',
  quilometragem: '', importado: false,
  link_caetano: '', link_maxterauto: '', link_fotos: '',
};

const MOTORIZACOES: { value: Motorizacao; label: string; cls: string }[] = [
  { value: 'ice',  label: 'ICE',  cls: 'bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300' },
  { value: 'phev', label: 'PHEV', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300' },
  { value: 'bev',  label: 'BEV',  cls: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300' },
];

const motLabel = (m: Motorizacao | null) => MOTORIZACOES.find(x => x.value === m)?.label ?? '—';
const motCls   = (m: Motorizacao | null) => MOTORIZACOES.find(x => x.value === m)?.cls ?? '';

const kmFmt = (v: number | null) =>
  v === null || v === undefined ? '—' : `${v.toLocaleString('pt-PT')} km`;

const dateFmt = (v: string | null) =>
  v ? new Date(v).toLocaleDateString('pt-PT') : '—';

/* Normaliza um link colado (aceita já com http(s) ou só o domínio). */
const normalizeUrl = (u: string) => {
  const t = u.trim();
  if (!t) return '';
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
};

export default function RetomaPage() {
  const { session } = useAuth();
  const { canEdit } = usePermissions();
  const editable = canEdit('retoma');

  const [rows, setRows] = useState<Retoma[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'ativas' | 'arquivadas'>('ativas');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<RetomaForm>(EMPTY);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from('retomas').select('*').order('created_at', { ascending: false });
    if (error) toast.error('Não foi possível carregar as retomas.');
    setRows((data as Retoma[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const counts = useMemo(() => ({
    ativas: rows.filter(r => !r.arquivada).length,
    arquivadas: rows.filter(r => r.arquivada).length,
  }), [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter(r => (view === 'arquivadas' ? r.arquivada : !r.arquivada))
      .filter(r => !q ||
        r.marca?.toLowerCase().includes(q) ||
        r.modelo?.toLowerCase().includes(q) ||
        r.matricula?.toLowerCase().includes(q));
  }, [rows, search, view]);

  function openNew() { setForm(EMPTY); setEditId(null); setShowForm(true); }
  function openEdit(r: Retoma) {
    setForm({
      marca: r.marca ?? '',
      modelo: r.modelo ?? '',
      motorizacao: r.motorizacao ?? '',
      matricula: r.matricula ?? '',
      data_matricula: r.data_matricula ?? '',
      quilometragem: r.quilometragem?.toString() ?? '',
      importado: r.importado,
      link_caetano: r.link_caetano ?? '',
      link_maxterauto: r.link_maxterauto ?? '',
      link_fotos: r.link_fotos ?? '',
    });
    setEditId(r.id);
    setShowForm(true);
  }

  async function save() {
    if (!form.marca.trim() || !form.modelo.trim()) {
      toast.error('Marca e modelo são obrigatórios.');
      return;
    }
    const km = form.quilometragem.trim();
    if (km && (isNaN(Number(km)) || Number(km) < 0)) {
      toast.error('Quilometragem inválida.');
      return;
    }
    setSaving(true);
    const payload = {
      marca: form.marca.trim(),
      modelo: form.modelo.trim(),
      motorizacao: form.motorizacao || null,
      matricula: form.matricula.trim() || null,
      data_matricula: form.data_matricula || null,
      quilometragem: km ? Number(km) : null,
      importado: form.importado,
      link_caetano: normalizeUrl(form.link_caetano) || null,
      link_maxterauto: normalizeUrl(form.link_maxterauto) || null,
      link_fotos: normalizeUrl(form.link_fotos) || null,
    };
    const { error } = editId
      ? await supabase.from('retomas').update(payload).eq('id', editId)
      : await supabase.from('retomas').insert({ ...payload, created_by: session?.user.email ?? null });
    setSaving(false);
    if (error) { toast.error('Não foi possível guardar a retoma.'); return; }
    toast.success(editId ? 'Retoma atualizada.' : 'Retoma inserida em stock.');
    setShowForm(false);
    load();
  }

  async function toggleArquivada(r: Retoma) {
    setBusyId(r.id);
    const { error } = await supabase.from('retomas')
      .update({ arquivada: !r.arquivada, arquivada_at: r.arquivada ? null : new Date().toISOString() })
      .eq('id', r.id);
    setBusyId(null);
    if (error) { toast.error('Não foi possível atualizar.'); return; }
    toast.success(r.arquivada ? 'Retoma reativada.' : 'Retoma arquivada.');
    load();
  }

  async function remove(id: string) {
    const { error } = await supabase.from('retomas').delete().eq('id', id);
    setDeleteId(null);
    if (error) { toast.error('Não foi possível eliminar.'); return; }
    toast.success('Retoma eliminada.');
    load();
  }

  return (
    <div className="space-y-3">
      {/* Toggle Ativas / Arquivadas */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="inline-flex w-full sm:w-auto rounded-md border border-border overflow-hidden">
          {(['ativas', 'arquivadas'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`flex-1 sm:flex-none px-3 py-1.5 text-xs font-medium transition-colors ${
                view === v ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'
              }`}
            >
              {v === 'ativas' ? 'Carteira ativa' : 'Arquivadas'}
              <span className={`ml-1.5 rounded-full px-1.5 text-[10px] font-semibold ${
                view === v ? 'bg-white/20' : 'bg-muted-foreground/10'
              }`}>
                {counts[v]}
              </span>
            </button>
          ))}
        </div>

        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="Marca, modelo, matrícula..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {editable && (
          <button
            onClick={openNew}
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs bg-amber-500 text-black font-semibold rounded hover:bg-amber-400 transition-colors whitespace-nowrap"
          >
            <Plus className="h-3.5 w-3.5" /> Nova retoma
          </button>
        )}
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border sticky top-0 bg-card z-10">
              <h2 className="text-sm font-semibold">{editId ? 'Editar retoma' : 'Nova retoma'}</h2>
              <button onClick={() => setShowForm(false)}><X className="h-4 w-4 text-muted-foreground" /></button>
            </div>
            <div className="p-4 sm:p-5 space-y-5">
              {/* Identificação */}
              <div>
                <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Viatura</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Marca *">
                    <input className={inputCls} value={form.marca}
                      onChange={e => setForm(p => ({ ...p, marca: e.target.value }))} />
                  </Field>
                  <Field label="Modelo *">
                    <input className={inputCls} value={form.modelo}
                      onChange={e => setForm(p => ({ ...p, modelo: e.target.value }))} />
                  </Field>
                  <Field label="Motorização">
                    <select className={inputCls} value={form.motorizacao}
                      onChange={e => setForm(p => ({ ...p, motorizacao: e.target.value as Motorizacao | '' }))}>
                      <option value="">—</option>
                      {MOTORIZACOES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  </Field>
                  <Field label="Importado">
                    <select className={inputCls} value={form.importado ? 'sim' : 'nao'}
                      onChange={e => setForm(p => ({ ...p, importado: e.target.value === 'sim' }))}>
                      <option value="nao">Não</option>
                      <option value="sim">Sim</option>
                    </select>
                  </Field>
                  <Field label="Matrícula">
                    <input className={inputCls} value={form.matricula} placeholder="00-AA-00"
                      onChange={e => setForm(p => ({ ...p, matricula: e.target.value.toUpperCase() }))} />
                  </Field>
                  <Field label="Data de matrícula">
                    <input type="date" className={inputCls} value={form.data_matricula}
                      onChange={e => setForm(p => ({ ...p, data_matricula: e.target.value }))} />
                  </Field>
                  <Field label="Quilometragem">
                    <input type="number" min={0} className={inputCls} value={form.quilometragem} placeholder="km"
                      onChange={e => setForm(p => ({ ...p, quilometragem: e.target.value }))} />
                  </Field>
                </div>
              </div>

              {/* Links */}
              <div>
                <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Links</h3>
                <div className="grid grid-cols-1 gap-3">
                  <Field label="Link Caetano">
                    <input className={inputCls} value={form.link_caetano} placeholder="https://..."
                      onChange={e => setForm(p => ({ ...p, link_caetano: e.target.value }))} />
                  </Field>
                  <Field label="Link Maxterauto">
                    <input className={inputCls} value={form.link_maxterauto} placeholder="https://..."
                      onChange={e => setForm(p => ({ ...p, link_maxterauto: e.target.value }))} />
                  </Field>
                  <Field label="Link fotos">
                    <input className={inputCls} value={form.link_fotos} placeholder="https://..."
                      onChange={e => setForm(p => ({ ...p, link_fotos: e.target.value }))} />
                  </Field>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t border-border sticky bottom-0 bg-card">
              <button onClick={() => setShowForm(false)} className="px-3 py-1.5 text-xs border border-border rounded hover:bg-muted transition-colors">Cancelar</button>
              <button onClick={save} disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-amber-500 text-black font-semibold rounded hover:bg-amber-400 disabled:opacity-50 transition-colors">
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
            <p className="text-sm font-medium">Eliminar esta retoma?</p>
            <p className="text-xs text-muted-foreground">Ação irreversível. Para tirar da carteira sem apagar, usa "arquivar".</p>
            <div className="flex justify-center gap-2">
              <button onClick={() => setDeleteId(null)} className="px-4 py-1.5 text-xs border border-border rounded hover:bg-muted">Cancelar</button>
              <button onClick={() => remove(deleteId)} className="px-4 py-1.5 text-xs bg-destructive text-white rounded hover:bg-destructive/90">Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <div className="py-16 text-center text-sm text-muted-foreground">A carregar...</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-border py-10 text-center text-xs text-muted-foreground">
          {view === 'arquivadas'
            ? 'Sem retomas arquivadas.'
            : <>Nenhuma retoma na carteira. {editable && <>Clica em <strong>Nova retoma</strong> para adicionar.</>}</>}
        </div>
      ) : (
        <>
          {/* Mobile: cartões */}
          <div className="space-y-2 sm:hidden">
            {filtered.map(r => (
              <div key={r.id} className="rounded-lg border border-border p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-sm leading-tight truncate">{r.marca} {r.modelo}</div>
                    <div className="font-mono text-xs text-muted-foreground">{r.matricula || '—'}</div>
                  </div>
                  {r.motorizacao && (
                    <span className={`flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${motCls(r.motorizacao)}`}>{motLabel(r.motorizacao)}</span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  <div>Data mat.: <span className="text-foreground/80">{dateFmt(r.data_matricula)}</span></div>
                  <div>Km: <span className="text-foreground/80">{kmFmt(r.quilometragem)}</span></div>
                  <div>Importado: <span className="text-foreground/80">{r.importado ? 'Sim' : 'Não'}</span></div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  <LinkChip url={r.link_caetano} label="Caetano" />
                  <LinkChip url={r.link_maxterauto} label="Maxter" />
                  <LinkChip url={r.link_fotos} label="Fotos" />
                </div>
                {editable && (
                  <div className="flex items-center justify-end gap-1 border-t border-border/60 pt-2">
                    <RowActions r={r} busyId={busyId} onToggle={toggleArquivada} onEdit={openEdit} onDelete={setDeleteId} />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Desktop: tabela */}
          <div className="hidden sm:block overflow-auto rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/50">
                  {['Marca', 'Modelo', 'Motor.', 'Matrícula', 'Data mat.', 'Km', 'Import.', 'Links'].map(h => (
                    <th key={h} className="px-2 py-2 text-left font-semibold text-muted-foreground whitespace-nowrap border-b border-border">{h}</th>
                  ))}
                  <th className="px-2 py-2 border-b border-border" />
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="px-2 py-1.5 whitespace-nowrap font-medium">{r.marca}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">{r.modelo}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      {r.motorizacao
                        ? <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${motCls(r.motorizacao)}`}>{motLabel(r.motorizacao)}</span>
                        : '—'}
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap font-mono">{r.matricula || '—'}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap text-foreground/80">{dateFmt(r.data_matricula)}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap text-foreground/80">{kmFmt(r.quilometragem)}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap text-foreground/80">{r.importado ? 'Sim' : 'Não'}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <LinkChip url={r.link_caetano} label="Caetano" />
                        <LinkChip url={r.link_maxterauto} label="Maxter" />
                        <LinkChip url={r.link_fotos} label="Fotos" />
                      </div>
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center justify-end gap-1">
                        <RowActions r={r} busyId={busyId} onToggle={toggleArquivada} onEdit={openEdit} onDelete={setDeleteId} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function RowActions({
  r, busyId, onToggle, onEdit, onDelete,
}: {
  r: Retoma;
  busyId: string | null;
  onToggle: (r: Retoma) => void;
  onEdit: (r: Retoma) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <>
      <button onClick={() => onToggle(r)} disabled={busyId === r.id}
        className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
        title={r.arquivada ? 'Reativar (voltar à carteira)' : 'Arquivar (sair da carteira)'}>
        {r.arquivada ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
      </button>
      <button onClick={() => onEdit(r)}
        className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="Editar">
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <button onClick={() => onDelete(r.id)}
        className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors" title="Eliminar">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </>
  );
}

const inputCls = 'w-full px-2.5 py-1.5 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-medium text-muted-foreground mb-1">{label}</label>
      {children}
    </div>
  );
}

function LinkChip({ url, label }: { url: string | null; label: string }) {
  if (!url) return <span className="text-muted-foreground/40 text-[10px]">{label}</span>;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      className="inline-flex items-center gap-0.5 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/20 transition-colors"
      onClick={e => e.stopPropagation()}>
      {label} <ExternalLink className="h-2.5 w-2.5" />
    </a>
  );
}
