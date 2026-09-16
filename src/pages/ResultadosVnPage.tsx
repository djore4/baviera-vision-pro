import { useMemo, useState } from 'react';
import { LineChart, Info } from 'lucide-react';
import { useData } from '@/contexts/DataContext';
import type { ControlRecord } from '@/types/data';

/* ── Resultados · Vendas VN ────────────────────────────────────────────────────
 * DRAFT. Tabela de resultados de Viaturas Novas com resolução mensal e vistas
 * mensal / trimestral / anual / YTD. Preenche o que é calculável do
 * control_records; o financeiro (faturação, LB1, RAI) fica "—" até termos fonte.
 * ──────────────────────────────────────────────────────────────────────────── */

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const isVNVD = (r: ControlRecord) => r.type === 'VN' || r.type === 'VD';
const monthKeyOf = (d: Date | null) => (d ? d.getFullYear() * 100 + d.getMonth() + 1 : null);

type Mode = 'mensal' | 'trimestral' | 'anual' | 'ytd';
const MODES: { key: Mode; label: string }[] = [
  { key: 'mensal', label: 'Mensal' },
  { key: 'trimestral', label: 'Trimestral' },
  { key: 'anual', label: 'Anual' },
  { key: 'ytd', label: 'YTD' },
];

interface Bd { total: number; bev: number; qor: number; m: number }
interface Row { label: string; total?: boolean; retails: Bd; faturas: Bd; producao: Bd; r: number | null }

function breakdown(rows: ControlRecord[]): Bd {
  return {
    total: rows.length,
    bev: rows.filter(r => r.bev === 1).length,
    qor: rows.filter(r => r.qor === 1).length,
    m: rows.filter(r => r.mPerf === 1).length,
  };
}

export default function ResultadosVnPage() {
  const { data, availablePeriods } = useData();
  const now = new Date();
  const currentYear = now.getFullYear();

  const years = useMemo(() => {
    const ys = availablePeriods.years.length ? [...availablePeriods.years] : [currentYear];
    return ys.sort((a, b) => b - a);
  }, [availablePeriods.years, currentYear]);

  const [year, setYear] = useState<number>(years[0] ?? currentYear);
  const [mode, setMode] = useState<Mode>('mensal');
  const activeYear = years.includes(year) ? year : (years[0] ?? currentYear);

  // Blocos temporais (cada um: rótulo + conjunto de chaves ano/MM).
  const buckets = useMemo(() => {
    const set = (ms: number[]) => new Set(ms.map(m => activeYear * 100 + m));
    const all = Array.from({ length: 12 }, (_, i) => i + 1);
    if (mode === 'mensal') return all.map(m => ({ label: MONTHS[m - 1], set: set([m]) }));
    if (mode === 'trimestral') return [1, 2, 3, 4].map(q => ({ label: `T${q}`, set: set([1, 2, 3].map(i => (q - 1) * 3 + i)) }));
    if (mode === 'anual') return [{ label: String(activeYear), set: set(all) }];
    // YTD: Jan → mês atual (ano corrente) ou ano completo (anos passados).
    const last = activeYear === currentYear ? now.getMonth() + 1 : 12;
    return [{ label: `YTD (Jan–${MONTHS[last - 1]})`, set: set(all.slice(0, last)) }];
  }, [mode, activeYear, currentYear, now]);

  const rows = useMemo<Row[]>(() => {
    const control = data?.control ?? [];
    const computeRow = (label: string, keys: Set<number>, total = false): Row => {
      const inSet = (d: Date | null) => { const k = monthKeyOf(d); return k !== null && keys.has(k); };
      const retails = breakdown(control.filter(r => isVNVD(r) && inSet(r.date298)));
      const faturas = breakdown(control.filter(r => inSet(r.dfat)));
      const producao = breakdown(control.filter(r => isVNVD(r) && inSet(r.neg)));
      const r = producao.total > 0 ? retails.total / producao.total : null;
      return { label, total, retails, faturas, producao, r };
    };
    const out = buckets.map(b => computeRow(b.label, b.set));
    // Linha de total (= ano completo) nas vistas mensal/trimestral.
    if (mode === 'mensal' || mode === 'trimestral') {
      const allYear = new Set(Array.from({ length: 12 }, (_, i) => activeYear * 100 + i + 1));
      out.push(computeRow('Total', allYear, true));
    }
    return out;
  }, [data, buckets, mode, activeYear]);

  const cell = (n: number) => <td className="px-2 py-1.5 text-center tabular-nums">{n}</td>;

  return (
    <div className="space-y-4 min-w-0 overflow-x-clip">
      <header className="flex items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-3 shadow-sm">
        <span className="grid place-items-center h-10 w-10 rounded-xl bg-primary text-primary-foreground shadow-sm shrink-0">
          <LineChart className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-base sm:text-lg font-bold tracking-tight leading-tight truncate">Resultados · Vendas VN</h1>
          <p className="text-xs text-muted-foreground leading-snug line-clamp-1">Retails, faturas e produção de Viaturas Novas.</p>
        </div>
        <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-amber-500/10 text-amber-600 text-[11px] font-semibold px-2.5 py-1">Draft</span>
      </header>

      {/* Controlo: ano + ótica de análise */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-2.5 shadow-sm">
        <select
          value={activeYear}
          onChange={e => setYear(Number(e.target.value))}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm font-medium"
        >
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <div className="inline-flex rounded-md border border-border p-0.5 bg-muted/50">
          {MODES.map(mo => (
            <button
              key={mo.key}
              onClick={() => setMode(mo.key)}
              className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors ${
                mode === mo.key ? 'bg-bmw-blue text-white' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {mo.label}
            </button>
          ))}
        </div>
      </div>

      {!data ? (
        <div className="py-16 text-center text-sm text-muted-foreground">A carregar dados…</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
          <table className="w-full text-sm border-collapse">
            <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr className="bg-muted/40">
                <th rowSpan={2} className="text-left font-semibold px-3 py-2 sticky left-0 bg-muted/40 z-10">Período</th>
                <th colSpan={4} className="text-center font-semibold px-2 py-1.5 border-l border-border" style={{ color: '#1C69D4' }}>Retails</th>
                <th colSpan={4} className="text-center font-semibold px-2 py-1.5 border-l border-border" style={{ color: '#16A34A' }}>Faturas</th>
                <th colSpan={4} className="text-center font-semibold px-2 py-1.5 border-l border-border" style={{ color: '#8B5CF6' }}>Produção</th>
                <th rowSpan={2} className="text-center font-semibold px-2 py-2 border-l border-border" title="Retails ÷ Produção">R</th>
                <th rowSpan={2} className="text-center font-semibold px-2 py-2 border-l border-border">Faturação</th>
                <th colSpan={2} className="text-center font-semibold px-2 py-1.5 border-l border-border">LB1</th>
                <th colSpan={2} className="text-center font-semibold px-2 py-1.5 border-l border-border">RAI</th>
              </tr>
              <tr className="bg-muted/40 text-[10px]">
                {['Total', 'BEV', 'QoR', 'M', 'Total', 'BEV', 'QoR', 'M', 'Total', 'BEV', 'QoR', 'M'].map((h, i) => (
                  <th key={i} className={`text-center font-medium px-2 py-1 ${i % 4 === 0 ? 'border-l border-border' : ''}`}>{h}</th>
                ))}
                <th className="text-center font-medium px-2 py-1 border-l border-border">€</th>
                <th className="text-center font-medium px-2 py-1">%</th>
                <th className="text-center font-medium px-2 py-1 border-l border-border">€</th>
                <th className="text-center font-medium px-2 py-1">%</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri} className={`border-t border-border/70 ${row.total ? 'bg-muted/30 font-bold' : 'hover:bg-primary/[0.03]'}`}>
                  <td className="text-left px-3 py-1.5 font-medium whitespace-nowrap sticky left-0 z-10" style={{ background: row.total ? 'hsl(var(--muted))' : 'hsl(var(--card))' }}>{row.label}</td>
                  <td className="px-2 py-1.5 text-center tabular-nums font-semibold border-l border-border/70">{row.retails.total}</td>
                  {cell(row.retails.bev)}{cell(row.retails.qor)}{cell(row.retails.m)}
                  <td className="px-2 py-1.5 text-center tabular-nums font-semibold border-l border-border/70">{row.faturas.total}</td>
                  {cell(row.faturas.bev)}{cell(row.faturas.qor)}{cell(row.faturas.m)}
                  <td className="px-2 py-1.5 text-center tabular-nums font-semibold border-l border-border/70">{row.producao.total}</td>
                  {cell(row.producao.bev)}{cell(row.producao.qor)}{cell(row.producao.m)}
                  <td className="px-2 py-1.5 text-center tabular-nums border-l border-border/70">{row.r !== null ? `${Math.round(row.r * 100)}%` : '—'}</td>
                  <td className="px-2 py-1.5 text-center text-muted-foreground border-l border-border/70">—</td>
                  <td className="px-2 py-1.5 text-center text-muted-foreground border-l border-border/70">—</td>
                  <td className="px-2 py-1.5 text-center text-muted-foreground">—</td>
                  <td className="px-2 py-1.5 text-center text-muted-foreground border-l border-border/70">—</td>
                  <td className="px-2 py-1.5 text-center text-muted-foreground">—</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground leading-relaxed">
        <Info className="h-4 w-4 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <p><strong className="text-foreground">Definições (a confirmar):</strong> <strong>Retails</strong> = VN/VD com data de retail no mês; <strong>Faturas</strong> = faturados no mês (inclui VP); <strong>Produção</strong> = VN/VD com data de negócio no mês. BEV/QoR/M são subconjuntos. <strong>R</strong> = retails ÷ produção.</p>
          <p><strong>Faturação</strong>, <strong>LB1</strong> e <strong>RAI</strong> exigem dados financeiros (valor/margem) que ainda não existem na fonte — ficam por preencher.</p>
        </div>
      </div>
    </div>
  );
}
