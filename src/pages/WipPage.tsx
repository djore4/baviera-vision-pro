import { useEffect, useMemo, useState } from 'react';
import { ClipboardList, Loader2, Database, Filter } from 'lucide-react';
import { toast } from 'sonner';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LabelList,
  PieChart, Pie, Cell,
} from 'recharts';
import { Badge } from '@/components/ui/badge';
import { RetomaFilter } from '@/components/RetomaFilter';
import { usePermissions } from '@/contexts/PermissionsContext';
import {
  loadControlVuFromDb, listVuObjetivos, setVuObjetivo, isVuWipStatus, type VuRecord,
} from '@/lib/control-records-vu';

/* ── WIP · Viaturas Usadas ─────────────────────────────────────────────────────
 * Dashboard da secção VU, alimentado pela tabela control_records_vu (ficheiro VU
 * carregado em Dados). Registos com STATUS = FATURA | CARTEIRA. O gauge de
 * Realização vs Objetivo é apenas na ótica das FATURAS. Filtros à esquerda (mesma
 * organização da WIP VN): período (pelo mês da fatura, DFAT), responsável, status
 * e proveniência.
 * ──────────────────────────────────────────────────────────────────────────── */

const FATURA_COLOR = '#16A34A';
const CARTEIRA_COLOR = '#F59E0B';

/* Método de pagamento (mesma paleta e formato da WIP VN). */
const FIN_COLORS: Record<string, string> = { PP: '#1C69D4', FS: '#16A34A', EXT: '#F59E0B', FEXT: '#F59E0B', FINT: '#8B5CF6' };
const FIN_FALLBACK = ['#1C69D4', '#16A34A', '#DC2626', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316'];
const finColor = (name: string, i: number) =>
  name === 'N/A' ? '#94A3B8' : (FIN_COLORS[name.trim().toUpperCase()] ?? FIN_FALLBACK[i % FIN_FALLBACK.length]);

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
const periodLabel = (key: string) => { const [y, m] = key.split('/'); return `${MESES_PT[Number(m) - 1] ?? m} ${y}`; };

function Kpi({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="text-2xl font-bold tabular-nums leading-none" style={color ? { color } : undefined}>{value}</div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mt-1">{label}</div>
    </div>
  );
}

/* Gauge semicircular (0–100%+). Arco de fundo + arco de valor + marca de previsão. */
function Gauge({ pct, prevPct }: { pct: number; prevPct: number }) {
  const R = 80, CX = 100, CY = 100;
  const len = Math.PI * R;
  const clamp = (p: number) => Math.max(0, Math.min(100, p));
  const valLen = (clamp(pct) / 100) * len;
  const arc = `M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`;
  const markAngle = Math.PI * (1 - clamp(prevPct) / 100);
  const mx = CX + R * Math.cos(markAngle);
  const my = CY - R * Math.sin(markAngle);
  return (
    <svg viewBox="0 0 200 116" className="w-full max-w-[240px]">
      <path d={arc} fill="none" stroke="hsl(var(--muted))" strokeWidth={16} strokeLinecap="round" />
      <path d={arc} fill="none" stroke={FATURA_COLOR} strokeWidth={16} strokeLinecap="round"
        pathLength={len} strokeDasharray={`${valLen} ${len}`} />
      {/* marca da previsão (faturas + carteira) */}
      <circle cx={mx} cy={my} r={5} fill="hsl(var(--foreground))" stroke="hsl(var(--card))" strokeWidth={2} />
      <text x={CX} y={CY - 8} textAnchor="middle" className="fill-foreground" style={{ fontSize: 30, fontWeight: 800 }}>
        {Math.round(pct)}%
      </text>
      <text x={CX} y={CY + 12} textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: 11 }}>Faturas</text>
    </svg>
  );
}

export default function WipPage() {
  const { canEdit } = usePermissions();
  const canEditWip = canEdit('wip');
  const [records, setRecords] = useState<VuRecord[] | null>(null);
  const [objMap, setObjMap] = useState<Record<string, number>>({});

  // Filtros (mesma organização da WIP VN).
  const [fYears, setFYears] = useState<number[]>([]);
  const [fMonths, setFMonths] = useState<number[]>([]); // chave = ano*100 + mês
  const [selectedResps, setSelectedResps] = useState<Set<string>>(new Set());
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null); // FATURA | CARTEIRA
  const [selectedProv, setSelectedProv] = useState<string | null>(null);
  const [selectedRet, setSelectedRet] = useState<boolean | null>(null); // retoma: null=todos, true=com, false=sem
  const [selectedFin, setSelectedFin] = useState<string | null>(null); // método de pagamento (PP | FS | EXT | N/A)
  const [objDraft, setObjDraft] = useState<string>('');

  useEffect(() => {
    let alive = true;
    Promise.all([loadControlVuFromDb(), listVuObjetivos()])
      .then(([recs, objs]) => {
        if (!alive) return;
        // Os negócios do funil (FRIO/MORNO/QUENTE) não entram na WIP.
        setRecords(recs.filter(r => isVuWipStatus(r.status)));
        setObjMap(Object.fromEntries(objs.map(o => [o.mes, o.faturas])));
      })
      .catch(() => { if (alive) setRecords([]); });
    return () => { alive = false; };
  }, []);

  const periods = useMemo(() => {
    const years = new Set<number>();
    const months = new Map<number, { year: number; month: number }>();
    (records ?? []).forEach(r => {
      if (!r.dfat) return;
      const y = r.dfat.getFullYear(), m = r.dfat.getMonth() + 1;
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
    return !!r.dfat && selectedMonthKeys.has(monthKeyStr(r.dfat));
  };

  const filtered = useMemo(() => {
    let result = records ?? [];
    result = result.filter(inPeriod);
    if (selectedResps.size > 0) result = result.filter(r => selectedResps.has(r.resp || '—'));
    if (selectedStatus) result = result.filter(r => r.status === selectedStatus);
    if (selectedProv) result = result.filter(r => (r.prov || '').trim().toUpperCase() === selectedProv);
    if (selectedRet !== null) result = result.filter(r => (r.ret > 0) === selectedRet);
    if (selectedFin) result = result.filter(r => selectedFin === 'N/A' ? !r.fin : (r.fin || '').trim().toUpperCase() === selectedFin);
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records, selectedMonthKeys, selectedResps, selectedStatus, selectedProv, selectedRet, selectedFin]);

  const resps = useMemo(() => {
    const set = new Set<string>();
    (records ?? []).forEach(r => set.add(r.resp || '—'));
    return [...set].sort();
  }, [records]);

  const provs = useMemo(() => {
    const set = new Set<string>();
    (records ?? []).forEach(r => { const p = (r.prov || '').trim().toUpperCase(); if (p) set.add(p); });
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

  // Gauge — só ótica da fatura: atual = faturas do período; previsão = faturas +
  // carteira (esperadas); objetivo = soma das metas dos meses selecionados.
  const gauge = useMemo(() => {
    const atual = filtered.filter(r => r.status === 'FATURA').length;
    const previsao = filtered.length;
    const objetivo = selectedMonthKeys.size === 0
      ? Object.values(objMap).reduce((s, v) => s + v, 0)
      : [...selectedMonthKeys].reduce((s, k) => s + (objMap[k] ?? 0), 0);
    const pct = objetivo > 0 ? (atual / objetivo) * 100 : 0;
    const prevPct = objetivo > 0 ? (previsao / objetivo) * 100 : 0;
    return { atual, previsao, objetivo, pct, prevPct };
  }, [filtered, objMap, selectedMonthKeys]);

  // Edição do objetivo: só faz sentido com um único mês selecionado.
  const singleMonth = fMonths.length === 1 ? `${Math.floor(fMonths[0] / 100)}/${String(fMonths[0] % 100).padStart(2, '0')}` : null;

  const saveObjetivo = async () => {
    if (!singleMonth) return;
    const v = Number(objDraft);
    if (!Number.isFinite(v) || v < 0) { setObjDraft(''); return; }
    try {
      await setVuObjetivo(singleMonth, v);
      setObjMap(prev => ({ ...prev, [singleMonth]: v }));
      setObjDraft('');
      toast.success('Objetivo VU atualizado.');
    } catch (e) { toast.error('Falha ao guardar objetivo: ' + (e as Error).message); }
  };

  const toggleYear = (year: number) => {
    setFYears(prev => prev.includes(year) ? prev.filter(y => y !== year) : [...prev, year].sort());
    setFMonths(prev => prev.filter(k => Math.floor(k / 100) !== year));
    setObjDraft('');
  };
  const toggleMonth = (year: number, month: number) => {
    const key = year * 100 + month;
    setFYears(prev => prev.includes(year) ? prev : [...prev, year].sort());
    setFMonths(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key].sort((a, b) => a - b));
    setObjDraft('');
  };
  const clearPeriod = () => { setFYears([]); setFMonths([]); setObjDraft(''); };
  const toggleResp = (resp: string) => {
    setSelectedResps(prev => { const n = new Set(prev); if (n.has(resp)) n.delete(resp); else n.add(resp); return n; });
  };

  const fmtD = (d: Date | null) => d ? new Date(d).toLocaleDateString('pt-PT') : '—';

  const activeFilters =
    selectedResps.size + (selectedStatus ? 1 : 0) + (selectedProv ? 1 : 0)
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

          {/* Status */}
          <div className="bg-card border border-border rounded-lg p-3 space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Status</p>
            <div className="grid grid-cols-2 gap-1.5">
              {(['FATURA', 'CARTEIRA'] as const).map(st => {
                const active = selectedStatus === st;
                const color = st === 'FATURA' ? FATURA_COLOR : CARTEIRA_COLOR;
                return (
                  <button key={st} onClick={() => setSelectedStatus(prev => prev === st ? null : st)}
                    className={`rounded-md border px-2 py-1.5 text-[11px] font-semibold transition-all ${active ? 'text-primary-foreground' : 'bg-background text-foreground hover:bg-accent border-border'}`}
                    style={active ? { background: color, borderColor: color } : undefined}>
                    {st === 'FATURA' ? 'Fatura' : 'Carteira'}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Retoma (tri-estado, como na WIP VN) */}
          <div className="bg-card border border-border rounded-lg p-3">
            <RetomaFilter value={selectedRet} onChange={setSelectedRet} />
          </div>

          {/* Proveniência */}
          {provs.length > 0 && (
            <div className="bg-card border border-border rounded-lg p-3 space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Proveniência</p>
              <div className="flex flex-col gap-1">
                {provs.map(p => {
                  const active = selectedProv === p;
                  return (
                    <button key={p} onClick={() => setSelectedProv(prev => prev === p ? null : p)}
                      className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-[11px] font-medium transition-all ${active ? 'border-primary ring-1 ring-primary bg-primary/10' : 'border-border bg-background hover:bg-accent'}`}>
                      <span className="h-2.5 w-2.5 rounded-sm flex-shrink-0" style={{ background: provColor(p) }} />
                      {p}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

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
              {selectedProv && <Badge variant="secondary" className="text-[10px] cursor-pointer justify-between" onClick={() => setSelectedProv(null)}>{selectedProv} ✕</Badge>}
              {selectedRet !== null && <Badge variant="secondary" className="text-[10px] cursor-pointer justify-between" onClick={() => setSelectedRet(null)}>Retoma: {selectedRet ? 'Com' : 'Sem'} ✕</Badge>}
              {selectedFin && <Badge variant="secondary" className="text-[10px] cursor-pointer justify-between" onClick={() => setSelectedFin(null)}>FIN: {selectedFin} ✕</Badge>}
              {(fYears.length > 0 || fMonths.length > 0) && <Badge variant="secondary" className="text-[10px] cursor-pointer justify-between" onClick={clearPeriod}>Período ✕</Badge>}
            </div>
          )}
        </div>

        {/* Conteúdo principal */}
        <div className="flex-1 min-w-0 space-y-3">
          <header className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-3 shadow-sm">
            <span className="grid place-items-center h-10 w-10 rounded-xl bg-primary text-primary-foreground shadow-sm shrink-0">
              <ClipboardList className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="text-base sm:text-lg font-bold tracking-tight leading-tight truncate">WIP · Viaturas Usadas</h1>
              <p className="text-xs text-muted-foreground leading-snug line-clamp-1">{filtered.length} de {records.length} registos VU.</p>
            </div>
          </header>

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
                      <BarChart data={statusByResp} margin={{ top: 16, right: 8, left: -8, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="resp" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                        <Tooltip contentStyle={{ fontSize: 11, background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                        <Bar dataKey="Fatura" stackId="a" fill={FATURA_COLOR} />
                        <Bar dataKey="Carteira" stackId="a" fill={CARTEIRA_COLOR}>
                          <LabelList dataKey="total" position="top" fontSize={9} fontWeight="bold" fill="hsl(var(--foreground))" />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
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
                          {finData.map((entry, i) => {
                            const isDimmed = selectedFin && selectedFin !== entry.name;
                            return <Cell key={entry.name} fill={finColor(entry.name, i)} opacity={isDimmed ? 0.35 : 1} />;
                          })}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-1 flex-1">
                      {finData.map((entry, i) => {
                        const isDimmed = selectedFin && selectedFin !== entry.name;
                        return (
                          <div key={entry.name} className="flex items-center gap-2 cursor-pointer" style={{ opacity: isDimmed ? 0.3 : 1 }}
                            onClick={() => setSelectedFin(prev => prev === entry.name ? null : entry.name)}>
                            <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: finColor(entry.name, i) }} />
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

            {/* Realização vs Objetivo — só faturas */}
            <div className="rounded-xl border-2 border-primary/30 bg-gradient-to-br from-primary/5 to-primary/15 p-3 shadow-sm">
              <p className="text-xs font-bold text-primary uppercase mb-1 tracking-wide text-center">Realização vs Objetivo · Faturas</p>
              <div className="flex justify-center">
                <Gauge pct={gauge.pct} prevPct={gauge.prevPct} />
              </div>
              <div className="grid grid-cols-3 gap-1 text-center mt-1">
                <div>
                  <p className="text-base font-bold text-foreground tabular-nums">{gauge.objetivo || '—'}</p>
                  <p className="text-[9px] text-muted-foreground">Objetivo</p>
                </div>
                <div>
                  <p className="text-base font-extrabold tabular-nums" style={{ color: FATURA_COLOR }}>{gauge.atual}</p>
                  <p className="text-[9px] text-muted-foreground">Faturas</p>
                </div>
                <div>
                  <p className="text-base font-bold tabular-nums" style={{ color: CARTEIRA_COLOR }}>{gauge.previsao}</p>
                  <p className="text-[9px] text-muted-foreground">Previsão</p>
                </div>
              </div>
              {/* Editar objetivo do mês (só com um único mês selecionado) */}
              {!singleMonth ? (
                <p className="mt-2 text-[10px] text-center text-muted-foreground">Seleciona um único mês nos filtros para definir/editar o objetivo.</p>
              ) : canEditWip ? (
                <div className="mt-2 flex items-center gap-1.5">
                  <input
                    type="number" min={0}
                    value={objDraft}
                    onChange={e => setObjDraft(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && saveObjetivo()}
                    placeholder={`Objetivo ${periodLabel(singleMonth)}…`}
                    className="h-8 flex-1 min-w-0 rounded-md border border-input bg-background px-2 text-xs"
                  />
                  <button onClick={saveObjetivo} disabled={objDraft === ''} className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50">Guardar</button>
                </div>
              ) : (
                <p className="mt-2 text-[10px] text-center text-muted-foreground">Objetivo definido pela gestão.</p>
              )}
            </div>
          </div>

          {/* Tabela de registos */}
          <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left font-semibold px-2.5 py-2">Resp</th>
                  <th className="text-left font-semibold px-2.5 py-2">Status</th>
                  <th className="text-left font-semibold px-2.5 py-2">Tipo</th>
                  <th className="text-left font-semibold px-2.5 py-2">Modelo</th>
                  <th className="text-left font-semibold px-2.5 py-2">Versão</th>
                  <th className="text-left font-semibold px-2.5 py-2">Cliente</th>
                  <th className="text-left font-semibold px-2.5 py-2">Matrícula</th>
                  <th className="text-left font-semibold px-2.5 py-2">Proveniência</th>
                  <th className="text-center font-semibold px-2.5 py-2">RET</th>
                  <th className="text-center font-semibold px-2.5 py-2">FIN</th>
                  <th className="text-center font-semibold px-2.5 py-2">360º</th>
                  <th className="text-center font-semibold px-2.5 py-2">Fatura</th>
                  <th className="text-center font-semibold px-2.5 py-2">DGarant</th>
                  <th className="text-center font-semibold px-2.5 py-2">Garant 3S</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={14} className="py-8 text-center text-muted-foreground">Sem registos no período.</td></tr>
                )}
                {filtered.map((r, i) => {
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
