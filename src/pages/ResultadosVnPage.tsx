import { useMemo } from 'react';
import { LineChart, Info } from 'lucide-react';
import { useData } from '@/contexts/DataContext';
import { PeriodFilter } from '@/components/PeriodFilter';
import type { ControlRecord } from '@/types/data';

/* ── Resultados · Vendas VN ────────────────────────────────────────────────────
 * DRAFT. Estrutura de resultados de Viaturas Novas. Preenche o que é calculável
 * a partir do control_records; o que exige dados financeiros (faturação, LB1,
 * RAI) fica marcado como "—" até termos a fonte. As definições de cada métrica
 * estão explícitas em nota de rodapé — para afinar com o negócio.
 * ──────────────────────────────────────────────────────────────────────────── */

const isVNVD = (r: ControlRecord) => r.type === 'VN' || r.type === 'VD';

/** Total + subdivisões BEV / QoR / M de um conjunto de registos. */
function breakdown(rows: ControlRecord[]) {
  return {
    total: rows.length,
    bev: rows.filter(r => r.bev === 1).length,
    qor: rows.filter(r => r.qor === 1).length,
    m: rows.filter(r => r.mPerf === 1).length,
  };
}

export default function ResultadosVnPage() {
  const { data, filter } = useData();

  // Chaves de mês (ano/MM) do período selecionado; vazio = tudo.
  const monthKeys = useMemo(() => {
    const keys = new Set<string>();
    if (filter.months.length > 0) filter.months.forEach(fm => keys.add(`${Math.floor(fm / 100)}/${String(fm % 100).padStart(2, '0')}`));
    else if (filter.years.length > 0) filter.years.forEach(y => { for (let m = 1; m <= 12; m++) keys.add(`${y}/${String(m).padStart(2, '0')}`); });
    return keys;
  }, [filter]);

  const inPeriod = (d: Date | null) => {
    if (!d) return false;
    if (monthKeys.size === 0) return true;
    return monthKeys.has(`${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const metrics = useMemo(() => {
    const control = data?.control ?? [];
    // Retails — VN/VD com data de retail (date298) no período.
    const retails = breakdown(control.filter(r => isVNVD(r) && inPeriod(r.date298)));
    // Faturas — registos faturados (dfat) no período. (Inclui VP — VP conta faturas.)
    const faturas = breakdown(control.filter(r => inPeriod(r.dfat)));
    // Produção — VN/VD com data de negócio (neg) no período.
    const producao = breakdown(control.filter(r => isVNVD(r) && inPeriod(r.neg)));
    // R (Produção/Retail) — rácio de conversão produção → retail.
    const rProdRetail = producao.total > 0 ? retails.total / producao.total : null;
    return { retails, faturas, producao, rProdRetail };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, monthKeys]);

  const volumeRows: { label: string; b: ReturnType<typeof breakdown>; tone?: string }[] = [
    { label: 'Retails', b: metrics.retails, tone: '#1C69D4' },
    { label: 'Faturas', b: metrics.faturas, tone: '#16A34A' },
    { label: 'Produção', b: metrics.producao, tone: '#8B5CF6' },
  ];

  const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : '—');

  return (
    <div className="space-y-4 min-w-0 overflow-x-clip">
      <header className="flex items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-3 shadow-sm">
        <span className="grid place-items-center h-10 w-10 rounded-xl bg-primary text-primary-foreground shadow-sm shrink-0">
          <LineChart className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-base sm:text-lg font-bold tracking-tight leading-tight truncate">Resultados · Vendas VN</h1>
          <p className="text-xs text-muted-foreground leading-snug line-clamp-1">Volume, produção e resultado financeiro de Viaturas Novas.</p>
        </div>
        <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-amber-500/10 text-amber-600 text-[11px] font-semibold px-2.5 py-1">Draft</span>
      </header>

      <PeriodFilter />

      {!data ? (
        <div className="py-16 text-center text-sm text-muted-foreground">A carregar dados…</div>
      ) : (
        <>
          {/* ── Volume: Retails / Faturas / Produção (Total · BEV · QoR · M) ── */}
          <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left font-semibold px-4 py-2.5">Métrica</th>
                  <th className="text-center font-semibold px-3 py-2.5">Total</th>
                  <th className="text-center font-semibold px-3 py-2.5">BEV</th>
                  <th className="text-center font-semibold px-3 py-2.5">QoR</th>
                  <th className="text-center font-semibold px-3 py-2.5">M</th>
                </tr>
              </thead>
              <tbody>
                {volumeRows.map(({ label, b, tone }) => (
                  <tr key={label} className="border-t border-border/70">
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-2 font-medium">
                        <span className="h-2 w-2 rounded-full" style={{ background: tone }} />
                        {label}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center font-bold tabular-nums">{b.total}</td>
                    <td className="px-3 py-2.5 text-center tabular-nums">{b.bev}<span className="text-[10px] text-muted-foreground ml-1">{pct(b.bev, b.total)}</span></td>
                    <td className="px-3 py-2.5 text-center tabular-nums">{b.qor}<span className="text-[10px] text-muted-foreground ml-1">{pct(b.qor, b.total)}</span></td>
                    <td className="px-3 py-2.5 text-center tabular-nums">{b.m}<span className="text-[10px] text-muted-foreground ml-1">{pct(b.m, b.total)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Rácios e financeiro ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiTile
              label="R (Produção/Retail)"
              value={metrics.rProdRetail !== null ? `${(metrics.rProdRetail * 100).toFixed(0)}%` : '—'}
              hint={`${metrics.retails.total} retail / ${metrics.producao.total} produção`}
            />
            <KpiTile label="Faturação" value="—" hint="sem dados de valor (€)" />
            <KpiTile label="LB1" value="— / —" hint="$ / % — sem dados" />
            <KpiTile label="RAI" value="— / —" hint="$ / % — sem dados" />
          </div>

          {/* ── Nota das definições (draft) ── */}
          <div className="flex gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground leading-relaxed">
            <Info className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p><strong className="text-foreground">Definições (a confirmar):</strong> valores no período selecionado acima.</p>
              <p><strong>Retails</strong>: VN/VD com data de retail no período. <strong>Faturas</strong>: registos faturados no período (inclui VP). <strong>Produção</strong>: VN/VD com data de negócio no período. BEV/QoR/M são subconjuntos de cada um.</p>
              <p><strong>R (Produção/Retail)</strong>: retails ÷ produção (conversão). <strong>Faturação</strong>, <strong>LB1</strong> e <strong>RAI</strong> exigem dados financeiros (valor/margem) que ainda não existem na fonte — ficam por preencher.</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function KpiTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-sm flex flex-col gap-1">
      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</span>
      <span className="text-2xl font-bold tabular-nums leading-none">{value}</span>
      {hint && <span className="text-[10px] text-muted-foreground">{hint}</span>}
    </div>
  );
}
