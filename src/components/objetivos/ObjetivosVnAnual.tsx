import { useMemo } from 'react';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useData } from '@/contexts/DataContext';
import { buildAnual, type LinhaAnual } from '@/lib/objetivos-anual';

/* Perspetiva anual dos objetivos VN: tabela Jan–Dez e gráfico com três séries —
 * retails reais, orçamento GSC (Caetano) e objetivo BMW. Clicar num mês abre-o na edição. */

const MONTHS_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const COLOR_RETAILS = '#16A34A';
const COLOR_GSC = '#F59E0B';
const COLOR_BMW = '#1C69D4';

const pctColor = (p: number | null) => p === null ? undefined : p >= 100 ? '#16A34A' : p >= 80 ? '#F59E0B' : '#DC2626';
const Pct = ({ v }: { v: number | null }) => <span style={{ color: pctColor(v) }} className="font-semibold">{v === null ? '—' : `${v}%`}</span>;
const Num = ({ v, futuro = false }: { v: number; futuro?: boolean }) => <>{futuro || v === 0 ? '—' : v}</>;

export default function ObjetivosVnAnual({ ano, mes, onSelectMes }: { ano: number; mes: number; onSelectMes: (m: number) => void }) {
  const { data } = useData();
  const anual = useMemo(
    () => buildAnual(ano, data?.objetivosTotal ?? [], data?.objetivosResp ?? [], data?.control ?? []),
    [ano, data],
  );
  const chart = anual.linhas.map(l => ({
    mes: MONTHS_SHORT[l.mes - 1], Retails: l.futuro ? null : l.retails, 'GSC (Caetano)': l.gsc || null, BMW: l.bmw || null,
  }));
  const t = anual.total;

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-4">
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Perspetiva anual — {ano}</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Retails reais (VN, VD e RMK em estado Retail) face ao orçamento GSC e ao objetivo BMW. Clica num mês para o editar.
        </p>
      </div>

      <div className="h-56" role="img" aria-label={`Retails reais, GSC e BMW por mês em ${ano}`}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chart} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
            <Tooltip contentStyle={{ fontSize: 11 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="Retails" fill={COLOR_RETAILS} radius={[3, 3, 0, 0]} maxBarSize={28} />
            <Line type="monotone" dataKey="GSC (Caetano)" stroke={COLOR_GSC} strokeWidth={2} dot={{ r: 2.5 }} connectNulls />
            <Line type="monotone" dataKey="BMW" stroke={COLOR_BMW} strokeWidth={2} dot={{ r: 2.5 }} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-2.5 py-2 text-left font-semibold">Mês</th>
              <th className="px-2.5 py-2 text-center font-semibold" title="Soma dos objetivos dos vendedores (negócios)">Σ Vendedores</th>
              <th className="px-2.5 py-2 text-center font-semibold" style={{ color: COLOR_GSC }}>GSC</th>
              <th className="px-2.5 py-2 text-center font-semibold" style={{ color: COLOR_BMW }}>BMW</th>
              <th className="px-2.5 py-2 text-center font-semibold" style={{ color: COLOR_RETAILS }}>Retails</th>
              <th className="px-2.5 py-2 text-center font-semibold">% GSC</th>
              <th className="px-2.5 py-2 text-center font-semibold">% BMW</th>
            </tr>
          </thead>
          <tbody>
            {anual.linhas.map((l: LinhaAnual) => (
              <tr
                key={l.key}
                onClick={() => onSelectMes(l.mes)}
                aria-current={l.mes === mes ? 'true' : undefined}
                className={`border-t border-border/70 cursor-pointer transition-colors hover:bg-muted/40 ${l.mes === mes ? 'bg-amber-500/10' : ''}`}
              >
                <td className="px-2.5 py-1.5 font-medium">{MONTHS_SHORT[l.mes - 1]}</td>
                <td className="px-2.5 py-1.5 text-center tabular-nums"><Num v={l.vendedores} /></td>
                <td className="px-2.5 py-1.5 text-center tabular-nums"><Num v={l.gsc} /></td>
                <td className="px-2.5 py-1.5 text-center tabular-nums"><Num v={l.bmw} /></td>
                <td className="px-2.5 py-1.5 text-center tabular-nums font-semibold"><Num v={l.retails} futuro={l.futuro} /></td>
                <td className="px-2.5 py-1.5 text-center tabular-nums"><Pct v={l.pctGsc} /></td>
                <td className="px-2.5 py-1.5 text-center tabular-nums"><Pct v={l.pctBmw} /></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-primary/40 bg-primary/10 font-bold">
              <td className="px-2.5 py-2">Total {ano}</td>
              <td className="px-2.5 py-2 text-center tabular-nums">{t.vendedores}</td>
              <td className="px-2.5 py-2 text-center tabular-nums">{t.gsc}</td>
              <td className="px-2.5 py-2 text-center tabular-nums">{t.bmw}</td>
              <td className="px-2.5 py-2 text-center tabular-nums">{t.retails}</td>
              <td className="px-2.5 py-2 text-center tabular-nums"><Pct v={t.pctGsc} /></td>
              <td className="px-2.5 py-2 text-center tabular-nums"><Pct v={t.pctBmw} /></td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-[10px] text-muted-foreground">
        O total do ano compara os retails já feitos com o objetivo do ano inteiro. Os meses por começar não têm retails nem percentagem.
      </p>
    </div>
  );
}
