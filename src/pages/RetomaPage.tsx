import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/App';
import { usePermissions } from '@/contexts/PermissionsContext';
import {
  Plus, Pencil, Trash2, X, Check, Search, Archive, ArchiveRestore, ExternalLink,
  ChevronUp, ChevronDown, ChevronsUpDown, FilterX,
} from 'lucide-react';
import { toast } from 'sonner';

/* ── Tab Retoma (admin) ────────────────────────────────────────────────────────
 * Repositório e stock de viaturas de retoma. Permite inserir/consultar retomas,
 * arquivá-las (saindo da carteira ativa) e acompanhar a antiguidade em stock —
 * indicador principal, com clusters de aging (0–30 / 31–90 / 91–120 / 121+).
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
  data_entrada_stock: string | null;
  quilometragem: number | null;
  preco: number | null;
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
  data_entrada_stock: string;
  quilometragem: string;
  preco: string;
  importado: boolean;
  link_caetano: string;
  link_maxterauto: string;
  link_fotos: string;
}

const todayISO = () => new Date().toISOString().slice(0, 10);

const EMPTY: RetomaForm = {
  marca: '', modelo: '', motorizacao: '', matricula: '', data_matricula: '',
  data_entrada_stock: '', quilometragem: '', preco: '', importado: false,
  link_caetano: '', link_maxterauto: '', link_fotos: '',
};

const MOTORIZACOES: { value: Motorizacao; label: string; cls: string }[] = [
  { value: 'ice',  label: 'ICE',  cls: 'bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300' },
  { value: 'phev', label: 'PHEV', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300' },
  { value: 'bev',  label: 'BEV',  cls: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300' },
];

const motLabel = (m: Motorizacao | null) => MOTORIZACOES.find(x => x.value === m)?.label ?? '—';
const motCls   = (m: Motorizacao | null) => MOTORIZACOES.find(x => x.value === m)?.cls ?? '';

/* ── Clusters de antiguidade (aging do stock) ──────────────────────────────── */

type ClusterKey = '0-30' | '31-90' | '91-120' | '121+';

const CLUSTERS: { key: ClusterKey; label: string; test: (a: number) => boolean; cls: string; dot: string }[] = [
  { key: '0-30',   label: '0–30 dias',   test: a => a <= 30,             cls: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300',   dot: 'bg-green-500' },
  { key: '31-90',  label: '31–90 dias',  test: a => a >= 31 && a <= 90,  cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',   dot: 'bg-amber-500' },
  { key: '91-120', label: '91–120 dias', test: a => a >= 91 && a <= 120, cls: 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300', dot: 'bg-orange-500' },
  { key: '121+',   label: '121+ dias',   test: a => a >= 121,            cls: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300',           dot: 'bg-red-500' },
];

const clusterOf = (age: number | null) =>
  age === null ? null : (CLUSTERS.find(c => c.test(age)) ?? null);

/* Antiguidade em dias: entrada em stock → hoje (ativa) ou → data de arquivo
 * (arquivada, para não continuar a "envelhecer" depois de sair da carteira). */
function ageDays(r: Retoma): number | null {
  if (!r.data_entrada_stock) return null;
  const start = new Date(`${r.data_entrada_stock}T00:00:00`).getTime();
  const end = r.arquivada && r.arquivada_at ? new Date(r.arquivada_at).getTime() : Date.now();
  return Math.max(0, Math.floor((end - start) / 86400000));
}

const kmFmt = (v: number | null) =>
  v === null || v === undefined ? '—' : `${v.toLocaleString('pt-PT')} km`;

const precoFmt = (v: number | null) =>
  v === null || v === undefined ? '—' : `${v.toLocaleString('pt-PT', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €`;

const yearOf = (v: string | null) => (v ? v.slice(0, 4) : null);

const dateFmt = (v: string | null) =>
  v ? new Date(v).toLocaleDateString('pt-PT') : '—';

const normalizeUrl = (u: string) => {
  const t = u.trim();
  if (!t) return '';
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
};

/* ── Ordenação ─────────────────────────────────────────────────────────────── */

type SortKey =
  | 'marca' | 'modelo' | 'motorizacao' | 'matricula'
  | 'data_matricula' | 'data_entrada_stock' | 'antiguidade' | 'quilometragem' | 'preco' | 'importado';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'antiguidade', label: 'Antiguidade' },
  { key: 'data_entrada_stock', label: 'Entrada em stock' },
  { key: 'preco', label: 'Preço' },
  { key: 'marca', label: 'Marca' },
  { key: 'modelo', label: 'Modelo' },
  { key: 'motorizacao', label: 'Motorização' },
  { key: 'matricula', label: 'Matrícula' },
  { key: 'data_matricula', label: 'Data matrícula' },
  { key: 'quilometragem', label: 'Quilometragem' },
  { key: 'importado', label: 'Importado' },
];

function sortValue(r: Retoma, key: SortKey): string | number {
  switch (key) {
    case 'antiguidade': return ageDays(r) ?? -1;
    case 'quilometragem': return r.quilometragem ?? -1;
    case 'preco': return r.preco ?? -1;
    case 'importado': return r.importado ? 1 : 0;
    case 'data_matricula': return r.data_matricula ?? '';
    case 'data_entrada_stock': return r.data_entrada_stock ?? '';
    case 'motorizacao': return r.motorizacao ?? '';
    default: return (r[key] as string | null)?.toLowerCase() ?? '';
  }
}

export default function RetomaPage() {
  const { session } = useAuth();
  const { canEdit } = usePermissions();
  const editable = canEdit('retoma');

  const [rows, setRows] = useState<Retoma[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'ativas' | 'arquivadas'>('ativas');

  // Filtros
  const [search, setSearch] = useState('');
  const [marcaFilter, setMarcaFilter] = useState('all');
  const [modeloFilter, setModeloFilter] = useState('all');
  const [anoFilter, setAnoFilter] = useState('all');
  const [motFilter, setMotFilter] = useState<'all' | Motorizacao>('all');
  const [clusterFilter, setClusterFilter] = useState<ClusterKey | null>(null);
  const [kmMin, setKmMin] = useState('');
  const [kmMax, setKmMax] = useState('');
  const [precoMin, setPrecoMin] = useState('');
  const [precoMax, setPrecoMax] = useState('');

  // Ordenação (por defeito: mais antigas primeiro — o que interessa no aging)
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'antiguidade', dir: 'desc' });

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
    // numeric (preco) chega como string do Postgrest — normaliza para número.
    const norm = ((data as Retoma[]) ?? []).map(r => ({
      ...r,
      preco: r.preco === null || r.preco === undefined ? null : Number(r.preco),
    }));
    setRows(norm);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const counts = useMemo(() => ({
    ativas: rows.filter(r => !r.arquivada).length,
    arquivadas: rows.filter(r => r.arquivada).length,
  }), [rows]);

  // Valores distintos para os selects (limitados à vista atual).
  const scope = useMemo(
    () => rows.filter(r => (view === 'arquivadas' ? r.arquivada : !r.arquivada)),
    [rows, view],
  );
  const marcas = useMemo(
    () => Array.from(new Set(scope.map(r => r.marca).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt')),
    [scope],
  );
  const modelos = useMemo(
    () => Array.from(new Set(
      scope.filter(r => marcaFilter === 'all' || r.marca === marcaFilter).map(r => r.modelo).filter(Boolean),
    )).sort((a, b) => a.localeCompare(b, 'pt')),
    [scope, marcaFilter],
  );
  const anos = useMemo(
    () => Array.from(new Set(scope.map(r => yearOf(r.data_matricula)).filter(Boolean) as string[]))
      .sort((a, b) => b.localeCompare(a)),
    [scope],
  );

  // KPI de aging: sempre sobre o stock ativo (independente dos outros filtros).
  const clusterStats = useMemo(() => {
    const active = rows.filter(r => !r.arquivada);
    const total = active.length;
    return CLUSTERS.map(c => {
      const n = active.filter(r => {
        const a = ageDays(r);
        return a !== null && c.test(a);
      }).length;
      return { ...c, n, pct: total ? Math.round((n / total) * 100) : 0 };
    });
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const kMin = kmMin.trim() === '' ? null : Number(kmMin);
    const kMax = kmMax.trim() === '' ? null : Number(kmMax);
    const pMin = precoMin.trim() === '' ? null : Number(precoMin);
    const pMax = precoMax.trim() === '' ? null : Number(precoMax);

    const list = rows
      .filter(r => (view === 'arquivadas' ? r.arquivada : !r.arquivada))
      .filter(r => !q ||
        r.marca?.toLowerCase().includes(q) ||
        r.modelo?.toLowerCase().includes(q) ||
        r.matricula?.toLowerCase().includes(q))
      .filter(r => marcaFilter === 'all' || r.marca === marcaFilter)
      .filter(r => modeloFilter === 'all' || r.modelo === modeloFilter)
      .filter(r => anoFilter === 'all' || yearOf(r.data_matricula) === anoFilter)
      .filter(r => motFilter === 'all' || r.motorizacao === motFilter)
      .filter(r => kMin === null || (r.quilometragem !== null && r.quilometragem >= kMin))
      .filter(r => kMax === null || (r.quilometragem !== null && r.quilometragem <= kMax))
      .filter(r => pMin === null || (r.preco !== null && r.preco >= pMin))
      .filter(r => pMax === null || (r.preco !== null && r.preco <= pMax))
      .filter(r => {
        if (!clusterFilter || view !== 'ativas') return true;
        const a = ageDays(r);
        return a !== null && CLUSTERS.find(c => c.key === clusterFilter)!.test(a);
      });

    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      const va = sortValue(a, sort.key);
      const vb = sortValue(b, sort.key);
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
  }, [rows, search, view, marcaFilter, modeloFilter, anoFilter, motFilter, kmMin, kmMax, precoMin, precoMax, clusterFilter, sort]);

  const anyFilter = !!(search || marcaFilter !== 'all' || modeloFilter !== 'all' || anoFilter !== 'all'
    || motFilter !== 'all' || clusterFilter
    || kmMin || kmMax || precoMin || precoMax);
  const clearFilters = () => {
    setSearch(''); setMarcaFilter('all'); setModeloFilter('all'); setAnoFilter('all');
    setMotFilter('all'); setClusterFilter(null);
    setKmMin(''); setKmMax(''); setPrecoMin(''); setPrecoMax('');
  };

  function toggleSort(key: SortKey) {
    setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' });
  }

  function openNew() { setForm({ ...EMPTY, data_entrada_stock: todayISO() }); setEditId(null); setShowForm(true); }
  function openEdit(r: Retoma) {
    setForm({
      marca: r.marca ?? '',
      modelo: r.modelo ?? '',
      motorizacao: r.motorizacao ?? '',
      matricula: r.matricula ?? '',
      data_matricula: r.data_matricula ?? '',
      data_entrada_stock: r.data_entrada_stock ?? '',
      quilometragem: r.quilometragem?.toString() ?? '',
      preco: r.preco?.toString() ?? '',
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
    const preco = form.preco.trim();
    if (preco && (isNaN(Number(preco)) || Number(preco) < 0)) {
      toast.error('Preço inválido.');
      return;
    }
    setSaving(true);
    const payload = {
      marca: form.marca.trim(),
      modelo: form.modelo.trim(),
      motorizacao: form.motorizacao || null,
      matricula: form.matricula.trim() || null,
      data_matricula: form.data_matricula || null,
      data_entrada_stock: form.data_entrada_stock || todayISO(),
      quilometragem: km ? Number(km) : null,
      preco: preco ? Number(preco) : null,
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
      {/* KPI: clusters de antiguidade (só na carteira ativa) */}
      {view === 'ativas' && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {clusterStats.map(c => {
            const active = clusterFilter === c.key;
            return (
              <button
                key={c.key}
                onClick={() => setClusterFilter(active ? null : c.key)}
                className={`rounded-lg border p-2.5 text-left transition-colors ${
                  active ? 'border-primary ring-1 ring-primary bg-primary/5' : 'border-border hover:bg-muted/40'
                }`}
                title={`Filtrar por ${c.label}`}
              >
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                  <span className={`h-2 w-2 rounded-full ${c.dot}`} /> {c.label}
                </div>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-xl font-bold tabular-nums">{c.n}</span>
                  <span className="text-xs text-muted-foreground">{c.pct}%</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Toggle Ativas / Arquivadas + pesquisa + inserir */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="inline-flex w-full sm:w-auto rounded-md border border-border overflow-hidden">
          {(['ativas', 'arquivadas'] as const).map(v => (
            <button
              key={v}
              onClick={() => { setView(v); if (v === 'arquivadas') setClusterFilter(null); }}
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

      {/* Filtros */}
      <div className="rounded-lg border border-border bg-muted/20 p-2.5">
        <div className="flex flex-wrap items-end gap-x-3 gap-y-2 text-xs">
          <FilterBox label="Marca">
            <select value={marcaFilter} onChange={e => { setMarcaFilter(e.target.value); setModeloFilter('all'); }} className={filterCls}>
              <option value="all">Todas</option>
              {marcas.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </FilterBox>
          <FilterBox label="Modelo">
            <select value={modeloFilter} onChange={e => setModeloFilter(e.target.value)} className={filterCls}>
              <option value="all">Todos</option>
              {modelos.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </FilterBox>
          <FilterBox label="Ano matrícula">
            <select value={anoFilter} onChange={e => setAnoFilter(e.target.value)} className={filterCls}>
              <option value="all">Todos</option>
              {anos.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </FilterBox>
          <FilterBox label="Motorização">
            <select value={motFilter} onChange={e => setMotFilter(e.target.value as 'all' | Motorizacao)} className={filterCls}>
              <option value="all">Todas</option>
              {MOTORIZACOES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </FilterBox>
          <FilterBox label="Antiguidade">
            <select
              value={view === 'ativas' ? (clusterFilter ?? 'all') : 'all'}
              onChange={e => setClusterFilter(e.target.value === 'all' ? null : e.target.value as ClusterKey)}
              disabled={view !== 'ativas'}
              className={`${filterCls} disabled:opacity-50`}
            >
              <option value="all">Todas</option>
              {CLUSTERS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </FilterBox>
          <FilterBox label="Quilometragem">
            <div className="flex items-center gap-1">
              <input type="number" min={0} placeholder="mín" value={kmMin} onChange={e => setKmMin(e.target.value)} className={`${filterCls} w-20`} />
              <span className="text-muted-foreground">–</span>
              <input type="number" min={0} placeholder="máx" value={kmMax} onChange={e => setKmMax(e.target.value)} className={`${filterCls} w-20`} />
            </div>
          </FilterBox>
          <FilterBox label="Preço (€)">
            <div className="flex items-center gap-1">
              <input type="number" min={0} placeholder="mín" value={precoMin} onChange={e => setPrecoMin(e.target.value)} className={`${filterCls} w-20`} />
              <span className="text-muted-foreground">–</span>
              <input type="number" min={0} placeholder="máx" value={precoMax} onChange={e => setPrecoMax(e.target.value)} className={`${filterCls} w-20`} />
            </div>
          </FilterBox>

          {/* Ordenação (mobile, onde não há cabeçalhos clicáveis) */}
          <FilterBox label="Ordenar" className="sm:hidden">
            <div className="flex items-center gap-1">
              <select value={sort.key} onChange={e => setSort(s => ({ ...s, key: e.target.value as SortKey }))} className={filterCls}>
                {SORT_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
              <button onClick={() => setSort(s => ({ ...s, dir: s.dir === 'asc' ? 'desc' : 'asc' }))} className={`${filterCls} inline-flex items-center`} title="Inverter ordem">
                {sort.dir === 'asc' ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
            </div>
          </FilterBox>
        </div>

        <div className="mt-2 flex items-center gap-3 text-xs">
          {anyFilter && (
            <button onClick={clearFilters} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
              <FilterX className="h-3.5 w-3.5" /> Limpar filtros
            </button>
          )}
          <span className="ml-auto text-muted-foreground">{filtered.length} {filtered.length === 1 ? 'retoma' : 'retomas'}</span>
        </div>
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
              {/* Viatura */}
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
                  <Field label="Data de entrada em stock">
                    <input type="date" className={inputCls} value={form.data_entrada_stock}
                      onChange={e => setForm(p => ({ ...p, data_entrada_stock: e.target.value }))} />
                  </Field>
                  <Field label="Quilometragem">
                    <input type="number" min={0} className={inputCls} value={form.quilometragem} placeholder="km"
                      onChange={e => setForm(p => ({ ...p, quilometragem: e.target.value }))} />
                  </Field>
                  <Field label="Preço (€)">
                    <input type="number" min={0} step="0.01" className={inputCls} value={form.preco} placeholder="€"
                      onChange={e => setForm(p => ({ ...p, preco: e.target.value }))} />
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
          {anyFilter
            ? 'Sem retomas para os filtros aplicados.'
            : view === 'arquivadas'
              ? 'Sem retomas arquivadas.'
              : <>Nenhuma retoma na carteira. {editable && <>Clica em <strong>Nova retoma</strong> para adicionar.</>}</>}
        </div>
      ) : (
        <>
          {/* Mobile: cartões */}
          <div className="space-y-2 sm:hidden">
            {filtered.map(r => {
              const age = ageDays(r);
              const cl = clusterOf(age);
              return (
                <div key={r.id} className="rounded-lg border border-border p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-sm leading-tight truncate">{r.marca} {r.modelo}</div>
                      <div className="font-mono text-xs text-muted-foreground">{r.matricula || '—'}</div>
                    </div>
                    <div className="flex flex-shrink-0 flex-col items-end gap-1">
                      {r.motorizacao && (
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${motCls(r.motorizacao)}`}>{motLabel(r.motorizacao)}</span>
                      )}
                      {age !== null && (
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${cl?.cls ?? ''}`}>{age} dias</span>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    <div>Entrada: <span className="text-foreground/80">{dateFmt(r.data_entrada_stock)}</span></div>
                    <div>Data mat.: <span className="text-foreground/80">{dateFmt(r.data_matricula)}</span></div>
                    <div>Km: <span className="text-foreground/80">{kmFmt(r.quilometragem)}</span></div>
                    <div>Preço: <span className="font-medium text-foreground/90">{precoFmt(r.preco)}</span></div>
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
              );
            })}
          </div>

          {/* Desktop: tabela */}
          <div className="hidden sm:block overflow-auto rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/50">
                  <SortableTh label="Marca" k="marca" sort={sort} onSort={toggleSort} />
                  <SortableTh label="Modelo" k="modelo" sort={sort} onSort={toggleSort} />
                  <SortableTh label="Motor." k="motorizacao" sort={sort} onSort={toggleSort} />
                  <SortableTh label="Matrícula" k="matricula" sort={sort} onSort={toggleSort} />
                  <SortableTh label="Data mat." k="data_matricula" sort={sort} onSort={toggleSort} />
                  <SortableTh label="Entrada stock" k="data_entrada_stock" sort={sort} onSort={toggleSort} />
                  <SortableTh label="Antiguidade" k="antiguidade" sort={sort} onSort={toggleSort} />
                  <SortableTh label="Km" k="quilometragem" sort={sort} onSort={toggleSort} />
                  <SortableTh label="Preço" k="preco" sort={sort} onSort={toggleSort} />
                  <SortableTh label="Import." k="importado" sort={sort} onSort={toggleSort} />
                  <th className="px-2 py-2 text-left font-semibold text-muted-foreground whitespace-nowrap border-b border-border">Links</th>
                  <th className="px-2 py-2 border-b border-border" />
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => {
                  const age = ageDays(r);
                  const cl = clusterOf(age);
                  return (
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
                      <td className="px-2 py-1.5 whitespace-nowrap text-foreground/80">{dateFmt(r.data_entrada_stock)}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        {age !== null
                          ? <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${cl?.cls ?? ''}`}>{age} dias</span>
                          : '—'}
                      </td>
                      <td className="px-2 py-1.5 whitespace-nowrap text-foreground/80">{kmFmt(r.quilometragem)}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap font-medium text-foreground/90">{precoFmt(r.preco)}</td>
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
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

const inputCls = 'w-full px-2.5 py-1.5 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary';
const filterCls = 'px-2.5 py-1.5 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary';

function SortableTh({
  label, k, sort, onSort,
}: {
  label: string; k: SortKey; sort: { key: SortKey; dir: 'asc' | 'desc' }; onSort: (k: SortKey) => void;
}) {
  const active = sort.key === k;
  return (
    <th className="px-2 py-2 text-left font-semibold text-muted-foreground whitespace-nowrap border-b border-border">
      <button onClick={() => onSort(k)} className="inline-flex items-center gap-0.5 hover:text-foreground transition-colors">
        {label}
        {active
          ? (sort.dir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)
          : <ChevronsUpDown className="h-3 w-3 opacity-40" />}
      </button>
    </th>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-medium text-muted-foreground mb-1">{label}</label>
      {children}
    </div>
  );
}

function FilterBox({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      {children}
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
