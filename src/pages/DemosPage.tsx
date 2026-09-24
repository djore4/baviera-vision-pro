import { useState, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/App';
import { usePermissions } from '@/contexts/PermissionsContext';
import {
  Search, X, MapPin, Gauge, Calendar, ExternalLink, Share2, Copy,
  ChevronUp, ChevronDown, ChevronsUpDown, RotateCcw, ImageOff,
  Camera, Trash2, Loader2,
} from 'lucide-react';
import bmwLogo from '@/assets/bmw-logo.png';
import { chassisCurto, formatMatricula } from '@/lib/viaturaFormat';
import { calcPricing, tipoFlags, type Pricing, type PricingInputs, type Tipo } from '@/lib/demoPricing';

/* ── Parque de demonstradores (VN · Demos) ────────────────────────────────────
 * Consulta, apenas leitura, do parque de viaturas partilhado com a plataforma
 * Caetano (mesmo Supabase, tabela `viaturas`). Os preços são recalculados em
 * runtime a partir de `inputs`, segundo o racional do Excel "PARQUE BMW"
 * (ver lib/demoPricing.ts) — a tabela mostra a decomposição completa.
 * ──────────────────────────────────────────────────────────────────────────── */

interface Viatura {
  chassis: string;
  matricula: string | null;
  modelo: string | null;
  versao: string | null;
  encomenda: string | null;
  estado_entrega: string | null;
  data_matricula: string | null;
  tipologia: unknown;
  local: unknown;
  marca: string | null;
  estado_negocio: string | null;
  link_fotos: string | null;
  observacoes: string | null;
  kms: number | null;
  reserva_expira: string | null;
  reserva_user: string | null;
  inputs: unknown;
  stats: unknown;
}

const TEMPLATE_INPUTS: PricingInputs = {
  pvb: 0, opc: 0, bsi: 0, eco: 4.2, leg: 1550, isv: 0,
  mgb: 0, esf: 0, pac: 0, dem: 0, sup: 0, pvp_desc: 0, depreciacoes: 0,
};

/* Normaliza campos que podem vir como array, string JSON ou CSV. */
function getArr(v: unknown): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v as string[];
  if (typeof v === 'string') {
    try { const p = JSON.parse(v); return Array.isArray(p) ? p : [v]; }
    catch { return v.includes(',') ? v.split(',').map(s => s.trim()) : [v]; }
  }
  return [];
}

function getInps(v: unknown): PricingInputs {
  if (!v) return { ...TEMPLATE_INPUTS };
  if (typeof v === 'string') {
    try { return { ...TEMPLATE_INPUTS, ...JSON.parse(v) }; } catch { return { ...TEMPLATE_INPUTS }; }
  }
  return typeof v === 'object' ? { ...TEMPLATE_INPUTS, ...(v as Partial<PricingInputs>) } : { ...TEMPLATE_INPUTS };
}

function idadeDias(dataMatricula: string | null): number {
  if (!dataMatricula) return 0;
  const diff = Date.now() - new Date(dataMatricula).getTime();
  return diff > 0 ? Math.floor(diff / (1000 * 60 * 60 * 24)) : 0;
}

function isReservado(v: Viatura): boolean {
  return !!v.reserva_expira && new Date(v.reserva_expira).getTime() > Date.now();
}

const eur = (n: number | null | undefined) =>
  (n || 0).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const eur0 = (n: number | null | undefined) =>
  (n || 0).toLocaleString('pt-PT', { maximumFractionDigits: 0 }) + ' €';
const perc = (n: number | null | undefined) =>
  ((n || 0) * 100).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' %';
const perc1 = (n: number | null | undefined) =>
  ((n || 0) * 100).toLocaleString('pt-PT', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' %';

interface Row extends Viatura {
  _inps: PricingInputs; _p: Pricing; _idade: number;
  _local: string; _tipologia: string[]; _tipo: Tipo;
}

/* ── Colunas (espelham o Excel "PARQUE BMW") ──────────────────────────────── */
type Group = 'id' | 'preco' | 'desc' | 'custo' | 'venda';
const GROUPS: { key: Group; label: string }[] = [
  { key: 'id', label: 'Viatura' },
  { key: 'preco', label: 'Preço de tabela' },
  { key: 'desc', label: 'Descontos / apoios' },
  { key: 'custo', label: 'Custo & margem' },
  { key: 'venda', label: 'Venda' },
];

interface Col {
  key: string;
  label: string;
  title?: string;
  group: Group;
  align?: 'right' | 'center';
  sort: (r: Row) => string | number;
  cell: (r: Row, reservado: boolean) => ReactNode;
  cls?: string;
}

const muted = (v: number, fmt: (n: number) => string) =>
  v ? fmt(v) : <span className="text-muted-foreground/40">—</span>;
const money = (get: (r: Row) => number): Pick<Col, 'align' | 'sort' | 'cell' | 'cls'> => ({
  align: 'right', sort: get, cell: r => muted(get(r), eur0), cls: 'text-muted-foreground',
});
const pct = (get: (r: Row) => number): Pick<Col, 'align' | 'sort' | 'cell' | 'cls'> => ({
  align: 'right', sort: get, cell: r => muted(get(r), perc1), cls: 'text-muted-foreground',
});
const text = (get: (r: Row) => string | null): Pick<Col, 'sort' | 'cell'> => ({
  sort: r => (get(r) ?? '').toLowerCase(), cell: r => get(r) || '—',
});

const TIPO_TAGS: { k: keyof Tipo; label: string }[] = [
  { k: 'ice', label: 'ICE' }, { k: 'xev', label: 'xEV' }, { k: 'bev', label: 'BEV' },
  { k: 'qor', label: 'QoR' }, { k: 'm', label: 'M' },
];

const COLS: Col[] = [
  {
    key: 'local', label: 'Local', group: 'id', align: 'center',
    sort: r => r._local.toLowerCase(),
    cell: r => <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-[10px] font-semibold border border-border">{r._local}</span>,
  },
  { key: 'modelo', label: 'Modelo', group: 'id', ...text(r => r.modelo), cell: () => null /* render dedicado */ },
  { key: 'versao', label: 'Versão', group: 'id', ...text(r => r.versao), cls: 'text-muted-foreground' },
  { key: 'encomenda', label: 'Enc', group: 'id', ...text(r => r.encomenda), cls: 'text-muted-foreground font-mono' },
  { key: 'chassis', label: 'Chassis', title: 'Últimos 7 caracteres', group: 'id', ...text(r => chassisCurto(r.chassis)), cls: 'text-muted-foreground font-mono uppercase' },
  { key: 'matricula', label: 'Matrícula', group: 'id', ...text(r => formatMatricula(r.matricula)), cls: 'text-foreground/80 font-mono uppercase font-medium' },
  {
    key: 'data_matricula', label: 'Data', group: 'id', align: 'center', cls: 'text-muted-foreground',
    sort: r => r.data_matricula ? new Date(r.data_matricula).getTime() : 0,
    cell: r => r.data_matricula ? new Date(r.data_matricula).toLocaleDateString('pt-PT') : '—',
  },
  { key: 'idade', label: 'Idade', group: 'id', align: 'center', sort: r => r._idade, cell: r => <AgeBadge dias={r._idade} /> },
  {
    key: 'tipo', label: 'Tipo', title: 'ICE · xEV · BEV · QoR · M', group: 'id', align: 'center',
    sort: r => TIPO_TAGS.filter(t => r._tipo[t.k]).map(t => t.label).join(' '),
    cell: r => {
      const tags = TIPO_TAGS.filter(t => r._tipo[t.k]);
      if (!tags.length) return <span className="text-muted-foreground/40">—</span>;
      return (
        <span className="inline-flex gap-0.5">
          {tags.map(t => (
            <span key={t.k} className="px-1 py-0.5 rounded bg-bmw-blue/10 text-bmw-blue text-[9px] font-bold">{t.label}</span>
          ))}
        </span>
      );
    },
  },

  { key: 'pvb', label: 'PVB', title: 'Preço base', group: 'preco', ...money(r => r._inps.pvb) },
  { key: 'opc', label: 'OPC', title: 'Opcionais', group: 'preco', ...money(r => r._inps.opc) },
  { key: 'bsi', label: 'BSI', group: 'preco', ...money(r => r._inps.bsi) },
  { key: 'pen', label: '%', title: 'Penetração de opcionais (OPC / PVB)', group: 'preco', ...pct(r => r._p.penetracao) },
  { key: 'eco', label: 'ECO', group: 'preco', ...money(r => r._inps.eco) },
  { key: 'leg', label: 'LEG/TR', title: 'Legalização / transporte', group: 'preco', ...money(r => r._inps.leg) },
  { key: 'isv', label: 'ISV', group: 'preco', ...money(r => r._inps.isv) },
  {
    key: 'pvp', label: 'PVP', title: '(PVB + OPC + BSI + ECO + LEG/TR + ISV) × 1,23', group: 'preco', align: 'right',
    sort: r => r._p.pvp, cls: 'text-muted-foreground line-through',
    cell: r => r._p.pvp > 0 ? eur0(r._p.pvp) : '—',
  },

  { key: 'mgb', label: 'MGB', group: 'desc', ...pct(r => r._inps.mgb) },
  { key: 'esf', label: 'ESF', group: 'desc', ...pct(r => r._inps.esf) },
  { key: 'pac', label: 'PAC', group: 'desc', ...pct(r => r._inps.pac) },
  { key: 'dem', label: 'DEM', group: 'desc', ...pct(r => r._inps.dem) },
  { key: 'sup', label: 'SUP', group: 'desc', ...pct(r => r._inps.sup) },
  {
    key: 'dsc', label: 'DSC €', title: '(PVB + OPC) × (MGB + ESF + PAC + DEM + SUP)', group: 'desc', align: 'right',
    sort: r => r._p.desc_eur, cls: 'text-red-600 font-medium',
    cell: r => r._p.desc_eur ? eur0(r._p.desc_eur) : <span className="text-muted-foreground/40">—</span>,
  },

  { key: 'iva', label: 'IVA', title: '(PVB + OPC − DSC + ECO + LEG/TR + ISV) × 23%', group: 'custo', ...money(r => r._p.iva) },
  {
    key: 'p_custo', label: 'P Custo', title: 'PVB + OPC − DSC + ECO + LEG/TR + ISV + IVA', group: 'custo', align: 'right',
    sort: r => r._p.p_custo, cls: 'text-foreground font-medium',
    cell: r => r._p.p_custo > 0 ? eur0(r._p.p_custo) : '—',
  },
  { key: 'dep', label: 'DEP', title: 'Depreciações', group: 'custo', ...money(r => r._inps.depreciacoes) },
  {
    key: 'margem', label: 'Margem', title: 'PVP DESC − P Custo + DEP', group: 'custo', align: 'right',
    sort: r => (r._p.pvp_desc > 0 ? r._p.margem : -Infinity),
    cell: r => r._p.pvp_desc > 0
      ? <span className={`font-bold ${r._p.margem < 0 ? 'text-red-600' : 'text-green-600'}`}>{eur0(r._p.margem)}</span>
      : <span className="text-muted-foreground/40">—</span>,
  },

  {
    key: 'pvp_desc', label: 'PVP Desc', title: 'Preço de venda (com IVA)', group: 'venda', align: 'right',
    sort: r => r._p.pvp_desc,
    cell: (r, reservado) => r._p.pvp_desc > 0
      ? <span className={`font-bold ${reservado ? 'text-red-600' : 'text-bmw-blue'}`}>{eur0(r._p.pvp_desc)}</span>
      : '—',
  },
  {
    key: 'pvp_siva', label: 'PVP s/IVA', title: 'xEV/BEV: PVP DESC / 1,23 (IVA dedutível) · ICE: PVP DESC', group: 'venda', align: 'right',
    sort: r => r._p.pvp_sem_iva, cls: 'text-foreground/80 font-medium',
    cell: r => r._p.pvp_desc > 0 ? eur0(r._p.pvp_sem_iva) : '—',
  },
];

const DESC_FIRST = new Set(['pvp', 'pvp_desc', 'pvp_siva', 'margem', 'idade', 'dsc', 'p_custo']);

/* Primeira coluna de cada grupo leva separador vertical. */
const GROUP_START = new Set(COLS.filter((c, i) => i > 0 && COLS[i - 1].group !== c.group).map(c => c.key));

function AgeBadge({ dias }: { dias: number }) {
  const cls = dias <= 90
    ? 'border-green-500/40 text-green-600 bg-green-500/10'
    : dias <= 180
      ? 'border-yellow-500/40 text-yellow-600 bg-yellow-500/10'
      : 'border-red-500/40 text-red-600 bg-red-500/10';
  return (
    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold border ${cls}`}>
      {dias === 0 ? 'Novo' : `${dias} dias`}
    </span>
  );
}

export default function DemosPage() {
  const { session } = useAuth();
  const { canEdit } = usePermissions();
  const [rows, setRows] = useState<Row[]>([]);
  const [capas, setCapas] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [fModelo, setFModelo] = useState('Todos');
  // Por defeito, o parque abre filtrado por Aveiro.
  const [fLocal, setFLocal] = useState('Aveiro');
  const localInit = useRef(false);
  const [fTipologia, setFTipologia] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);
  const [selected, setSelected] = useState<Row | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const [viaturasRes, capasRes] = await Promise.all([
        supabase.from('viaturas').select('*'),
        supabase.from('demo_capas').select('chassis, url'),
      ]);
      if (!alive) return;
      if (viaturasRes.error) { setError(viaturasRes.error.message); setRows([]); setLoading(false); return; }
      const mapped: Row[] = ((viaturasRes.data as Viatura[]) ?? []).map(v => {
        const tipologia = getArr(v.tipologia);
        const tipo = tipoFlags(tipologia);
        const inps = getInps(v.inputs);
        return {
          ...v,
          _inps: inps,
          _p: calcPricing(inps, tipo),
          _idade: idadeDias(v.data_matricula),
          _local: getArr(v.local).join(', ') || '—',
          _tipologia: tipologia,
          _tipo: tipo,
        };
      });
      const capaMap: Record<string, string> = {};
      for (const c of (capasRes.data as { chassis: string; url: string }[]) ?? []) {
        if (c.chassis && c.url) capaMap[c.chassis] = c.url;
      }
      setRows(mapped);
      setCapas(capaMap);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  const handleCapaChange = (chassis: string, url: string | null) =>
    setCapas(prev => {
      const next = { ...prev };
      if (url) next[chassis] = url; else delete next[chassis];
      return next;
    });

  const modelos = useMemo(() => ['Todos', ...[...new Set(rows.map(r => (r.modelo ?? '').trim()).filter(Boolean))].sort()], [rows]);
  const locais = useMemo(() => ['Todas', ...[...new Set(rows.flatMap(r => getArr(r.local)))].sort()], [rows]);
  const tipologias = useMemo(() => [...new Set(rows.flatMap(r => r._tipologia))].sort(), [rows]);

  // Se o parque não tiver "Aveiro" (default), reverte para "Todas" — só uma vez,
  // para não mostrar uma tabela vazia por causa do filtro inicial.
  useEffect(() => {
    if (localInit.current || rows.length === 0) return;
    localInit.current = true;
    if (fLocal === 'Aveiro' && !locais.includes('Aveiro')) setFLocal('Todas');
  }, [rows, locais, fLocal]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = rows.filter(r => {
      if (fModelo !== 'Todos' && (r.modelo ?? '').trim() !== fModelo) return false;
      if (fLocal !== 'Todas' && !getArr(r.local).includes(fLocal)) return false;
      if (fTipologia.size && !r._tipologia.some(t => fTipologia.has(t))) return false;
      if (!q) return true;
      return [r.modelo, r.versao, r.chassis, r.matricula, formatMatricula(r.matricula), r.encomenda, r._local]
        .some(v => (v ?? '').toString().toLowerCase().includes(q));
    });

    const col = sort && COLS.find(c => c.key === sort.key);
    if (sort && col) {
      const dir = sort.dir === 'asc' ? 1 : -1;
      list.sort((a, b) => {
        const va = col.sort(a); const vb = col.sort(b);
        if (va < vb) return -1 * dir;
        if (va > vb) return 1 * dir;
        return 0;
      });
    } else {
      // Ordenação por defeito: reservados primeiro, depois idade descendente.
      list.sort((a, b) => {
        const rr = (isReservado(b) ? 1 : 0) - (isReservado(a) ? 1 : 0);
        return rr !== 0 ? rr : b._idade - a._idade;
      });
    }
    return list;
  }, [rows, search, fModelo, fLocal, fTipologia, sort]);

  // Totais do que está filtrado (como a linha de totais de uma tabela Excel).
  const totals = useMemo(() => {
    const priced = filtered.filter(r => r._p.pvp_desc > 0);
    const sum = (f: (r: Row) => number) => priced.reduce((s, r) => s + f(r), 0);
    return { n: priced.length, pvpDesc: sum(r => r._p.pvp_desc), margem: sum(r => r._p.margem), pCusto: sum(r => r._p.p_custo) };
  }, [filtered]);

  const toggleTip = (t: string) =>
    setFTipologia(prev => { const n = new Set(prev); if (n.has(t)) n.delete(t); else n.add(t); return n; });

  const toggleSort = (key: string) =>
    setSort(prev => {
      if (!prev || prev.key !== key) return { key, dir: DESC_FIRST.has(key) ? 'desc' : 'asc' };
      if (prev.dir === (DESC_FIRST.has(key) ? 'desc' : 'asc')) return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
      return null; // terceiro clique limpa
    });

  const filtersActive = !!search || fModelo !== 'Todos' || fLocal !== 'Todas' || fTipologia.size > 0;
  const resetFilters = () => {
    setSearch(''); setFModelo('Todos'); setFLocal('Todas'); setFTipologia(new Set());
  };

  const alignCls = (a?: 'right' | 'center') => a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left';
  const sepCls = (key: string) => GROUP_START.has(key) ? 'border-l border-border' : '';

  return (
    <div className="space-y-3 min-w-0 overflow-x-clip">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative w-full sm:flex-1 sm:w-auto sm:min-w-[220px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="Modelo, versão, matrícula, chassis, encomenda, local..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {filtered.length} de {rows.length} viaturas
        </span>
        {filtersActive && (
          <button
            onClick={resetFilters}
            className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-muted-foreground border border-border rounded-md hover:text-foreground hover:bg-muted transition-colors"
          >
            <RotateCcw className="h-3 w-3" /> Limpar
          </button>
        )}
      </div>

      {/* Filtros */}
      <div className="bg-card border border-border rounded-lg p-3 grid gap-3 md:grid-cols-2">
        {/* Local */}
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Local</span>
          <select
            value={fLocal}
            onChange={e => setFLocal(e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {locais.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </label>

        {/* Modelo */}
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Modelo</span>
          <select
            value={fModelo}
            onChange={e => setFModelo(e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {modelos.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </label>

        {/* Tipologia */}
        {tipologias.length > 0 && (
          <div className="flex flex-col gap-1.5 md:col-span-2">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Tipologia</span>
            <div className="flex flex-wrap gap-1.5">
              {tipologias.map(t => {
                const on = fTipologia.has(t);
                return (
                  <button
                    key={t}
                    onClick={() => toggleTip(t)}
                    aria-pressed={on}
                    className={`px-3 py-1 text-[11px] font-semibold rounded-md border transition-colors ${
                      on ? 'bg-bmw-blue text-white border-bmw-blue' : 'bg-background text-muted-foreground border-border hover:text-foreground hover:border-bmw-blue/50'
                    }`}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </div>
        )}

      </div>

      {error && (
        <div className="px-3 py-2 bg-destructive/10 text-destructive text-xs rounded border border-destructive/20">
          Erro ao carregar o parque: {error}
        </div>
      )}

      {/* Tabela */}
      {loading ? (
        <div className="py-16 text-center text-sm text-muted-foreground">A carregar parque...</div>
      ) : (
        <div className="overflow-auto rounded-lg border border-border">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/30">
                {GROUPS.map((g, i) => (
                  <th
                    key={g.key}
                    colSpan={COLS.filter(c => c.group === g.key).length}
                    className={`px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80 text-center whitespace-nowrap border-b border-border ${i > 0 ? 'border-l' : ''}`}
                  >
                    {g.label}
                  </th>
                ))}
              </tr>
              <tr className="bg-muted/50">
                {COLS.map(c => {
                  const active = sort?.key === c.key;
                  return (
                    <th
                      key={c.key}
                      onClick={() => toggleSort(c.key)}
                      title={c.title}
                      className={`px-2.5 py-2 font-semibold text-muted-foreground whitespace-nowrap border-b border-border transition-colors cursor-pointer select-none hover:text-foreground ${alignCls(c.align)} ${sepCls(c.key)}`}
                    >
                      <span className={`inline-flex items-center gap-1 ${c.align === 'right' ? 'flex-row-reverse' : ''}`}>
                        {c.label}
                        {active
                          ? (sort!.dir === 'asc' ? <ChevronUp className="h-3 w-3 text-bmw-blue" /> : <ChevronDown className="h-3 w-3 text-bmw-blue" />)
                          : <ChevronsUpDown className="h-3 w-3 opacity-30" />}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const reservado = isReservado(r);
                return (
                  <tr
                    key={r.chassis}
                    onClick={() => setSelected(r)}
                    className={`border-b border-border/50 cursor-pointer transition-colors ${reservado ? 'bg-yellow-500/5 hover:bg-yellow-500/10' : 'hover:bg-muted/30'}`}
                  >
                    {COLS.map(c => c.key === 'modelo' ? (
                      <td key={c.key} className="px-2.5 py-1.5 font-semibold text-foreground whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5">
                          {capas[r.chassis] && (
                            <img src={capas[r.chassis]} alt="" className="h-5 w-7 rounded object-cover border border-border shrink-0" loading="lazy" />
                          )}
                          {r.modelo || '—'}
                        </span>
                        {reservado && (
                          <span className="ml-1.5 bg-yellow-400/90 text-yellow-950 text-[8px] font-bold px-1 py-0.5 rounded uppercase tracking-wider">Negociação</span>
                        )}
                      </td>
                    ) : (
                      <td key={c.key} className={`px-2.5 py-1.5 whitespace-nowrap ${alignCls(c.align)} ${c.cls ?? ''} ${sepCls(c.key)}`}>
                        {c.cell(r, reservado)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
            {totals.n > 0 && (
              <tfoot>
                <tr className="bg-muted/50 font-semibold">
                  {COLS.map(c => {
                    const v = c.key === 'p_custo' ? eur0(totals.pCusto)
                      : c.key === 'margem' ? eur0(totals.margem)
                      : c.key === 'pvp_desc' ? eur0(totals.pvpDesc)
                      : c.key === 'modelo' ? `Total (${totals.n} com preço)`
                      : c.key === 'dep' ? 'Σ'
                      : '';
                    const tone = c.key === 'margem' ? (totals.margem < 0 ? 'text-red-600' : 'text-green-600')
                      : c.key === 'pvp_desc' ? 'text-bmw-blue' : 'text-muted-foreground';
                    return (
                      <td key={c.key} className={`px-2.5 py-2 whitespace-nowrap ${alignCls(c.align)} ${tone} ${sepCls(c.key)}`}>{v}</td>
                    );
                  })}
                </tr>
              </tfoot>
            )}
          </table>
          {filtered.length === 0 && (
            <div className="py-10 text-center text-xs text-muted-foreground">Nenhuma viatura encontrada.</div>
          )}
        </div>
      )}

      {selected && (
        <ShareCard
          row={selected}
          capa={capas[selected.chassis]}
          canEdit={canEdit('demos')}
          email={session?.user.email ?? null}
          onCapaChange={handleCapaChange}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

/* ── Cartão de partilha / detalhe ─────────────────────────────────────────────*/
function shareText(r: Row): string {
  const L: string[] = [];
  L.push(`🚗 ${[r.modelo, r.versao].filter(Boolean).join(' ')}`.trim());
  const meta = [r._local !== '—' ? `📍 ${r._local}` : '', r._tipologia.join('/')].filter(Boolean).join(' · ');
  if (meta) L.push(meta);
  if (r.matricula) L.push(`Matrícula: ${formatMatricula(r.matricula)}`);
  L.push(`Kms: ${(r.kms ?? 0).toLocaleString('pt-PT')} · ${r._idade} dias`);
  if (r._p.pvp > 0) L.push(`PVP: ${eur(r._p.pvp)}`);
  if (r._p.desc_eur > 0) L.push(`Desconto: ${eur(r._p.desc_eur)} (${perc(r._p.desc_perc)})`);
  if (r._p.pvp_desc > 0) L.push(`💰 PVP Final: ${eur(r._p.pvp_desc)}`);
  if (r.link_fotos && r.link_fotos.trim() !== '') L.push(`📷 Fotos: ${r.link_fotos}`);
  return L.join('\n');
}

function ShareCard({ row, capa, canEdit, email, onCapaChange, onClose }: {
  row: Row;
  capa?: string;
  canEdit: boolean;
  email: string | null;
  onCapaChange: (chassis: string, url: string | null) => void;
  onClose: () => void;
}) {
  const inps = row._inps;
  const s = row._p;
  const reservado = isReservado(row);
  // Foto automática (og:image do link). undefined = a carregar; null = indisponível.
  const [autoPhoto, setAutoPhoto] = useState<string | null | undefined>(undefined);
  const [imgError, setImgError] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // A capa manual (upload) tem prioridade; só se procura a automática sem capa.
  useEffect(() => {
    let alive = true;
    setImgError(false);
    if (capa) { setAutoPhoto(undefined); return; }
    const link = row.link_fotos?.trim();
    if (!link) { setAutoPhoto(null); return; }
    setAutoPhoto(undefined);
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('foto-preview', { body: { url: link } });
        if (!alive) return;
        setAutoPhoto(error ? null : ((data as { image?: string | null })?.image ?? null));
      } catch { if (alive) setAutoPhoto(null); }
    })();
    return () => { alive = false; };
  }, [row.link_fotos, capa]);

  const finalUrl = capa ?? (typeof autoPhoto === 'string' ? autoPhoto : null);
  const photoLoading = !capa && autoPhoto === undefined && !!row.link_fotos?.trim();

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Escolhe um ficheiro de imagem.'); return; }
    if (file.size > 8 * 1024 * 1024) { toast.error('Imagem demasiado grande (máx. 8 MB).'); return; }
    setUploading(true);
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
      const safe = row.chassis.replace(/[^a-zA-Z0-9._-]/g, '_');
      const key = `${safe}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('demo-capas').upload(key, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('demo-capas').getPublicUrl(key);
      const url = pub.publicUrl;
      const { error: dbErr } = await supabase.from('demo_capas')
        .upsert({ chassis: row.chassis, url, updated_by: email, updated_at: new Date().toISOString() });
      if (dbErr) throw dbErr;
      onCapaChange(row.chassis, url);
      setImgError(false);
      toast.success('Foto de capa atualizada.');
    } catch (err) {
      toast.error('Falha ao carregar a foto: ' + (err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function removerCapa() {
    setUploading(true);
    try {
      const { error } = await supabase.from('demo_capas').delete().eq('chassis', row.chassis);
      if (error) throw error;
      onCapaChange(row.chassis, null);
      toast.success('Foto removida.');
    } catch (err) {
      toast.error('Falha ao remover: ' + (err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function partilhar() {
    const text = shareText(row);
    try {
      if (navigator.share) { await navigator.share({ title: [row.modelo, row.versao].filter(Boolean).join(' '), text }); return; }
    } catch { return; /* utilizador cancelou */ }
    try { await navigator.clipboard.writeText(text); toast.success('Resumo copiado para a área de transferência.'); }
    catch { toast.error('Não foi possível copiar.'); }
  }

  async function copiar() {
    try { await navigator.clipboard.writeText(shareText(row)); toast.success('Resumo copiado.'); }
    catch { toast.error('Não foi possível copiar.'); }
  }

  const line = (label: string, value: string, opts?: { strong?: boolean; className?: string }) => (
    <div className="flex justify-between items-center py-1">
      <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">{label}</span>
      <span className={`text-xs ${opts?.strong ? 'font-black' : 'font-semibold'} ${opts?.className ?? 'text-foreground'}`}>{value}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Hero / foto */}
        <div className="relative">
          <div className="aspect-[16/9] w-full bg-gradient-to-br from-bmw-navy to-bmw-blue overflow-hidden flex items-center justify-center">
            {photoLoading ? (
              <div className="animate-pulse text-white/70 text-xs">A obter foto...</div>
            ) : finalUrl && !imgError ? (
              <img
                src={finalUrl}
                alt={`${row.modelo ?? ''} ${row.versao ?? ''}`}
                className="w-full h-full object-cover"
                onError={() => setImgError(true)}
              />
            ) : (
              <div className="flex flex-col items-center gap-2 text-white/90">
                <img src={bmwLogo} alt="BMW" className="h-12 w-12 opacity-90" />
                <span className="text-lg font-black tracking-tight text-center px-4">{[row.modelo, row.versao].filter(Boolean).join(' ')}</span>
                {canEdit
                  ? <span className="flex items-center gap-1 text-[10px] text-white/70"><Camera className="h-3 w-3" /> define uma foto de capa</span>
                  : row.link_fotos && <span className="flex items-center gap-1 text-[10px] text-white/60"><ImageOff className="h-3 w-3" /> sem foto de capa</span>}
              </div>
            )}
          </div>
          <button onClick={onClose} className="absolute top-2 right-2 bg-black/40 hover:bg-black/60 text-white rounded-full p-1.5 transition-colors">
            <X className="h-4 w-4" />
          </button>

          {/* Controlo de capa (admin/edição) */}
          {canEdit && (
            <div className="absolute top-2 left-2 flex items-center gap-1.5">
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-1 bg-black/45 hover:bg-black/65 text-white text-[11px] font-semibold rounded-full px-2.5 py-1 transition-colors disabled:opacity-60"
                title="Carregar foto de capa"
              >
                {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                {capa ? 'Alterar foto' : 'Definir foto'}
              </button>
              {capa && !uploading && (
                <button
                  onClick={removerCapa}
                  className="bg-black/45 hover:bg-red-600/80 text-white rounded-full p-1.5 transition-colors"
                  title="Remover foto de capa"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
          <div className="absolute bottom-2 left-2 flex items-center gap-1.5 flex-wrap">
            {reservado
              ? <span className="px-2 py-0.5 rounded bg-yellow-400 text-yellow-950 text-[10px] font-bold uppercase tracking-wider shadow">Em negociação</span>
              : <span className="px-2 py-0.5 rounded bg-green-500 text-white text-[10px] font-bold uppercase tracking-wider shadow">Disponível</span>}
            {row._tipologia.map(t => (
              <span key={t} className="px-2 py-0.5 rounded bg-white/90 text-bmw-navy text-[10px] font-bold uppercase tracking-wider shadow">{t}</span>
            ))}
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Cabeçalho */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-foreground leading-tight">{[row.modelo, row.versao].filter(Boolean).join(' ') || '—'}</h2>
              <p className="text-xs text-muted-foreground font-mono uppercase mt-0.5 flex items-center gap-2 flex-wrap">
                {row.matricula ? formatMatricula(row.matricula) : chassisCurto(row.chassis)}
                <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{row._local}</span>
              </p>
            </div>
            <div className="text-right shrink-0">
              <div className={`text-xl font-black ${reservado ? 'text-red-600' : 'text-bmw-blue'}`}>
                {s.pvp_desc > 0 ? eur0(s.pvp_desc) : 'N/A'}
              </div>
              {s.pvp > 0 && s.pvp > s.pvp_desc && (
                <div className="text-[11px] text-muted-foreground line-through">{eur0(s.pvp)}</div>
              )}
            </div>
          </div>

          {/* Meta */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-muted/40 rounded-lg p-2">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center justify-center gap-1"><Gauge className="h-3 w-3" />Kms</div>
              <div className="text-sm font-bold text-foreground mt-0.5">{(row.kms ?? 0).toLocaleString('pt-PT')}</div>
            </div>
            <div className="bg-muted/40 rounded-lg p-2">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center justify-center gap-1"><Calendar className="h-3 w-3" />Matrícula</div>
              <div className="text-sm font-bold text-foreground mt-0.5">{row.data_matricula ? new Date(row.data_matricula).toLocaleDateString('pt-PT') : '—'}</div>
            </div>
            <div className="bg-muted/40 rounded-lg p-2">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Idade</div>
              <div className="text-sm font-bold text-foreground mt-0.5">{row._idade} dias</div>
            </div>
          </div>

          {row.estado_entrega && row.estado_entrega.trim() !== '' && (
            <div className={`text-center text-xs font-bold py-2 rounded-lg border ${
              row.estado_entrega.toLowerCase().includes('imediata')
                ? 'bg-green-500/10 text-green-600 border-green-500/30'
                : 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30'
            }`}>
              Entrega: {row.estado_entrega}
            </div>
          )}

          {/* Decomposição de preço */}
          <div className="border border-border rounded-lg p-3">
            <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Decomposição de preço</h3>
            {line('Preço Base (PVB)', eur(inps.pvb))}
            {line('Opcionais (OPC)', eur(inps.opc))}
            {line('BSI', eur(inps.bsi))}
            {line('ECO', eur(inps.eco))}
            {line('Legalização', eur(inps.leg))}
            {line('ISV', eur(inps.isv))}
            <div className="border-t border-border my-1" />
            {line('PVP', eur(s.pvp), { strong: true })}
            {line(`Desconto (${perc(s.desc_perc)})`, '- ' + eur(s.desc_eur), { className: 'text-red-600' })}
            {line('IVA (s/ custo)', eur(s.iva))}
            {line('Preço de custo', eur(s.p_custo), { strong: true })}
            {line('Depreciações', eur(inps.depreciacoes))}
            <div className="border-t border-border my-1" />
            {line('PVP Final', eur(s.pvp_desc), { strong: true, className: 'text-bmw-blue' })}
            {line(s.iva_dedutivel ? 'PVP s/ IVA' : 'PVP s/ IVA (ICE, não dedutível)', eur(s.pvp_sem_iva))}
            {line('Margem', eur(s.margem), { strong: true, className: s.margem < 0 ? 'text-red-600' : 'text-green-600' })}
            {line('Penetração opcionais', perc(s.penetracao))}
          </div>

          {reservado && (
            <div className="text-xs text-muted-foreground bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-2.5">
              Reservado por <strong className="text-foreground">{row.reserva_user || 'Desconhecido'}</strong>
              {row.reserva_expira && <> · válido até {new Date(row.reserva_expira).toLocaleString('pt-PT')}</>}
            </div>
          )}

          {row.observacoes && row.observacoes.trim() !== '' && (
            <div className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">Observações: </span>{row.observacoes}
            </div>
          )}

          {/* Ações */}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={partilhar}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold bg-bmw-blue text-white rounded-lg hover:bg-bmw-blue/90 transition-colors"
            >
              <Share2 className="h-3.5 w-3.5" /> Partilhar
            </button>
            <button
              onClick={copiar}
              className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold border border-border rounded-lg hover:bg-muted transition-colors"
            >
              <Copy className="h-3.5 w-3.5" /> Copiar resumo
            </button>
            {row.link_fotos && row.link_fotos.trim() !== '' && (
              <a
                href={row.link_fotos}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold border border-border rounded-lg hover:bg-muted transition-colors"
                title="Abrir álbum de fotos"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Fotos
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
