import { useState, useEffect, useCallback, useMemo } from 'react';
import { Radar as RadarIcon, Loader2, Save, ChevronLeft, ChevronRight, Users, Trash2 } from 'lucide-react';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip, Legend,
} from 'recharts';
import { toast } from 'sonner';
import { useAuth } from '@/App';
import { useData } from '@/contexts/DataContext';
import { usePermissions } from '@/contexts/PermissionsContext';
import {
  QUALITY_METRICS, QUALITY_MIN, QUALITY_MAX, type QualityMetricKey, type QualityScores,
  type QualityRow, getMonthScores, saveVendedorScores, deleteVendedorScores, averageScores, emptyScores,
} from '@/lib/quality';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/* ── Tab Qualidade (admin) ─────────────────────────────────────────────────────
 * Gráfico de aranha das notas de qualidade do serviço, por mês e por vendedor.
 * As pontas são as dimensões (retails, contratos, BMW FS, CCGo, equipa,
 * NPS100). A escala é fixa (0–10) em ambos os eixos, para
 * se perceber quando nenhuma nota está no máximo.
 *  - Sem seleção: mostra-se a média da equipa.
 *  - Um vendedor: lançam-se/editam-se as suas notas do mês.
 *  - Vários vendedores: sobrepõem-se as teias (cada um com a sua cor) para
 *    comparativo (leitura).
 * ──────────────────────────────────────────────────────────────────────────── */

const PT_MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const isVehicle = (t: string) => t === 'VN' || t === 'VD';
const RADIUS_TICKS = [0, 2, 4, 6, 8, 10];

/* Responsáveis que aparecem como `resp` mas não são vendedores. */
const NOT_VENDEDOR = new Set(['JD']);

/* Paleta de cores por vendedor (estável pela ordem alfabética da lista). */
const PALETTE = ['#1C69D4', '#16A34A', '#F59E0B', '#DC2626', '#8B5CF6', '#0EA5E9', '#EC4899', '#14B8A6', '#F97316', '#64748B'];
const AVG_COLOR = '#1C69D4';

type FormState = Record<QualityMetricKey, string>;
const emptyForm = (): FormState =>
  QUALITY_METRICS.reduce((acc, m) => { acc[m.key] = ''; return acc; }, {} as FormState);

const formFromScores = (scores: QualityScores): FormState =>
  QUALITY_METRICS.reduce((acc, m) => { acc[m.key] = String(scores[m.key] ?? 0); return acc; }, {} as FormState);

const scoresFromRow = (r: QualityRow): QualityScores =>
  QUALITY_METRICS.reduce((acc, m) => { acc[m.key] = Number(r[m.key]) || 0; return acc; }, {} as QualityScores);

const sumScores = (s: QualityScores) => QUALITY_METRICS.reduce((t, m) => t + s[m.key], 0);

const fmtStamp = (iso: string) =>
  new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

const fmtNum = (n: number) => Number(n.toFixed(2));

export default function QualidadePage() {
  const { session } = useAuth();
  const { data } = useData();
  const { canEdit } = usePermissions();
  const editable = canEdit('qualidade');

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);   // 1–12

  const [rows, setRows] = useState<QualityRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());   // vazio = média
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Universo de vendedores: os do control (VN/VD) + quem já tem notas lançadas.
  const vendedores = useMemo(() => {
    const set = new Set<string>();
    (data?.control ?? []).forEach(r => { if (isVehicle(r.type) && r.resp) set.add(r.resp); });
    rows.forEach(r => { if (r.vendedor) set.add(r.vendedor); });
    NOT_VENDEDOR.forEach(v => set.delete(v));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [data, rows]);

  // Cor estável por vendedor (índice na lista ordenada).
  const colorOf = useCallback(
    (v: string) => PALETTE[Math.max(0, vendedores.indexOf(v)) % PALETTE.length],
    [vendedores]);

  // Vendedores com notas lançadas neste mês (para assinalar no seletor).
  const rowByVendedor = useMemo(() => {
    const m = new Map<string, QualityRow>();
    rows.forEach(r => m.set(r.vendedor, r));
    return m;
  }, [rows]);
  const scoresOf = useCallback(
    (v: string): QualityScores => { const r = rowByVendedor.get(v); return r ? scoresFromRow(r) : emptyScores(); },
    [rowByVendedor]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await getMonthScores(year, month));
    } catch (err) {
      toast.error('Não foi possível carregar as notas de qualidade.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => { refresh(); }, [refresh]);

  // Lista ordenada dos selecionados e o vendedor em edição (só quando é exatamente um).
  const selectedList = useMemo(
    () => vendedores.filter(v => selected.has(v)),
    [vendedores, selected]);
  const editing = selectedList.length === 1 ? selectedList[0] : null;
  const editingRow = useMemo(
    () => (editing ? rowByVendedor.get(editing) ?? null : null),
    [rowByVendedor, editing]);

  // Repõe o formulário quando muda o vendedor em edição ou as linhas do mês.
  useEffect(() => {
    if (!editing) { setForm(emptyForm()); return; }
    setForm(editingRow ? formFromScores(editingRow) : emptyForm());
  }, [editing, editingRow]);

  // Notas em edição (a partir do formulário do vendedor único selecionado).
  const editScores = useMemo<QualityScores>(() =>
    QUALITY_METRICS.reduce((acc, m) => {
      const n = Number(form[m.key]);
      acc[m.key] = Number.isFinite(n) ? n : 0;
      return acc;
    }, {} as QualityScores),
    [form]);

  // Média da equipa (todos os vendedores com notas no mês).
  const teamAvg = useMemo(() => averageScores(rows), [rows]);

  // Séries desenhadas na teia (cada uma com a sua cor).
  const series = useMemo<{ key: string; color: string; scores: QualityScores }[]>(() => {
    if (selectedList.length === 0) return [{ key: 'Média', color: AVG_COLOR, scores: teamAvg }];
    if (editing) return [{ key: editing, color: colorOf(editing), scores: editScores }];
    return selectedList.map(v => ({ key: v, color: colorOf(v), scores: scoresOf(v) }));
  }, [selectedList, editing, editScores, teamAvg, colorOf, scoresOf]);

  const chartData = useMemo(
    () => QUALITY_METRICS.map(m => {
      const row: Record<string, number | string> = { metric: m.label };
      series.forEach(s => { row[s.key] = fmtNum(s.scores[m.key]); });
      return row;
    }),
    [series]);

  const singleSeries = series.length === 1;
  const centerTotal = singleSeries ? sumScores(series[0].scores) : 0;

  const prevMonth = () => { if (month === 1) { setYear(y => y - 1); setMonth(12); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 12) { setYear(y => y + 1); setMonth(1); } else setMonth(m => m + 1); };

  const toggle = (v: string) => setSelected(prev => {
    const n = new Set(prev);
    n.has(v) ? n.delete(v) : n.add(v);
    return n;
  });

  const clampScores = (): QualityScores =>
    QUALITY_METRICS.reduce((acc, m) => {
      acc[m.key] = Math.min(QUALITY_MAX, Math.max(QUALITY_MIN, editScores[m.key]));
      return acc;
    }, {} as QualityScores);

  const handleSave = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await saveVendedorScores(year, month, editing, clampScores(), session?.user.email ?? null);
      toast.success(`Notas de ${editing} guardadas.`);
      await refresh();
    } catch (err) {
      toast.error('Não foi possível guardar as notas.');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await deleteVendedorScores(year, month, editing);
      toast.success(`Notas de ${editing} removidas.`);
      await refresh();
    } catch (err) {
      toast.error('Não foi possível remover as notas.');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const subtitle = selectedList.length === 0
    ? `Média (${rows.length} vend.)`
    : selectedList.length === 1
      ? selectedList[0]
      : `${selectedList.length} vendedores`;

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <RadarIcon className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-bold tracking-tight">Qualidade</h1>
        <span className="text-xs text-muted-foreground">· Notas por vendedor · escala 0–{QUALITY_MAX}</span>
      </div>

      {/* Seletor de vendedores (múltiplo): nenhum = média; vários = comparativo sobreposto. */}
      <Card>
        <CardContent className="py-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Vendedores <span className="normal-case font-normal">· escolha um para editar, vários para comparar</span>
            </p>
            {selectedList.length > 0 && (
              <button onClick={() => setSelected(new Set())}
                className="text-[10px] font-medium text-primary hover:underline">Limpar</button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setSelected(new Set())}
              className={selectedList.length === 0
                ? 'inline-flex items-center gap-1 rounded-md border border-primary bg-primary px-2.5 py-1.5 text-[11px] font-semibold text-primary-foreground'
                : 'inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-[11px] font-medium text-foreground hover:bg-accent'}
            >
              <Users className="h-3.5 w-3.5" /> Média
            </button>
            {vendedores.map(v => {
              const active = selected.has(v);
              const scored = rowByVendedor.has(v);
              const color = colorOf(v);
              return (
                <button key={v} onClick={() => toggle(v)}
                  style={active ? { backgroundColor: color, borderColor: color, color: '#fff' } : { borderColor: color }}
                  className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] font-medium hover:bg-accent">
                  {!active && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />}
                  {v}
                  {scored && <span className={active ? 'text-[9px] opacity-80' : 'text-[9px] text-muted-foreground'}>●</span>}
                </button>
              );
            })}
            {vendedores.length === 0 && <span className="text-[10px] text-muted-foreground">Sem vendedores.</span>}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        {/* ── Gráfico de aranha ─────────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                {PT_MONTHS[month - 1]} {year}
                <span className="text-xs font-normal text-muted-foreground">· {subtitle}</span>
              </CardTitle>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" className="h-7 w-7" onClick={prevMonth} title="Mês anterior">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline" size="sm" className="h-7"
                  onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth() + 1); }}
                  disabled={year === now.getFullYear() && month === now.getMonth() + 1}
                >
                  Atual
                </Button>
                <Button variant="outline" size="icon" className="h-7 w-7" onClick={nextMonth} title="Mês seguinte">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="relative">
              <ResponsiveContainer width="100%" height={360}>
                <RadarChart data={chartData} outerRadius="72%">
                  <PolarGrid stroke="hsl(var(--border))" />
                  <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11, fill: 'hsl(var(--foreground))' }} />
                  {/* Escala fixa 0–10 em ambos os eixos: assim vê-se quando nenhuma nota é máxima. */}
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
                      fillOpacity={singleSeries ? 0.35 : 0.12}
                      strokeWidth={2}
                      isAnimationActive={false}
                    />
                  ))}
                  <Tooltip
                    contentStyle={{ fontSize: 11, background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                    formatter={(v: number, name: string) => [`${v} / ${QUALITY_MAX}`, name]}
                    labelFormatter={(l: string) => l} />
                  {!singleSeries && <Legend wrapperStyle={{ fontSize: 11 }} />}
                </RadarChart>
              </ResponsiveContainer>
              {/* Somatório ao centro (só quando há uma única teia). */}
              {singleSeries && (
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Total</span>
                  <span className="text-2xl font-bold tabular-nums leading-none">{fmtNum(centerTotal)}</span>
                  <span className="text-[10px] text-muted-foreground">/ {QUALITY_METRICS.length * QUALITY_MAX}</span>
                </div>
              )}
            </div>
            {loading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> A carregar…
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Painel lateral: edição (1) / média (0) / comparativo (≥2) ──────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">
              {editing ? `Notas — ${editing}` : selectedList.length === 0 ? 'Média da equipa' : 'Comparativo'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {editing ? (
              <>
                {QUALITY_METRICS.map(m => (
                  <div key={m.key} className="grid grid-cols-[1fr_88px] items-center gap-2">
                    <Label htmlFor={`q-${m.key}`}>{m.label}</Label>
                    <Input
                      id={`q-${m.key}`}
                      type="number"
                      inputMode="decimal"
                      step="any"
                      min={QUALITY_MIN}
                      max={QUALITY_MAX}
                      disabled={!editable}
                      value={form[m.key]}
                      onChange={e => setForm(f => ({ ...f, [m.key]: e.target.value }))}
                      placeholder="0"
                      className="text-right tabular-nums"
                    />
                  </div>
                ))}

                <div className="flex items-center justify-between border-t pt-3">
                  <span className="text-xs font-medium text-muted-foreground">Somatório</span>
                  <span className="text-lg font-bold tabular-nums">{fmtNum(centerTotal)}</span>
                </div>

                {editable ? (
                  <>
                    <Button className="w-full" onClick={handleSave} disabled={saving || loading}>
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Guardar
                    </Button>
                    {editingRow && (
                      <Button variant="outline" className="w-full text-destructive hover:text-destructive"
                        onClick={handleDelete} disabled={saving || loading}>
                        <Trash2 className="h-4 w-4" /> Remover notas do mês
                      </Button>
                    )}
                  </>
                ) : (
                  <p className="text-[11px] text-muted-foreground">Sem permissão para editar.</p>
                )}

                {editingRow?.updated_at && (
                  <p className="text-[11px] text-muted-foreground">
                    Último registo{editingRow.updated_by ? ` por ${editingRow.updated_by}` : ''} em {fmtStamp(editingRow.updated_at)}
                  </p>
                )}
              </>
            ) : selectedList.length === 0 ? (
              <>
                {QUALITY_METRICS.map(m => (
                  <div key={m.key} className="flex items-center justify-between gap-2">
                    <span className="text-sm text-foreground">{m.label}</span>
                    <span className="text-sm font-semibold tabular-nums">
                      {rows.length ? fmtNum(teamAvg[m.key]) : '—'}
                    </span>
                  </div>
                ))}

                <div className="flex items-center justify-between border-t pt-3">
                  <span className="text-xs font-medium text-muted-foreground">Somatório médio</span>
                  <span className="text-lg font-bold tabular-nums">{rows.length ? fmtNum(centerTotal) : '—'}</span>
                </div>

                <p className="text-[11px] text-muted-foreground">
                  {rows.length
                    ? `Média das notas de ${rows.length} vendedor${rows.length > 1 ? 'es' : ''} neste mês. Escolha um vendedor para lançar/editar, ou vários para comparar.`
                    : 'Ainda não há notas lançadas neste mês. Escolha um vendedor para começar.'}
                </p>
              </>
            ) : (
              /* Comparativo (≥2 vendedores) — tabela por métrica, cor por vendedor. */
              <>
                <div className="overflow-x-auto -mx-2">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="text-[10px] text-muted-foreground">
                        <th className="px-2 py-1 text-left font-medium">Vetor</th>
                        {selectedList.map(v => (
                          <th key={v} className="px-2 py-1 text-right font-medium whitespace-nowrap">
                            <span className="inline-flex items-center gap-1">
                              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: colorOf(v) }} />
                              {v}
                            </span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {QUALITY_METRICS.map(m => (
                        <tr key={m.key}>
                          <td className="px-2 py-1 text-foreground whitespace-nowrap">{m.label}</td>
                          {selectedList.map(v => (
                            <td key={v} className="px-2 py-1 text-right tabular-nums">{fmtNum(scoresOf(v)[m.key])}</td>
                          ))}
                        </tr>
                      ))}
                      <tr className="border-t font-semibold">
                        <td className="px-2 py-1 text-muted-foreground">Total</td>
                        {selectedList.map(v => (
                          <td key={v} className="px-2 py-1 text-right tabular-nums">{fmtNum(sumScores(scoresOf(v)))}</td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Teias sobrepostas para comparação. Deixe apenas um vendedor selecionado para lançar ou editar as notas.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
