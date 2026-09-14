import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Search, X, MapPin, Gauge, Calendar, ExternalLink } from 'lucide-react';

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
const perc = (n: number | null | undefined) =>
  ((n || 0) * 100).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' %';

interface Row extends Viatura { _stats: Stats; _local: string; _tipologia: string[] }

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
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [fModelo, setFModelo] = useState('Todos');
  const [fLocal, setFLocal] = useState('Todas');
  const [fTipologia, setFTipologia] = useState('Todas');
  const [selected, setSelected] = useState<Row | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.from('viaturas').select('*');
      if (!alive) return;
      if (error) { setError(error.message); setRows([]); setLoading(false); return; }
      const mapped: Row[] = ((data as Viatura[]) ?? []).map(v => ({
        ...v,
        _stats: resolveStats(v),
        _local: getArr(v.local).join(', ') || '—',
        _tipologia: getArr(v.tipologia),
      }));
      setRows(mapped);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  const modelos = useMemo(() => ['Todos', ...[...new Set(rows.map(r => r.modelo).filter(Boolean) as string[])].sort()], [rows]);
  const locais = useMemo(() => ['Todas', ...[...new Set(rows.flatMap(r => getArr(r.local)))].sort()], [rows]);
  const tipologias = useMemo(() => ['Todas', ...[...new Set(rows.flatMap(r => r._tipologia))].sort()], [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (fModelo !== 'Todos' && r.modelo !== fModelo) return false;
      if (fLocal !== 'Todas' && !getArr(r.local).includes(fLocal)) return false;
      if (fTipologia !== 'Todas' && !r._tipologia.includes(fTipologia)) return false;
      if (!q) return true;
      return [r.modelo, r.versao, r.chassis, r.matricula, r.encomenda, r._local]
        .some(v => (v ?? '').toString().toLowerCase().includes(q));
    }).sort((a, b) => {
      // Reservados primeiro (em negociação), depois por idade descendente.
      const rr = (isReservado(b) ? 1 : 0) - (isReservado(a) ? 1 : 0);
      if (rr !== 0) return rr;
      return b._stats.idade_dias - a._stats.idade_dias;
    });
  }, [rows, search, fModelo, fLocal, fTipologia]);

  const chipRow = (label: string, options: string[], value: string, onChange: (v: string) => void) => (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mr-1">{label}</span>
      {options.map(o => (
        <button
          key={o}
          onClick={() => onChange(o)}
          className={`px-2.5 py-1 text-[11px] font-semibold rounded-md border transition-colors ${
            value === o
              ? 'bg-bmw-blue text-white border-bmw-blue'
              : 'bg-background text-muted-foreground border-border hover:text-foreground hover:border-bmw-blue/50'
          }`}
        >
          {o}
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[220px]">
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
      </div>

      {/* Filtros */}
      <div className="space-y-2 bg-card border border-border rounded-lg p-3">
        {chipRow('Modelo', modelos, fModelo, setFModelo)}
        {chipRow('Local', locais, fLocal, setFLocal)}
        {chipRow('Tipologia', tipologias, fTipologia, setFTipologia)}
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
                {['Local', 'Modelo', 'Versão', 'Enc', 'Chassis', 'Matrícula', 'Data', 'Idade', 'PVP Base', 'PVP Final'].map(h => (
                  <th key={h} className="px-2.5 py-2 text-left font-semibold text-muted-foreground whitespace-nowrap border-b border-border">{h}</th>
                ))}
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
                    <td className="px-2.5 py-1.5 whitespace-nowrap">
                      <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-[10px] font-semibold border border-border">{r._local}</span>
                    </td>
                    <td className="px-2.5 py-1.5 font-semibold text-foreground whitespace-nowrap">
                      {r.modelo || '—'}
                      {reservado && (
                        <span className="ml-1.5 bg-yellow-400/90 text-yellow-950 text-[8px] font-bold px-1 py-0.5 rounded uppercase tracking-wider">Negociação</span>
                      )}
                    </td>
                    <td className="px-2.5 py-1.5 text-muted-foreground whitespace-nowrap">{r.versao || '—'}</td>
                    <td className="px-2.5 py-1.5 text-muted-foreground font-mono">{r.encomenda || '—'}</td>
                    <td className="px-2.5 py-1.5 text-muted-foreground font-mono uppercase">{r.chassis || '—'}</td>
                    <td className="px-2.5 py-1.5 text-foreground/80 font-mono uppercase font-medium">{r.matricula || '—'}</td>
                    <td className="px-2.5 py-1.5 text-muted-foreground whitespace-nowrap">
                      {r.data_matricula ? new Date(r.data_matricula).toLocaleDateString('pt-PT') : '—'}
                    </td>
                    <td className="px-2.5 py-1.5 whitespace-nowrap"><AgeBadge dias={r._stats.idade_dias} /></td>
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

      {selected && <DetailModal row={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function DetailModal({ row, onClose }: { row: Row; onClose: () => void }) {
  const inps = getInps(row.inputs);
  const s = row._stats;
  const reservado = isReservado(row);
  const line = (label: string, value: string, opts?: { strong?: boolean; className?: string }) => (
    <div className="flex justify-between items-center py-1">
      <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">{label}</span>
      <span className={`text-xs ${opts?.strong ? 'font-black' : 'font-semibold'} ${opts?.className ?? 'text-foreground'}`}>{value}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between px-5 py-4 border-b border-border sticky top-0 bg-card z-10">
          <div>
            <h2 className="text-base font-bold text-foreground">{row.modelo || '—'} {row.versao || ''}</h2>
            <p className="text-xs text-muted-foreground font-mono uppercase mt-0.5">{row.matricula || row.chassis}</p>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><MapPin className="h-3 w-3" />{row._local}</span>
              {row._tipologia.map(t => (
                <span key={t} className="px-1.5 py-0.5 rounded bg-bmw-blue/10 text-bmw-blue text-[10px] font-semibold">{t}</span>
              ))}
              {reservado
                ? <span className="px-1.5 py-0.5 rounded bg-yellow-400/90 text-yellow-950 text-[10px] font-bold uppercase tracking-wider">Em negociação</span>
                : <span className="px-1.5 py-0.5 rounded bg-green-500/15 text-green-600 text-[10px] font-bold uppercase tracking-wider">Disponível</span>}
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        <div className="p-5 space-y-4">
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

          {row.link_fotos && row.link_fotos.trim() !== '' && (
            <a
              href={row.link_fotos}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-bmw-blue hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Ver fotos
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
