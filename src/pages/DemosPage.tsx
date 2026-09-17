import { useState, useEffect, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/App';
import { usePermissions } from '@/contexts/PermissionsContext';
import {
  Search, X, MapPin, Gauge, Calendar, ExternalLink, Share2, Copy,
  ChevronUp, ChevronDown, ChevronsUpDown, RotateCcw, ImageOff,
  Camera, Trash2, Loader2, Users,
} from 'lucide-react';
import bmwLogo from '@/assets/bmw-logo.png';
import { listDemoUsers, groupByChassis, initials, type DemoUser } from '@/lib/demoUsers';

/* ── Parque de demonstradores (VN · Demos) ────────────────────────────────────
 * Consulta, apenas leitura, do parque de viaturas partilhado com a plataforma
 * Caetano (mesmo Supabase, tabela `viaturas`). Os preços (PVP bruto, desconto,
 * margem, idade) são recalculados em runtime a partir de `inputs`, replicando a
 * lógica da plataforma Caetano; usa-se `stats` guardado quando disponível.
 * Tab restrito a administradores por agora (ver permissions.ts).
 * ──────────────────────────────────────────────────────────────────────────── */

interface Inputs {
  pvb: number; opc: number; bsi: number; eco: number; leg: number; isv: number;
  mgb: number; esf: number; pac: number; dem: number; sup: number;
  pvp_desc: number; depreciacoes: number;
}

interface Stats {
  pvp_bruto: number; pvp_final: number; mg: number; mg_perc: number;
  idade: number; idade_dias: number; penetracao: number;
  desc_perc: number; desc_eur: number; iva: number; preco_minimo: number; s_iva: number;
}

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

const TAXA_IVA = 0.23;
const TEMPLATE_INPUTS: Inputs = {
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

function getInps(v: unknown): Inputs {
  if (!v) return { ...TEMPLATE_INPUTS };
  if (typeof v === 'string') {
    try { return { ...TEMPLATE_INPUTS, ...JSON.parse(v) }; } catch { return { ...TEMPLATE_INPUTS }; }
  }
  return typeof v === 'object' ? { ...TEMPLATE_INPUTS, ...(v as Partial<Inputs>) } : { ...TEMPLATE_INPUTS };
}

/* Mesmo cálculo da plataforma Caetano (calcularPrecosTempoReal). */
function calcStats(v: Viatura): Stats {
  const inps = getInps(v.inputs);
  const baseTributavel = (inps.pvb || 0) + (inps.opc || 0) + (inps.bsi || 0) + (inps.eco || 0) + (inps.leg || 0) + (inps.isv || 0);
  const pvpBruto = baseTributavel * (1 + TAXA_IVA);
  const descPerc = (inps.mgb || 0) + (inps.esf || 0) + (inps.pac || 0) + (inps.dem || 0) + (inps.sup || 0);
  const descEur = ((inps.pvb || 0) + (inps.opc || 0)) * descPerc;
  const precoMinimo = pvpBruto - descEur * (1 + TAXA_IVA);
  const mg = (inps.pvp_desc || 0) - precoMinimo + (inps.depreciacoes || 0);

  let idade = 0; let idadeDias = 0;
  if (v.data_matricula) {
    const mat = new Date(v.data_matricula); const hoje = new Date();
    idade = (hoje.getFullYear() - mat.getFullYear()) * 12 + (hoje.getMonth() - mat.getMonth());
    if (idade < 0) idade = 0;
    const diff = hoje.getTime() - mat.getTime();
    idadeDias = diff > 0 ? Math.floor(diff / (1000 * 60 * 60 * 24)) : 0;
  }

  return {
    pvp_bruto: pvpBruto,
    pvp_final: inps.pvp_desc || 0,
    mg,
    mg_perc: (inps.pvb + inps.opc) > 0 ? mg / (inps.pvb + inps.opc) : 0,
    idade,
    idade_dias: idadeDias,
    penetracao: inps.pvb > 0 ? (inps.opc || 0) / inps.pvb : 0,
    desc_perc: descPerc,
    desc_eur: descEur,
    iva: (pvpBruto / (1 + TAXA_IVA)) * TAXA_IVA,
    preco_minimo: precoMinimo,
    s_iva: (inps.pvp_desc || 0) / (1 + TAXA_IVA),
  };
}

/* Prefere stats guardado (como na plataforma Caetano); recalcula em falta. */
function resolveStats(v: Viatura): Stats {
  const s = v.stats;
  if (s && typeof s === 'object' && !Array.isArray(s) && 'pvp_bruto' in (s as object)) {
    return { ...calcStats(v), ...(s as Partial<Stats>) } as Stats;
  }
  return calcStats(v);
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

interface Row extends Viatura { _stats: Stats; _local: string; _tipologia: string[] }

/* ── Ordenação ─────────────────────────────────────────────────────────────── */
type SortKey = 'local' | 'modelo' | 'versao' | 'encomenda' | 'chassis' | 'users' | 'matricula'
  | 'data_matricula' | 'idade' | 'pvp_bruto' | 'pvp_final';

const COLS: { key: SortKey; label: string; num?: boolean; align?: 'right' | 'center'; noSort?: boolean }[] = [
  { key: 'local', label: 'Local', align: 'center' },
  { key: 'modelo', label: 'Modelo' },
  { key: 'versao', label: 'Versão' },
  { key: 'encomenda', label: 'Enc' },
  { key: 'chassis', label: 'Chassis' },
  { key: 'users', label: 'Utiliz.', align: 'center', noSort: true },
  { key: 'matricula', label: 'Matrícula' },
  { key: 'data_matricula', label: 'Data', align: 'center' },
  { key: 'idade', label: 'Idade', num: true, align: 'center' },
  { key: 'pvp_bruto', label: 'PVP Base', num: true, align: 'right' },
  { key: 'pvp_final', label: 'PVP Final', num: true, align: 'right' },
];

function sortValue(r: Row, key: SortKey): string | number {
  switch (key) {
    case 'local': return r._local.toLowerCase();
    case 'users': return '';
    case 'data_matricula': return r.data_matricula ? new Date(r.data_matricula).getTime() : 0;
    case 'idade': return r._stats.idade_dias;
    case 'pvp_bruto': return r._stats.pvp_bruto;
    case 'pvp_final': return r._stats.pvp_final;
    default: return (r[key] ?? '').toString().toLowerCase();
  }
}

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
  const [demoUsers, setDemoUsers] = useState<Record<string, DemoUser[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [fModelo, setFModelo] = useState('Todos');
  // Por defeito, o parque abre filtrado por Aveiro.
  const [fLocal, setFLocal] = useState('Aveiro');
  const localInit = useRef(false);
  const [fTipologia, setFTipologia] = useState<Set<string>>(new Set());
  const [pvp, setPvp] = useState<[number, number] | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' } | null>(null);
  const [selected, setSelected] = useState<Row | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const [viaturasRes, capasRes, usersRes] = await Promise.all([
        supabase.from('viaturas').select('*'),
        supabase.from('demo_capas').select('chassis, url'),
        listDemoUsers().catch(() => [] as DemoUser[]),
      ]);
      if (!alive) return;
      if (viaturasRes.error) { setError(viaturasRes.error.message); setRows([]); setLoading(false); return; }
      const mapped: Row[] = ((viaturasRes.data as Viatura[]) ?? []).map(v => ({
        ...v,
        _stats: resolveStats(v),
        _local: getArr(v.local).join(', ') || '—',
        _tipologia: getArr(v.tipologia),
      }));
      const capaMap: Record<string, string> = {};
      for (const c of (capasRes.data as { chassis: string; url: string }[]) ?? []) {
        if (c.chassis && c.url) capaMap[c.chassis] = c.url;
      }
      setRows(mapped);
      setCapas(capaMap);
      setDemoUsers(groupByChassis(usersRes));
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

  // Domínio do PVP (a partir dos valores > 0), arredondado a 500 €.
  const pvpDomain = useMemo<[number, number]>(() => {
    const vals = rows.map(r => r._stats.pvp_final).filter(v => v > 0);
    if (!vals.length) return [0, 0];
    const lo = Math.floor(Math.min(...vals) / 500) * 500;
    const hi = Math.ceil(Math.max(...vals) / 500) * 500;
    return [lo, hi];
  }, [rows]);
  useEffect(() => { if (pvpDomain[1] > 0) setPvp([pvpDomain[0], pvpDomain[1]]); }, [pvpDomain]);

  const pvpActive = !!pvp && (pvp[0] > pvpDomain[0] || pvp[1] < pvpDomain[1]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = rows.filter(r => {
      if (fModelo !== 'Todos' && (r.modelo ?? '').trim() !== fModelo) return false;
      if (fLocal !== 'Todas' && !getArr(r.local).includes(fLocal)) return false;
      if (fTipologia.size && !r._tipologia.some(t => fTipologia.has(t))) return false;
      if (pvpActive && pvp) {
        const p = r._stats.pvp_final;
        if (p <= 0 || p < pvp[0] || p > pvp[1]) return false;
      }
      if (!q) return true;
      return [r.modelo, r.versao, r.chassis, r.matricula, r.encomenda, r._local]
        .some(v => (v ?? '').toString().toLowerCase().includes(q));
    });

    if (sort) {
      const dir = sort.dir === 'asc' ? 1 : -1;
      list.sort((a, b) => {
        const va = sortValue(a, sort.key); const vb = sortValue(b, sort.key);
        if (va < vb) return -1 * dir;
        if (va > vb) return 1 * dir;
        return 0;
      });
    } else {
      // Ordenação por defeito: reservados primeiro, depois idade descendente.
      list.sort((a, b) => {
        const rr = (isReservado(b) ? 1 : 0) - (isReservado(a) ? 1 : 0);
        return rr !== 0 ? rr : b._stats.idade_dias - a._stats.idade_dias;
      });
    }
    return list;
  }, [rows, search, fModelo, fLocal, fTipologia, pvp, pvpActive, sort]);

  const toggleTip = (t: string) =>
    setFTipologia(prev => { const n = new Set(prev); if (n.has(t)) n.delete(t); else n.add(t); return n; });

  const toggleSort = (key: SortKey) =>
    setSort(prev => {
      if (!prev || prev.key !== key) return { key, dir: key === 'pvp_final' || key === 'pvp_bruto' || key === 'idade' ? 'desc' : 'asc' };
      if (prev.dir === 'asc') return { key, dir: 'desc' };
      return null; // terceiro clique limpa
    });

  const filtersActive = !!search || fModelo !== 'Todos' || fLocal !== 'Todas' || fTipologia.size > 0 || pvpActive;
  const resetFilters = () => {
    setSearch(''); setFModelo('Todos'); setFLocal('Todas'); setFTipologia(new Set());
    setPvp([pvpDomain[0], pvpDomain[1]]);
  };

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

        {/* PVP Final — largura total, por baixo da tipologia. Rótulo e valor em
            linhas separadas (o valor arranca da esquerda com o cartão inteiro
            disponível), pelo que nunca fica cortado nem encostado à margem. */}
        <div className="flex flex-col gap-1.5 md:col-span-2 min-w-0">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
            <Gauge className="h-3 w-3" /> PVP Final
          </span>
          {pvp && (
            <span className="text-sm font-bold text-foreground tabular-nums break-words">
              {eur0(pvp[0])} — {eur0(pvp[1])}
            </span>
          )}
          {pvp && <PriceRange domain={pvpDomain} value={pvp} onChange={setPvp} />}
        </div>
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
              <tr className="bg-muted/50">
                {COLS.map(c => {
                  const active = sort?.key === c.key;
                  return (
                    <th
                      key={c.key}
                      onClick={c.noSort ? undefined : () => toggleSort(c.key)}
                      className={`px-2.5 py-2 font-semibold text-muted-foreground whitespace-nowrap border-b border-border transition-colors ${
                        c.noSort ? '' : 'cursor-pointer select-none hover:text-foreground'
                      } ${c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left'}`}
                    >
                      <span className={`inline-flex items-center gap-1 ${c.align === 'right' ? 'flex-row-reverse' : ''}`}>
                        {c.label}
                        {!c.noSort && (active
                          ? (sort!.dir === 'asc' ? <ChevronUp className="h-3 w-3 text-bmw-blue" /> : <ChevronDown className="h-3 w-3 text-bmw-blue" />)
                          : <ChevronsUpDown className="h-3 w-3 opacity-30" />)}
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
                    <td className="px-2.5 py-1.5 text-center whitespace-nowrap">
                      <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-[10px] font-semibold border border-border">{r._local}</span>
                    </td>
                    <td className="px-2.5 py-1.5 font-semibold text-foreground whitespace-nowrap">
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
                    <td className="px-2.5 py-1.5 text-muted-foreground whitespace-nowrap">{r.versao || '—'}</td>
                    <td className="px-2.5 py-1.5 text-muted-foreground font-mono">{r.encomenda || '—'}</td>
                    <td className="px-2.5 py-1.5 text-muted-foreground font-mono uppercase">{r.chassis || '—'}</td>
                    <td className="px-2.5 py-1.5 text-center whitespace-nowrap">
                      {(demoUsers[r.chassis] ?? []).length === 0 ? (
                        <span className="text-muted-foreground/40">—</span>
                      ) : (
                        <span className="inline-flex items-center gap-0.5 flex-wrap justify-center">
                          {(demoUsers[r.chassis] ?? []).map(u => (
                            <span
                              key={u.id}
                              title={u.nome}
                              className="inline-grid place-items-center h-5 min-w-[1.25rem] px-1 rounded bg-bmw-blue/10 text-bmw-blue text-[10px] font-bold"
                            >
                              {initials(u.nome)}
                            </span>
                          ))}
                        </span>
                      )}
                    </td>
                    <td className="px-2.5 py-1.5 text-foreground/80 font-mono uppercase font-medium">{r.matricula || '—'}</td>
                    <td className="px-2.5 py-1.5 text-center text-muted-foreground whitespace-nowrap">
                      {r.data_matricula ? new Date(r.data_matricula).toLocaleDateString('pt-PT') : '—'}
                    </td>
                    <td className="px-2.5 py-1.5 text-center whitespace-nowrap"><AgeBadge dias={r._stats.idade_dias} /></td>
                    <td className="px-2.5 py-1.5 text-right text-muted-foreground line-through whitespace-nowrap">
                      {r._stats.pvp_bruto > 0 ? eur(r._stats.pvp_bruto) : '—'}
                    </td>
                    <td className={`px-2.5 py-1.5 text-right font-bold whitespace-nowrap ${reservado ? 'text-red-600' : 'text-bmw-blue'}`}>
                      {r._stats.pvp_final > 0 ? eur(r._stats.pvp_final) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
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

/* ── Slider de intervalo de preço (dois cursores) ─────────────────────────────*/
function PriceRange({ domain, value, onChange }: {
  domain: [number, number]; value: [number, number]; onChange: (v: [number, number]) => void;
}) {
  const [min, max] = domain;
  const span = Math.max(1, max - min);
  const pct = (v: number) => ((v - min) / span) * 100;
  if (max <= min) return <div className="h-6" />;

  return (
    <div className="relative h-6 flex items-center">
      <div className="absolute left-0 right-0 h-1 rounded-full bg-muted" />
      <div
        className="absolute h-1 rounded-full bg-bmw-blue"
        style={{ left: `${pct(value[0])}%`, right: `${100 - pct(value[1])}%` }}
      />
      <input
        type="range" min={min} max={max} step={500} value={value[0]}
        onChange={e => onChange([Math.min(Number(e.target.value), value[1] - 500), value[1]])}
        className="range-thumb absolute w-full appearance-none bg-transparent pointer-events-none"
        aria-label="PVP mínimo"
      />
      <input
        type="range" min={min} max={max} step={500} value={value[1]}
        onChange={e => onChange([value[0], Math.max(Number(e.target.value), value[0] + 500)])}
        className="range-thumb absolute w-full appearance-none bg-transparent pointer-events-none"
        aria-label="PVP máximo"
      />
    </div>
  );
}

/* ── Cartão de partilha / detalhe ─────────────────────────────────────────────*/
function shareText(r: Row): string {
  const L: string[] = [];
  L.push(`🚗 ${[r.modelo, r.versao].filter(Boolean).join(' ')}`.trim());
  const meta = [r._local !== '—' ? `📍 ${r._local}` : '', r._tipologia.join('/')].filter(Boolean).join(' · ');
  if (meta) L.push(meta);
  if (r.matricula) L.push(`Matrícula: ${r.matricula}`);
  L.push(`Kms: ${(r.kms ?? 0).toLocaleString('pt-PT')} · ${r._stats.idade_dias} dias`);
  if (r._stats.pvp_bruto > 0) L.push(`PVP: ${eur(r._stats.pvp_bruto)}`);
  if (r._stats.desc_eur > 0) L.push(`Desconto: ${eur(r._stats.desc_eur)} (${perc(r._stats.desc_perc)})`);
  if (r._stats.pvp_final > 0) L.push(`💰 PVP Final: ${eur(r._stats.pvp_final)}`);
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
  const inps = getInps(row.inputs);
  const s = row._stats;
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
                {row.matricula || row.chassis}
                <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{row._local}</span>
              </p>
            </div>
            <div className="text-right shrink-0">
              <div className={`text-xl font-black ${reservado ? 'text-red-600' : 'text-bmw-blue'}`}>
                {s.pvp_final > 0 ? eur0(s.pvp_final) : 'N/A'}
              </div>
              {s.pvp_bruto > 0 && s.pvp_bruto > s.pvp_final && (
                <div className="text-[11px] text-muted-foreground line-through">{eur0(s.pvp_bruto)}</div>
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
              <div className="text-sm font-bold text-foreground mt-0.5">{s.idade_dias} dias</div>
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
            {line('IVA', eur(s.iva))}
            <div className="border-t border-border my-1" />
            {line('PVP Bruto', eur(s.pvp_bruto), { strong: true })}
            {line(`Desconto (${perc(s.desc_perc)})`, '- ' + eur(s.desc_eur), { className: 'text-red-600' })}
            <div className="border-t border-border my-1" />
            {line('PVP Final', eur(s.pvp_final), { strong: true, className: 'text-bmw-blue' })}
            {line('S/ IVA', eur(s.s_iva))}
            {line('Margem (MG)', eur(s.mg), { strong: true, className: s.mg < 0 ? 'text-red-600' : 'text-green-600' })}
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
