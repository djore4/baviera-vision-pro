import { useEffect, useMemo, useState } from 'react';
import { ClipboardList, Loader2, Database } from 'lucide-react';
import { toast } from 'sonner';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LabelList,
} from 'recharts';
import { usePermissions } from '@/contexts/PermissionsContext';
import {
  loadControlVuFromDb, listVuObjetivos, setVuObjetivo,
} from '@/lib/control-records-vu';
import type { ControlRecord } from '@/types/data';

/* ── WIP · Viaturas Usadas ─────────────────────────────────────────────────────
 * Dashboard da secção VU, alimentado pela tabela control_records_vu (registos
 * type='VU' do ficheiro VU carregado em Dados). Inclui o gauge de Realização vs
 * Objetivo apenas na ótica das FATURAS (objetivo mensal editável).
 * ──────────────────────────────────────────────────────────────────────────── */

const STATUS_COLORS: Record<string, string> = { Retail: '#1C69D4', Matricula: '#06B6D4', Carteira: '#F59E0B' };
const STATUS_LABELS: Record<string, string> = { Retail: 'Retail', Matricula: 'Matrícula', Carteira: 'Carteira' };
const FATURA_COLOR = '#16A34A';

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
      {/* marca da previsão */}
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
  const [records, setRecords] = useState<ControlRecord[] | null>(null);
  const [objMap, setObjMap] = useState<Record<string, number>>({});
  const [fMes, setFMes] = useState<string>('Todos');
  const [objDraft, setObjDraft] = useState<string>('');

  useEffect(() => {
    let alive = true;
    Promise.all([loadControlVuFromDb(), listVuObjetivos()])
      .then(([recs, objs]) => {
        if (!alive) return;
        setRecords(recs);
        setObjMap(Object.fromEntries(objs.map(o => [o.mes, o.faturas])));
      })
      .catch(() => { if (alive) setRecords([]); });
    return () => { alive = false; };
  }, []);

  const meses = useMemo(() => {
    const set = new Set<string>();
    (records ?? []).forEach(r => { if (r.mes1) set.add(r.mes1); });
    return ['Todos', ...[...set].sort().reverse()];
  }, [records]);

  const filtered = useMemo(() => {
    const all = records ?? [];
    return fMes === 'Todos' ? all : all.filter(r => r.mes1 === fMes);
  }, [records, fMes]);

  const statusByResp = useMemo(() => {
    const map: Record<string, { resp: string; Retail: number; Matricula: number; Carteira: number; total: number }> = {};
    filtered.forEach(r => {
      const resp = r.resp || '—';
      if (!map[resp]) map[resp] = { resp, Retail: 0, Matricula: 0, Carteira: 0, total: 0 };
      if (r.status === 'Retail') { map[resp].Retail++; map[resp].total++; }
      else if (r.status === 'Matricula') { map[resp].Matricula++; map[resp].total++; }
      else if (r.status === 'Carteira') { map[resp].Carteira++; map[resp].total++; }
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [filtered]);

  const kpis = useMemo(() => {
    let retails = 0, matriculas = 0, carteira = 0, faturas = 0;
    for (const r of filtered) {
      if (r.status === 'Retail') retails++;
      else if (r.status === 'Matricula') matriculas++;
      else if (r.status === 'Carteira') carteira++;
      if (r.dfat) faturas++;
    }
    return { retails, matriculas, carteira, faturas };
  }, [filtered]);

  // Gauge de faturas: atual = registos VU faturados no período; previsão = todos
  // os registos VU do período (esperam faturar); objetivo = meta do mês (ou soma).
  const gauge = useMemo(() => {
    const atual = filtered.filter(r => r.dfat).length;
    const previsao = filtered.filter(r => r.status !== 'Perdido').length;
    const objetivo = fMes === 'Todos'
      ? Object.values(objMap).reduce((s, v) => s + v, 0)
      : (objMap[fMes] ?? 0);
    const pct = objetivo > 0 ? (atual / objetivo) * 100 : 0;
    const prevPct = objetivo > 0 ? (previsao / objetivo) * 100 : 0;
    return { atual, previsao, objetivo, pct, prevPct };
  }, [filtered, objMap, fMes]);

  const saveObjetivo = async () => {
    if (fMes === 'Todos') return;
    const v = Number(objDraft);
    if (!Number.isFinite(v) || v < 0) { setObjDraft(''); return; }
    try {
      await setVuObjetivo(fMes, v);
      setObjMap(prev => ({ ...prev, [fMes]: v }));
      setObjDraft('');
      toast.success('Objetivo VU atualizado.');
    } catch (e) { toast.error('Falha ao guardar objetivo: ' + (e as Error).message); }
  };

  const fmtD = (d: Date | null) => d ? new Date(d).toLocaleDateString('pt-PT') : '—';

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

  return (
    <div className="space-y-4 min-w-0 overflow-x-clip">
      <header className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-3 shadow-sm">
        <span className="grid place-items-center h-10 w-10 rounded-xl bg-primary text-primary-foreground shadow-sm shrink-0">
          <ClipboardList className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-base sm:text-lg font-bold tracking-tight leading-tight truncate">WIP · Viaturas Usadas</h1>
          <p className="text-xs text-muted-foreground leading-snug line-clamp-1">{filtered.length} de {records.length} registos VU.</p>
        </div>
        <select value={fMes} onChange={e => { setFMes(e.target.value); setObjDraft(''); }} className="h-9 rounded-md border border-input bg-background px-2 text-sm font-medium">
          {meses.map(m => <option key={m} value={m}>{m === 'Todos' ? 'Todos os meses' : m}</option>)}
        </select>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        {/* KPIs + status por responsável */}
        <div className="lg:col-span-2 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Kpi label="Retails" value={kpis.retails} color={STATUS_COLORS.Retail} />
            <Kpi label="Faturas" value={kpis.faturas} color={FATURA_COLOR} />
            <Kpi label="Matrículas" value={kpis.matriculas} color={STATUS_COLORS.Matricula} />
            <Kpi label="Carteira" value={kpis.carteira} color={STATUS_COLORS.Carteira} />
          </div>

          <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Status por responsável</h2>
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
                    <Legend wrapperStyle={{ fontSize: 10 }} formatter={(v: string) => STATUS_LABELS[v] ?? v} />
                    <Bar dataKey="Retail" stackId="a" fill={STATUS_COLORS.Retail} />
                    <Bar dataKey="Matricula" stackId="a" fill={STATUS_COLORS.Matricula} />
                    <Bar dataKey="Carteira" stackId="a" fill={STATUS_COLORS.Carteira}>
                      <LabelList dataKey="total" position="top" fontSize={9} fontWeight="bold" fill="hsl(var(--foreground))" />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
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
              <p className="text-[9px] text-muted-foreground">Atual</p>
            </div>
            <div>
              <p className="text-base font-bold text-muted-foreground tabular-nums">{gauge.previsao}</p>
              <p className="text-[9px] text-muted-foreground">Previsão</p>
            </div>
          </div>
          {/* Editar objetivo do mês */}
          {fMes === 'Todos' ? (
            <p className="mt-2 text-[10px] text-center text-muted-foreground">Escolhe um mês para definir/editar o objetivo.</p>
          ) : canEditWip ? (
            <div className="mt-2 flex items-center gap-1.5">
              <input
                type="number" min={0}
                value={objDraft}
                onChange={e => setObjDraft(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && saveObjetivo()}
                placeholder={`Objetivo ${fMes}…`}
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
              <th className="text-left font-semibold px-2.5 py-2">Modelo</th>
              <th className="text-left font-semibold px-2.5 py-2">Versão</th>
              <th className="text-left font-semibold px-2.5 py-2">Cliente</th>
              <th className="text-left font-semibold px-2.5 py-2">Matrícula</th>
              <th className="text-center font-semibold px-2.5 py-2">Retail (298)</th>
              <th className="text-center font-semibold px-2.5 py-2">Fatura</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="py-8 text-center text-muted-foreground">Sem registos no período.</td></tr>
            )}
            {filtered.map(r => (
              <tr key={r.id ?? r.chas} className="border-t border-border/70 hover:bg-primary/[0.03]">
                <td className="px-2.5 py-1.5 font-semibold">{r.resp || '—'}</td>
                <td className="px-2.5 py-1.5">
                  <span className="inline-flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: STATUS_COLORS[r.status] ?? 'hsl(var(--muted-foreground))' }} />
                    {STATUS_LABELS[r.status] ?? (r.status || '—')}
                  </span>
                </td>
                <td className="px-2.5 py-1.5 font-medium">{r.model || '—'}</td>
                <td className="px-2.5 py-1.5 text-muted-foreground">{r.version || '—'}</td>
                <td className="px-2.5 py-1.5 text-muted-foreground truncate max-w-[14rem]">{r.cliente || '—'}</td>
                <td className="px-2.5 py-1.5 font-mono uppercase">{r.mat || '—'}</td>
                <td className="px-2.5 py-1.5 text-center tabular-nums">{fmtD(r.date298)}</td>
                <td className="px-2.5 py-1.5 text-center tabular-nums">{fmtD(r.dfat)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
