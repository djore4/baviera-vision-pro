import { useEffect, useMemo, useState } from 'react';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip, Legend,
} from 'recharts';
import { Loader2 } from 'lucide-react';
import {
  QUALITY_METRICS, QUALITY_MIN, QUALITY_MAX, type QualityScores, type QualityRow,
  getLatestScores, averageScores,
} from '@/lib/quality';

/* ── Cartão Qualidade do Serviço (read-only) ──────────────────────────────────
 * Mostra, no tab Performance, o resultado das notas de qualidade — o mesmo
 * gráfico de aranha gerido no separador Qualidade (admin / chefe de vendas), mas
 * só de leitura. Assim um vendedor consulta aqui a sua qualidade, mesmo sem ver
 * o separador de gestão. Respeita o filtro de vendedor da própria página:
 *   - sem vendedor selecionado → média da equipa;
 *   - com vendedores → as suas teias sobrepostas.
 * Usa sempre o mês mais recente com notas lançadas.
 * ──────────────────────────────────────────────────────────────────────────── */

const PT_MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
const RADIUS_TICKS = [0, 2, 4, 6, 8, 10];
const PALETTE = ['#16A34A', '#F59E0B', '#DC2626', '#8B5CF6', '#0EA5E9', '#EC4899', '#14B8A6', '#F97316', '#64748B', '#1C69D4'];
const AVG_COLOR = '#1C69D4';

const scoresFromRow = (r: QualityRow): QualityScores =>
  QUALITY_METRICS.reduce((acc, m) => { acc[m.key] = Number(r[m.key]) || 0; return acc; }, {} as QualityScores);
const fmtNum = (n: number) => Number(n.toFixed(2));

export function QualityRadarCard({ selectedResps }: { selectedResps: Set<string> }) {
  const [state, setState] = useState<{ year: number; month: number; rows: QualityRow[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showAvg, setShowAvg] = useState(true);   // média sobreposta (toggle independente)

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true); setError(false);
      try {
        const res = await getLatestScores();
        if (alive) setState(res);
      } catch (e) {
        console.error(e);
        if (alive) setError(true);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const rows = useMemo(() => state?.rows ?? [], [state]);

  // Vendedores com notas no mês (ordem alfabética estável → cor estável).
  const vendedores = useMemo(
    () => Array.from(new Set(rows.map(r => r.vendedor))).sort((a, b) => a.localeCompare(b)),
    [rows]);
  const rowByVendedor = useMemo(() => {
    const m = new Map<string, QualityRow>();
    rows.forEach(r => m.set(r.vendedor, r));
    return m;
  }, [rows]);

  const teamAvg = useMemo(() => averageScores(rows), [rows]);

  // Vendedores selecionados (no filtro da página) que têm notas neste mês.
  const shownResps = useMemo(
    () => vendedores.filter(v => selectedResps.has(v)),
    [vendedores, selectedResps]);

  // A média é uma teia independente que se pode sobrepor aos vendedores. Sem
  // vendedores selecionados mostra-se sempre a média (o gráfico nunca fica vazio).
  const avgShown = showAvg || shownResps.length === 0;

  // Séries desenhadas: média (se ligada) + cada vendedor selecionado.
  const series = useMemo<{ key: string; color: string; scores: QualityScores }[]>(() => {
    const out: { key: string; color: string; scores: QualityScores }[] = [];
    if (avgShown) out.push({ key: 'Média', color: AVG_COLOR, scores: teamAvg });
    shownResps.forEach(v => out.push({
      key: v,
      color: PALETTE[Math.max(0, vendedores.indexOf(v)) % PALETTE.length],
      scores: scoresFromRow(rowByVendedor.get(v)!),
    }));
    return out;
  }, [avgShown, shownResps, teamAvg, rowByVendedor, vendedores]);

  const chartData = useMemo(
    () => QUALITY_METRICS.map(m => {
      const row: Record<string, number | string> = { metric: m.label };
      series.forEach(s => { row[s.key] = fmtNum(s.scores[m.key]); });
      return row;
    }),
    [series]);

  const single = series.length === 1;

  // Vendedores selecionados sem notas neste mês (contexto para o rodapé).
  const missing = useMemo(
    () => Array.from(selectedResps).filter(v => !rowByVendedor.has(v)).sort((a, b) => a.localeCompare(b)),
    [selectedResps, rowByVendedor]);

  return (
    <div className="bg-card border border-border rounded-lg p-2">
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-[11px] font-semibold text-muted-foreground uppercase">Qualidade do Serviço</h3>
          {state && rows.length > 0 && (
            <button
              onClick={() => setShowAvg(s => !s)}
              title="Sobrepor a média da equipa"
              className={avgShown
                ? 'inline-flex items-center rounded border border-primary bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground'
                : 'inline-flex items-center rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium text-foreground hover:bg-accent'}
            >
              Média
            </button>
          )}
        </div>
        {state && (
          <span className="text-[10px] text-muted-foreground truncate">
            {PT_MONTHS[state.month - 1]} {state.year} · {[
              avgShown ? `média (${rows.length} vend.)` : null,
              shownResps.length === 1 ? shownResps[0]
                : shownResps.length > 1 ? `${shownResps.length} vendedores` : null,
            ].filter(Boolean).join(' + ')}
          </span>
        )}
      </div>

      {loading ? (
        <div className="h-[300px] flex items-center justify-center gap-2 text-[11px] text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> A carregar…
        </div>
      ) : error ? (
        <div className="h-[300px] flex items-center justify-center text-[11px] text-muted-foreground">
          Não foi possível carregar a qualidade.
        </div>
      ) : !state || rows.length === 0 ? (
        <div className="h-[300px] flex items-center justify-center text-[11px] text-muted-foreground">
          Ainda não há notas de qualidade lançadas.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <RadarChart data={chartData} outerRadius="70%">
            <PolarGrid stroke="hsl(var(--border))" />
            <PolarAngleAxis dataKey="metric" tick={{ fontSize: 10, fill: 'hsl(var(--foreground))' }} />
            {/* Escala fixa 0–10 em ambos os eixos. */}
            <PolarRadiusAxis
              domain={[QUALITY_MIN, QUALITY_MAX]}
              ticks={RADIUS_TICKS}
              tickCount={RADIUS_TICKS.length}
              tick={{ fontSize: 9 }}
              stroke="hsl(var(--border))"
              axisLine={false}
            />
            {series.map(s => (
              <Radar
                key={s.key} name={s.key} dataKey={s.key}
                stroke={s.color} fill={s.color}
                fillOpacity={single ? 0.3 : 0.12}
                strokeWidth={2}
                isAnimationActive={false}
              />
            ))}
            <Tooltip
              contentStyle={{ fontSize: 11, background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
              formatter={(v: number, name: string) => [`${v} / ${QUALITY_MAX}`, name]} />
            {!single && <Legend wrapperStyle={{ fontSize: 10 }} />}
          </RadarChart>
        </ResponsiveContainer>
      )}

      <p className="text-[10px] text-muted-foreground mt-1 px-1">
        Notas de qualidade do serviço (escala 0–{QUALITY_MAX}), geridas no separador Qualidade.
        Selecione vendedores no filtro da página e ligue/desligue a <strong>Média</strong> para ver a equipa, os vendedores ou ambos.
        {missing.length > 0 && ` Sem notas neste mês: ${missing.join(', ')}.`}
      </p>
    </div>
  );
}
