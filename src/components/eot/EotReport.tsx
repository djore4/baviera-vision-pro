import { useMemo, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/components/prospecao/ui';
import { TEMPERATURAS, type ActTipo, type EotContract } from '@/lib/eot';
import {
  REPORT_DIMS, buildReport,
  type ReportBuckets, type ReportDim, type ReportMetric,
} from '@/lib/eot-report';

/* Report: oportunidades ao longo da régua de fim de contrato, cruzadas por fase,
 * próxima ação, temperatura ou responsável. Recebe os contratos já filtrados pela
 * página (mesmos filtros do topo), por isso os totais batem com as outras vistas. */

const NONE_BAR = 'bg-slate-300 dark:bg-slate-600';
const BAR: Record<string, string> = {
  quente: 'bg-red-500', morno: 'bg-amber-500', frio: 'bg-sky-500', none: NONE_BAR,
};

const fmt = (v: number, metric: ReportMetric) =>
  metric === 'n' ? String(v) : v.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR', notation: 'compact', maximumFractionDigits: 1 });

function Segmented<T extends string>({ value, onChange, options, label }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-lg bg-muted/60 p-0.5">
      {options.map(o => (
        <button
          key={o.value} type="button" onClick={() => onChange(o.value)} aria-pressed={value === o.value}
          className={cn(
            'px-2.5 py-1 text-xs rounded-md transition-colors',
            value === o.value ? 'bg-background text-foreground shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground',
          )}
        >{o.label}</button>
      ))}
    </div>
  );
}

export function EotReport({ contracts, nextTipo }: {
  contracts: EotContract[];
  nextTipo: (contrato: string) => ActTipo | null;
}) {
  const [dim, setDim] = useState<ReportDim>('temperatura');
  const [buckets, setBuckets] = useState<ReportBuckets>('mes');
  const [metric, setMetric] = useState<ReportMetric>('n');

  const report = useMemo(
    () => buildReport(contracts, { dim, buckets, metric, nextTipo }),
    [contracts, dim, buckets, metric, nextTipo],
  );
  // A régua em barras é sempre por temperatura, independentemente da tabela.
  const ruler = useMemo(
    () => (dim === 'temperatura' ? report : buildReport(contracts, { dim: 'temperatura', buckets, metric, nextTipo })),
    [contracts, dim, buckets, metric, nextTipo, report],
  );

  if (contracts.length === 0) {
    return <EmptyState icon={BarChart3} title="Sem oportunidades" hint="Nenhum contrato corresponde aos filtros." />;
  }

  const colMax = Math.max(1, ...ruler.colTotals);
  const semValor = contracts.filter(c => c.valor_residual == null).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Segmented<ReportDim> label="Agrupar por" value={dim} onChange={setDim} options={REPORT_DIMS} />
        <Segmented<ReportBuckets> label="Régua" value={buckets} onChange={setBuckets} options={[{ value: 'mes', label: 'Por mês' }, { value: 'prazo', label: 'Por prazo' }]} />
        <Segmented<ReportMetric> label="Medida" value={metric} onChange={setMetric} options={[{ value: 'n', label: 'Contratos' }, { value: 'valor', label: 'Valor residual' }]} />
      </div>

      {/* Régua temporal: uma coluna por período, empilhada por temperatura. */}
      <div className="rounded-xl border border-border bg-card p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Quando terminam · {metric === 'n' ? 'contratos' : 'valor residual a refinanciar'}
          </h3>
          <ul className="flex items-center gap-2.5 text-[11px] text-muted-foreground">
            {[...TEMPERATURAS].reverse().map(t => (
              <li key={t.value} className="inline-flex items-center gap-1"><span className={cn('h-2 w-2 rounded-full', t.dot)} />{t.label}</li>
            ))}
            <li className="inline-flex items-center gap-1"><span className={cn('h-2 w-2 rounded-full', NONE_BAR)} />Sem class.</li>
          </ul>
        </div>
        <div className="overflow-x-auto">
          <div className="flex items-end gap-1.5 min-w-max h-36">
            {ruler.buckets.map((b, i) => {
              const total = ruler.colTotals[i];
              return (
                <div key={b.key} className="flex flex-col items-center justify-end h-full w-12 sm:w-14" title={`${b.label}: ${fmt(total, metric)}`}>
                  <span className="text-[10px] tabular-nums text-muted-foreground mb-0.5">{total > 0 ? fmt(total, metric) : ''}</span>
                  <div className="w-full flex flex-col-reverse justify-start rounded-sm overflow-hidden" style={{ height: `${(total / colMax) * 85}%`, minHeight: total > 0 ? 3 : 0 }}>
                    {ruler.rows.map(r => r.cells[i] > 0 && (
                      <div key={r.key} className={BAR[r.key]} style={{ height: `${(r.cells[i] / total) * 100}%` }} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex gap-1.5 min-w-max mt-1">
            {ruler.buckets.map(b => (
              <div key={b.key} className="w-12 sm:w-14 text-center text-[10px] text-muted-foreground leading-tight">{b.label}</div>
            ))}
          </div>
        </div>
      </div>

      {/* Matriz: linhas = dimensão escolhida, colunas = régua. */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-2 py-1.5 text-left font-medium sticky left-0 bg-muted z-10">{REPORT_DIMS.find(d => d.value === dim)?.label}</th>
                {report.buckets.map(b => <th key={b.key} className="px-2 py-1.5 text-right font-medium whitespace-nowrap">{b.label}</th>)}
                <th className="px-2 py-1.5 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map(r => (
                <tr key={r.key} className="border-b border-border/60 last:border-b-0">
                  <th scope="row" className="px-2 py-1.5 text-left font-medium text-foreground whitespace-nowrap sticky left-0 bg-card z-10">{r.label}</th>
                  {r.cells.map((v, i) => (
                    <td key={i} className="px-2 py-1.5 text-right tabular-nums">
                      {v > 0
                        ? <span className="inline-block min-w-[2rem] rounded px-1.5 py-0.5 text-foreground" style={{ backgroundColor: `hsl(var(--primary) / ${0.08 + 0.32 * (v / report.max)})` }}>{fmt(v, metric)}</span>
                        : <span className="text-muted-foreground/40">·</span>}
                    </td>
                  ))}
                  <td className="px-2 py-1.5 text-right tabular-nums font-semibold">{fmt(r.total, metric)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-muted/30 font-semibold">
                <th scope="row" className="px-2 py-1.5 text-left sticky left-0 bg-muted z-10">Total</th>
                {report.colTotals.map((v, i) => <td key={i} className="px-2 py-1.5 text-right tabular-nums">{v > 0 ? fmt(v, metric) : '·'}</td>)}
                <td className="px-2 py-1.5 text-right tabular-nums">{fmt(report.grandTotal, metric)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {metric === 'valor' && (
        <p className="text-[11px] text-muted-foreground">
          Valor = «Valor residual a refinanciar» do mapa.{' '}
          {semValor > 0
            ? `${semValor} de ${contracts.length} contratos não têm esse valor e contam 0.`
            : 'Todos os contratos têm valor.'}
        </p>
      )}
    </div>
  );
}
