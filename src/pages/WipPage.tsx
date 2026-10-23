import { useEffect, useMemo, useState } from 'react';
import { Loader2, Database, Filter, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LabelList,
  PieChart, Pie, Cell,
} from 'recharts';
import { Badge } from '@/components/ui/badge';
import { RetomaFilter } from '@/components/RetomaFilter';
import {
  loadControlVuFromDb, listVuObjetivos, isVuWipStatus, type VuRecord, type VuObjetivo,
} from '@/lib/control-records-vu';

/* ── WIP · Viaturas Usadas ─────────────────────────────────────────────────────
 * Dashboard da secção VU, alimentado pela tabela control_records_vu (ficheiro VU
 * carregado em Dados). Registos com STATUS = FATURA | CARTEIRA. Os gauges de
 * Realização vs Objetivo são na ótica das FATURAS e comparam-nas com dois valores
 * definidos no tab Objetivos: objetivo BMW e orçamento Caetano. Filtros à esquerda
 * (mesma organização da WIP VN): período (pelo mês da fatura, DFAT; a carteira está sempre no mês presente), responsável,
 * e status.
 * ──────────────────────────────────────────────────────────────────────────── */

const FATURA_COLOR = '#16A34A';
const CARTEIRA_COLOR = '#F59E0B';
const BMW_COLOR = '#1C69D4';

/* Método de pagamento (mesma paleta e formato da WIP VN). */
const FIN_COLORS: Record<string, string> = { PP: '#1C69D4', FS: '#16A34A', EXT: '#F59E0B', FEXT: '#EC4899', FINT: '#8B5CF6' };
const FIN_FALLBACK = ['#DC2626', '#06B6D4', '#F97316', '#84CC16', '#14B8A6', '#A855F7', '#64748B'];
const FIN_NA_COLOR = '#94A3B8';
/* Uma cor por série, nunca repetida: usa a cor própria do método quando livre e,
 * caso contrário (método desconhecido ou cor já ocupada), a próxima livre do fallback. */
function finColorMap(names: string[]): Record<string, string> {
  const used = new Set<string>([FIN_NA_COLOR]);
  const out: Record<string, string> = {};
  const free = () => FIN_FALLBACK.find(c => !used.has(c)) ?? FIN_FALLBACK[used.size % FIN_FALLBACK.length];
  names.forEach(name => {
    if (name === 'N/A') { out[name] = FIN_NA_COLOR; return; }
    const own = FIN_COLORS[name.trim().toUpperCase()];
    out[name] = own && !used.has(own) ? own : free();
    used.add(out[name]);
  });
  return out;
}

/* Datas de garantia (DGARANT / GARANT 3S): o parser normaliza para ISO quando o
 * valor é uma data reconhecível; aqui formatamos dd/mm/aa. Enquanto o ficheiro
 * não estiver no formato data, mostra-se o valor tal como veio. */
const fmtGarantia = (v: string) => {
  if (!v) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  return m ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : v;
};

/* Código de cores por proveniência (glance rápido na tabela). */
const PROV_COLORS: Record<string, string> = {
  REMARK: '#1C69D4', RETOMA: '#16A34A', CONSIGN: '#8B5CF6', LEILÃO: '#F97316', LEILAO: '#F97316',
};
const provColor = (p: string) => PROV_COLORS[p.trim().toUpperCase()] ?? '#94A3B8';

const MESES_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const monthKeyStr = (d: Date) => `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`;

/* Mês a que um registo pertence para efeitos de período: a FATURA conta no mês da
 * fatura (DFAT); a CARTEIRA (viaturas ainda não entregues, sem DFAT) está sempre
 * no mês presente. */
const recordMonthKey = (r: VuRecord): string | null =>
  r.status === 'CARTEIRA' ? monthKeyStr(new Date()) : r.dfat ? monthKeyStr(r.dfat) : null;

/* Colunas da tabela: chave, título, alinhamento e valor de ordenação. */
type SortKey = 'resp' | 'status' | 'type' | 'model' | 'version' | 'cliente' | 'mat' | 'prov' | 'ret' | 'fin' | 'a360' | 'dfat' | 'dgarant' | 'garant3s';
const COLUMNS: { key: SortKey; label: string; align: 'left' | 'center'; value: (r: VuRecord) => string | number }[] = [
  { key: 'resp', label: 'Resp', align: 'left', value: r => r.resp || '' },
  { key: 'status', label: 'Status', align: 'left', value: r => r.status || '' },
  { key: 'type', label: 'Tipo', align: 'left', value: r => r.type || '' },
  { key: 'model', label: 'Modelo', align: 'left', value: r => r.model || '' },
  { key: 'version', label: 'Versão', align: 'left', value: r => r.version || '' },
  { key: 'cliente', label: 'Cliente', align: 'left', value: r => r.cliente || '' },
  { key: 'mat', label: 'Matrícula', align: 'left', value: r => r.mat || '' },
  { key: 'prov', label: 'Proveniência', align: 'left', value: r => r.prov || '' },
  { key: 'ret', label: 'RET', align: 'center', value: r => (r.ret > 0 ? 1 : 0) },
  { key: 'fin', label: 'FIN', align: 'center', value: r => r.fin || '' },
  { key: 'a360', label: '360º', align: 'center', value: r => (r.a360 > 0 ? 1 : 0) },
  { key: 'dfat', label: 'Fatura', align: 'center', value: r => (r.dfat ? new Date(r.dfat).getTime() : 0) },
  { key: 'dgarant', label: 'DGarant', align: 'center', value: r => r.dgarant || '' },
  { key: 'garant3s', label: 'Garant 3S', align: 'center', value: r => r.garant3s || '' },
];

function Kpi({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="text-2xl font-bold tabular-nums leading-none" style={color ? { color } : undefined}>{value}</div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mt-1">{label}</div>
    </div>
  );
}

/* Cor do gauge pelo grau de cumprimento (mesmos limiares da WIP VN). */
const pctColor = (pct: number) => (pct >= 100 ? FATURA_COLOR : pct >= 80 ? CARTEIRA_COLOR : '#DC2626');

/* Gauge semicircular (0–100%). Arco de fundo + arco de valor + marca de previsão.
 * Sem objetivo definido mostra "—" em vez de 0%. */
function Gauge({ pct, prevPct, hasObjetivo }: { pct: number; prevPct: number; hasObjetivo: boolean }) {
  const R = 80, CX = 100, CY = 100;
  const len = Math.PI * R;
  const clamp = (p: number) => Math.max(0, Math.min(100, p));
  const valLen = (clamp(pct) / 100) * len;
  const arc = `M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`;
  const markAngle = Math.PI * (1 - clamp(prevPct) / 100);
  const mx = CX + R * Math.cos(markAngle);
  const my = CY - R * Math.sin(markAngle);
  const color = pctColor(pct);
  return (
    <svg viewBox="0 0 200 116" className="w-full max-w-[200px]">
      <path d={arc} fill="none" stroke="hsl(var(--muted))" strokeWidth={16} strokeLinecap="round" />
      {hasObjetivo && (
        <>
          <path d={arc} fill="none" stroke={color} strokeWidth={16} strokeLinecap="round"
            pathLength={len} strokeDasharray={`${valLen} ${len}`} />
          {/* marca da previsão (faturas + carteira) */}
          <circle cx={mx} cy={my} r={5} fill="hsl(var(--foreground))" stroke="hsl(var(--card))" strokeWidth={2} />
        </>
      )}
      <text x={CX} y={CY - 8} textAnchor="middle" style={{ fontSize: 30, fontWeight: 800, fill: hasObjetivo ? color : 'hsl(var(--muted-foreground))' }}>
        {hasObjetivo ? `${Math.round(pct)}%` : '—'}
      </text>
    </svg>
  );
}

export default function WipPage() {
  const [records, setRecords] = useState<VuRecord[] | null>(null);
  const [objMap, setObjMap] = useState<Record<string, VuObjetivo>>({});

  // Filtros (mesma organização da WIP VN).
  // Arranca no mês e ano atuais (como na WIP VN).
  const [fYears, setFYears] = useState<number[]>(() => [new Date().getFullYear()]);
  const [fMonths, setFMonths] = useState<number[]>(() => { const n = new Date(); return [n.getFullYear() * 100 + n.getMonth() + 1]; }); // chave = ano*100 + mês
  const [selectedResps, setSelectedResps] = useState<Set<string>>(new Set());
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null); // FATURA | CARTEIRA
  const [selectedRet, setSelectedRet] = useState<boolean | null>(null); // retoma: null=todos, true=com, false=sem
  const [selectedFin, setSelectedFin] = useState<string | null>(null); // método de pagamento (PP | FS | EXT | N/A)
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' } | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([loadControlVuFromDb(), listVuObjetivos().catch((): VuObjetivo[] => [])])
      .then(([recs, objs]) => {
        if (!alive) return;
        // Os negócios do funil (FRIO/MORNO/QUENTE) não entram na WIP.
        setRecords(recs.filter(r => isVuWipStatus(r.status)));
        setObjMap(Object.fromEntries(objs.map(o => [o.mes, o])));
      })
      .catch(() => { if (alive) setRecords([]); });
    return () => { alive = false; };
  }, []);

  const periods = useMemo(() => {
    const years = new Set<number>();
    const months = new Map<number, { year: number; month: number }>();
    (records ?? []).forEach(r => {
      const key = recordMonthKey(r);
      if (!key) return;
      const [y, m] = key.split('/').map(Number);
      years.add(y); months.set(y * 100 + m, { year: y, month: m });
    });
    return {
      years: [...years].sort((a, b) => b - a),
      months: [...months.values()].sort((a, b) => (b.year * 100 + b.month) - (a.year * 100 + a.month)),
    };
  }, [records]);

  // Meses selecionados (chaves 'AAAA/MM'). Vazio = todos.
  const selectedMonthKeys = useMemo(() => {
    const keys = new Set<string>();
    if (fMonths.length > 0) fMonths.forEach(k => keys.add(`${Math.floor(k / 100)}/${String(k % 100).padStart(2, '0')}`));
    else if (fYears.length > 0) fYears.forEach(y => periods.months.filter(m => m.year === y).forEach(m => keys.add(`${m.year}/${String(m.month).padStart(2, '0')}`)));
    return keys;
  }, [fMonths, fYears, periods]);

  const inPeriod = (r: VuRecord) => {
    if (selectedMonthKeys.size === 0) return true;
    const key = recordMonthKey(r);
    return !!key && selectedMonthKeys.has(key);
  };

  const filtered = useMemo(() => {
    let result = records ?? [];
    result = result.filter(inPeriod);
    if (selectedResps.size > 0) result = result.filter(r => selectedResps.has(r.resp || '—'));
    if (selectedStatus) result = result.filter(r => r.status === selectedStatus);
    if (selectedRet !== null) result = result.filter(r => (r.ret > 0) === selectedRet);
    if (selectedFin) result = result.filter(r => selectedFin === 'N/A' ? !r.fin : (r.fin || '').trim().toUpperCase() === selectedFin);
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records, selectedMonthKeys, selectedResps, selectedStatus, selectedRet, selectedFin]);

  // Ordenação da tabela: 1.º clique ascendente, 2.º descendente, 3.º repõe a ordem original.
  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const col = COLUMNS.find(c => c.key === sort.key)!;
    const mul = sort.dir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const va = col.value(a), vb = col.value(b);
      const cmp = typeof va === 'number' && typeof vb === 'number'
        ? va - vb
        : String(va).localeCompare(String(vb), 'pt', { numeric: true, sensitivity: 'base' });
      return cmp * mul;
    });
  }, [filtered, sort]);

  const toggleSort = (key: SortKey) => {
    setSort(prev => !prev || prev.key !== key ? { key, dir: 'asc' } : prev.dir === 'asc' ? { key, dir: 'desc' } : null);
  };

  const resps = useMemo(() => {
    const set = new Set<string>();
    (records ?? []).forEach(r => set.add(r.resp || '—'));
    return [...set].sort();
  }, [records]);

  const statusByResp = useMemo(() => {
    const map: Record<string, { resp: string; Fatura: number; Carteira: number; total: number }> = {};
    filtered.forEach(r => {
      const resp = r.resp || '—';
      if (!map[resp]) map[resp] = { resp, Fatura: 0, Carteira: 0, total: 0 };
      if (r.status === 'FATURA') { map[resp].Fatura++; map[resp].total++; }
      else if (r.status === 'CARTEIRA') { map[resp].Carteira++; map[resp].total++; }
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [filtered]);

  const kpis = useMemo(() => {
    let faturas = 0, carteira = 0, retails = 0;
    for (const r of filtered) {
      if (r.status === 'FATURA') faturas++;
      else if (r.status === 'CARTEIRA') carteira++;
      if (r.ret > 0) retails++;
    }
    return { faturas, carteira, retails, total: faturas + carteira };
  }, [filtered]);

  // Método de pagamento (FIN) — distribuição para o gráfico circular. Registos
  // sem FIN entram como "N/A", à imagem da WIP VN.
  const finData = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach(r => { const f = (r.fin || '').trim().toUpperCase(); if (f) map[f] = (map[f] || 0) + 1; });
    const totalWithFin = Object.values(map).reduce((s, v) => s + v, 0);
    const diff = filtered.length - totalWithFin;
    const entries = Object.entries(map)
      .map(([name, value]) => ({ name, value, pct: Math.round((value / (filtered.length || 1)) * 100) }))
      .sort((a, b) => b.value - a.value);
    if (diff > 0) entries.push({ name: 'N/A', value: diff, pct: Math.round((diff / (filtered.length || 1)) * 100) });
    return entries;
  }, [filtered]);

  const finColors = useMemo(() => finColorMap(finData.map(e => e.name)), [finData]);

  // Gauges — só ótica da fatura: atual = faturas do período; previsão = faturas +
  // carteira (esperadas). Os objetivos (BMW e Caetano) são do total VU por mês, por
  // isso comparam-se com o período e ignoram os restantes filtros (responsável,
  // status…), que só fariam sentido contra um objetivo por vendedor.
  const gauge = useMemo(() => {
    const noPeriodo = (records ?? []).filter(inPeriod);
    const atual = noPeriodo.filter(r => r.status === 'FATURA').length;
    const previsao = noPeriodo.length;
    const keys = selectedMonthKeys.size === 0 ? Object.keys(objMap) : [...selectedMonthKeys];
    const alvo = (campo: 'bmw' | 'caetano') => keys.reduce((s, k) => s + (objMap[k]?.[campo] ?? 0), 0);
    const mk = (objetivo: number) => ({
      objetivo,
      pct: objetivo > 0 ? (atual / objetivo) * 100 : 0,
      prevPct: objetivo > 0 ? (previsao / objetivo) * 100 : 0,
      falta: Math.max(0, objetivo - atual),
    });
    return { atual, previsao, bmw: mk(alvo('bmw')), caetano: mk(alvo('caetano')) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records, objMap, selectedMonthKeys]);

  const toggleYear = (year: number) => {
    setFYears(prev => prev.includes(year) ? prev.filter(y => y !== year) : [...prev, year].sort());
    setFMonths(prev => prev.filter(k => Math.floor(k / 100) !== year));
  };
  const toggleMonth = (year: number, month: number) => {
    const key = year * 100 + month;
    setFYears(prev => prev.includes(year) ? prev : [...prev, year].sort());
    setFMonths(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key].sort((a, b) => a - b));
  };
  const clearPeriod = () => { setFYears([]); setFMonths([]); };
  // Clique no gráfico (como na WIP VN): barra/eixo seleciona o responsável (Ctrl/Cmd
  // acumula); legenda seleciona a série (Fatura | Carteira); novo clique desmarca.
  const handleRespClick = (resp: string, multi = false) => {
    setSelectedResps(prev => {
      const next = new Set(prev);
      if (multi) { if (next.has(resp)) next.delete(resp); else next.add(resp); }
      else if (next.size === 1 && next.has(resp)) next.clear();
      else { next.clear(); next.add(resp); }
      return next;
    });
  };
  const handleLegendClick = (e: { value?: string }) => {
    const st = e?.value === 'Fatura' ? 'FATURA' : e?.value === 'Carteira' ? 'CARTEIRA' : null;
    if (st) setSelectedStatus(prev => prev === st ? null : st);
  };
  const toggleResp = (resp: string) => {
    setSelectedResps(prev => { const n = new Set(prev); if (n.has(resp)) n.delete(resp); else n.add(resp); return n; });
  };

  const fmtD = (d: Date | null) => d ? new Date(d).toLocaleDateString('pt-PT') : '—';

  const activeFilters =
    selectedResps.size + (selectedStatus ? 1 : 0)
    + (selectedRet !== null ? 1 : 0) + (selectedFin ? 1 : 0) + fYears.length + fMonths.length;

  if (records === null) {
    return <div className="py-20 text-center text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline mr-2" />A carregar dados VU…</div>;
  }

  if (records.length === 0) {
    return (
      <div className="max-w-md mx-auto py-16 text-center space-y-3">
        <Database className="h-10 w-10 mx-auto text-muted-foreground" />
        <h1 className="text-lg font-bold">WIP · Viaturas Usadas</h1>
        <p className="text-sm text-muted-foreground">
          Ainda não há registos VU. Carrega o ficheiro de Viaturas Usadas na secção <strong>Dados</strong> (painel “Gestão de Dados VU”).
        </p>
      </div>
    );
  }

  const selectedYearsSorted = [...fYears].sort((a, b) => b - a);

  return (
    <div className="space-y-3 animate-fade-in">
      <div className="flex flex-col lg:flex-row gap-3">

        {/* Coluna de filtros (à esquerda, como na WIP VN) */}
        <div className="w-full lg:w-48 flex-shrink-0 space-y-2">
          {/* Período */}
          <div className="bg-card border border-border rounded-lg p-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Filter className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-semibold text-foreground">PERÍODO</span>
              </div>
              {(fYears.length > 0 || fMonths.length > 0) && (
                <button onClick={clearPeriod} className="text-[10px] font-medium text-primary hover:underline">Limpar</button>
              )}
            </div>
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Anos</p>
              <div className="flex flex-wrap gap-1.5">
                {periods.years.map(year => {
                  const active = fYears.includes(year);
                  return (
                    <button key={year} onClick={() => toggleYear(year)}
                      className={active
                        ? 'rounded-md border border-primary bg-primary px-2.5 py-1.5 text-[11px] font-semibold text-primary-foreground'
                        : 'rounded-md border border-border bg-background px-2.5 py-1.5 text-[11px] font-medium text-foreground hover:bg-accent'}>
                      {year}
                    </button>
                  );
                })}
              </div>
            </div>
            {selectedYearsSorted.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Meses</p>
                {selectedYearsSorted.map(year => (
                  <div key={year} className="space-y-1">
                    <p className="text-[10px] font-medium text-muted-foreground">{year}</p>
                    <div className="grid grid-cols-3 gap-1.5">
                      {periods.months.filter(m => m.year === year).map(m => {
                        const key = m.year * 100 + m.month;
                        const active = fMonths.includes(key);
                        return (
                          <button key={key} onClick={() => toggleMonth(m.year, m.month)}
                            className={active
                              ? 'rounded-md border border-primary bg-primary px-2 py-1.5 text-[11px] font-semibold text-primary-foreground'
                              : 'rounded-md border border-border bg-background px-2 py-1.5 text-[11px] font-medium text-foreground hover:bg-accent'}>
                            {MESES_PT[m.month - 1]}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Responsável */}
          <div className="bg-card border border-border rounded-lg p-3 space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Responsável</p>
            <div className="flex flex-wrap gap-1.5">
              {resps.map(resp => {
                const active = selectedResps.has(resp);
                return (
                  <button key={resp} onClick={() => toggleResp(resp)}
                    className={active
                      ? 'rounded-md border border-primary bg-primary px-2.5 py-1.5 text-[11px] font-semibold text-primary-foreground'
                      : 'rounded-md border border-border bg-background px-2.5 py-1.5 text-[11px] font-medium text-foreground hover:bg-accent'}>
                    {resp}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Retoma (tri-estado, como na WIP VN) */}
          <div className="bg-card border border-border rounded-lg p-3">
            <RetomaFilter value={selectedRet} onChange={setSelectedRet} />
          </div>

          {/* Filtros ativos */}
          {activeFilters > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-muted-foreground font-medium">Filtros ativos:</span>
              {selectedResps.size > 0 && (
                <Badge variant="secondary" className="text-[10px] cursor-pointer justify-between" onClick={() => setSelectedResps(new Set())}>
                  Resp: {Array.from(selectedResps).join(', ')} ✕
                </Badge>
              )}
              {selectedStatus && <Badge variant="secondary" className="text-[10px] cursor-pointer justify-between" onClick={() => setSelectedStatus(null)}>{selectedStatus === 'FATURA' ? 'Fatura' : 'Carteira'} ✕</Badge>}
              {selectedRet !== null && <Badge variant="secondary" className="text-[10px] cursor-pointer justify-between" onClick={() => setSelectedRet(null)}>Retoma: {selectedRet ? 'Com' : 'Sem'} ✕</Badge>}
              {selectedFin && <Badge variant="secondary" className="text-[10px] cursor-pointer justify-between" onClick={() => setSelectedFin(null)}>FIN: {selectedFin} ✕</Badge>}
              {(fYears.length > 0 || fMonths.length > 0) && <Badge variant="secondary" className="text-[10px] cursor-pointer justify-between" onClick={clearPeriod}>Período ✕</Badge>}
            </div>
          )}
        </div>

        {/* Conteúdo principal */}
        <div className="flex-1 min-w-0 space-y-3">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-start">
            {/* KPIs + status por responsável */}
            <div className="lg:col-span-2 space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Kpi label="Faturas" value={kpis.faturas} color={FATURA_COLOR} />
                <Kpi label="Carteira" value={kpis.carteira} color={CARTEIRA_COLOR} />
                <Kpi label="Total" value={kpis.total} />
                <Kpi label="Retomas" value={kpis.retails} />
              </div>

              <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Faturas / Carteira por responsável</h2>
                  <span className="text-sm font-bold text-primary tabular-nums">{statusByResp.reduce((s, r) => s + r.total, 0)}</span>
                </div>
                {statusByResp.length === 0 ? (
                  <p className="py-8 text-center text-xs text-muted-foreground">Sem registos no período.</p>
                ) : (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={statusByResp} margin={{ top: 16, right: 8, left: -8, bottom: 0 }}
                        onClick={(chartData: { activePayload?: { payload?: { resp?: string } }[] }, event: { ctrlKey?: boolean; metaKey?: boolean }) => {
                          const resp = chartData?.activePayload?.[0]?.payload?.resp;
                          if (resp) handleRespClick(resp, !!(event?.ctrlKey || event?.metaKey));
                        }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="resp" tick={{ fontSize: 11, cursor: 'pointer' }} />
                        <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                        <Tooltip contentStyle={{ fontSize: 11, background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                        <Legend wrapperStyle={{ fontSize: 10, cursor: 'pointer' }} onClick={handleLegendClick}
                          formatter={(value: string) => {
                            const st = value.toUpperCase();
                            return <span style={{ opacity: selectedStatus && selectedStatus !== st ? 0.3 : 1, fontWeight: selectedStatus === st ? 'bold' : 'normal' }}>{value}</span>;
                          }} />
                        <Bar dataKey="Fatura" stackId="a" fill={FATURA_COLOR} cursor="pointer" opacity={selectedStatus && selectedStatus !== 'FATURA' ? 0.2 : 1} />
                        <Bar dataKey="Carteira" stackId="a" fill={CARTEIRA_COLOR} cursor="pointer" opacity={selectedStatus && selectedStatus !== 'CARTEIRA' ? 0.2 : 1}>
                          <LabelList dataKey="total" position="top" fontSize={9} fontWeight="bold" fill="hsl(var(--foreground))" />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-3">
              {/* Realização vs Objetivo — só faturas, contra objetivo BMW e orçamento Caetano */}
              <div className="rounded-xl border-2 border-primary/30 bg-gradient-to-br from-primary/5 to-primary/15 p-3 shadow-sm">
                <p className="text-xs font-bold text-primary uppercase mb-2 tracking-wide text-center">Realização vs Objetivo · Faturas</p>
                <div className="grid grid-cols-2">
                  {([
                    { label: 'Objetivo BMW', color: BMW_COLOR, g: gauge.bmw, border: 'pr-2 border-r-2 border-dashed border-primary/30' },
                    { label: 'Orçamento Caetano', color: FATURA_COLOR, g: gauge.caetano, border: 'pl-2' },
                  ] as const).map(({ label, color, g, border }) => (
                    <div key={label} className={`flex flex-col items-center ${border}`}>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-center" style={{ color }}>{label}</p>
                      <Gauge pct={g.pct} prevPct={g.prevPct} hasObjetivo={g.objetivo > 0} />
                      <div className="grid grid-cols-2 gap-1 w-full text-center">
                        <div>
                          <p className="text-base font-bold text-foreground tabular-nums">{g.objetivo || '—'}</p>
                          <p className="text-[9px] text-muted-foreground">Objetivo</p>
                        </div>
                        <div>
                          <p className="text-base font-bold tabular-nums" style={{ color: g.objetivo > 0 && g.falta === 0 ? FATURA_COLOR : undefined }}>
                            {g.objetivo > 0 ? (g.falta === 0 ? '✓' : g.falta) : '—'}
                          </p>
                          <p className="text-[9px] text-muted-foreground">Falta</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-1 text-center mt-2 pt-2 border-t border-primary/20">
                  <div>
                    <p className="text-base font-extrabold tabular-nums" style={{ color: FATURA_COLOR }}>{gauge.atual}</p>
                    <p className="text-[9px] text-muted-foreground">Faturas</p>
                  </div>
                  <div>
                    <p className="text-base font-bold tabular-nums" style={{ color: CARTEIRA_COLOR }}>{gauge.previsao}</p>
                    <p className="text-[9px] text-muted-foreground">Previsão (● no arco)</p>
                  </div>
                </div>
                {(selectedResps.size > 0 || selectedStatus || selectedRet !== null || selectedFin) && (
                  <p className="mt-2 text-[10px] text-center text-muted-foreground">Gauges do total VU no período (ignoram os filtros de responsável, status, retoma e pagamento).</p>
                )}
                {Object.keys(objMap).length === 0 && (
                  <p className="mt-2 text-[10px] text-center text-muted-foreground">Sem objetivos definidos — ver tab Objetivos.</p>
                )}
              </div>

              {/* Método de Pagamento (FIN) — mesmo formato da WIP VN, clicável para filtrar */}
              <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
                <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-1">Método de Pagamento</h2>
                {finData.length === 0 ? (
                  <p className="py-8 text-center text-xs text-muted-foreground">Sem registos no período.</p>
                ) : (
                  <div className="flex items-center gap-2">
                    <ResponsiveContainer width="50%" height={Math.max(110, finData.length * 28 + 20)}>
                      <PieChart>
                        <Tooltip formatter={(value: number, name) => [`${value} (${Math.round((Number(value) / (filtered.length || 1)) * 100)}%)`, name]}
                          contentStyle={{ fontSize: 11, background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                        <Pie data={finData} dataKey="value" nameKey="name" outerRadius={48} stroke="hsl(var(--background))" strokeWidth={1.5}
                          onClick={(entry: { name?: string }) => entry?.name && setSelectedFin(prev => prev === entry.name ? null : entry.name!)} cursor="pointer">
                          {finData.map(entry => {
                            const isDimmed = selectedFin && selectedFin !== entry.name;
                            return <Cell key={entry.name} fill={finColors[entry.name]} opacity={isDimmed ? 0.35 : 1} />;
                          })}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-1 flex-1">
                      {finData.map(entry => {
                        const isDimmed = selectedFin && selectedFin !== entry.name;
                        return (
                          <div key={entry.name} className="flex items-center gap-2 cursor-pointer" style={{ opacity: isDimmed ? 0.3 : 1 }}
                            onClick={() => setSelectedFin(prev => prev === entry.name ? null : entry.name)}>
                            <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: finColors[entry.name] }} />
                            <span className="text-[10px] font-medium w-9">{entry.name}</span>
                            <span className="text-[10px] font-semibold w-7 text-right">{entry.value}</span>
                            <span className="text-[10px] text-muted-foreground w-10 text-right">({entry.pct}%)</span>
                          </div>
                        );
                      })}
                      <div className="border-t border-border pt-1 mt-1 flex items-center justify-between">
                        <span className="text-[10px] font-semibold">Total</span>
                        <span className="text-[10px] font-bold">{filtered.length}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Tabela de registos */}
          <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  {COLUMNS.map(c => {
                    const active = sort?.key === c.key;
                    const Icon = !active ? ArrowUpDown : sort!.dir === 'asc' ? ArrowUp : ArrowDown;
                    return (
                      <th key={c.key} aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                        className={`font-semibold px-2.5 py-2 ${c.align === 'center' ? 'text-center' : 'text-left'}`}>
                        <button type="button" onClick={() => toggleSort(c.key)}
                          className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-foreground ${active ? 'text-foreground' : ''}`}>
                          {c.label}
                          <Icon className={`h-3 w-3 ${active ? '' : 'opacity-40'}`} />
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={14} className="py-8 text-center text-muted-foreground">Sem registos no período.</td></tr>
                )}
                {sorted.map((r, i) => {
                  const isFatura = r.status === 'FATURA';
                  const prov = (r.prov || '').trim().toUpperCase();
                  return (
                    <tr key={r.id ?? `${r.chassis}-${i}`} className="border-t border-border/70 hover:bg-primary/[0.03]">
                      <td className="px-2.5 py-1.5 font-semibold">{r.resp || '—'}</td>
                      <td className="px-2.5 py-1.5">
                        <span className="inline-flex items-center gap-1">
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: isFatura ? FATURA_COLOR : CARTEIRA_COLOR }} />
                          {isFatura ? 'Fatura' : 'Carteira'}
                        </span>
                      </td>
                      <td className="px-2.5 py-1.5 text-muted-foreground">{r.type || '—'}</td>
                      <td className="px-2.5 py-1.5 font-medium">{r.model || '—'}</td>
                      <td className="px-2.5 py-1.5 text-muted-foreground">{r.version || '—'}</td>
                      <td className="px-2.5 py-1.5 text-muted-foreground truncate max-w-[14rem]">{r.cliente || '—'}</td>
                      <td className="px-2.5 py-1.5 font-mono uppercase">{r.mat || '—'}</td>
                      <td className="px-2.5 py-1.5">
                        {prov ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                            style={{ background: `${provColor(prov)}1f`, color: provColor(prov) }}>
                            <span className="h-1.5 w-1.5 rounded-full" style={{ background: provColor(prov) }} />
                            {prov}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-2.5 py-1.5 text-center tabular-nums">{r.ret > 0 ? '✓' : '—'}</td>
                      <td className="px-2.5 py-1.5 text-center uppercase">{r.fin || '—'}</td>
                      <td className="px-2.5 py-1.5 text-center tabular-nums">{r.a360 > 0 ? '✓' : '—'}</td>
                      <td className="px-2.5 py-1.5 text-center tabular-nums">{fmtD(r.dfat)}</td>
                      <td className="px-2.5 py-1.5 text-center tabular-nums">{fmtGarantia(r.dgarant)}</td>
                      <td className="px-2.5 py-1.5 text-center tabular-nums">{fmtGarantia(r.garant3s)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
