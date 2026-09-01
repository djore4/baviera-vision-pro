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

/* ── Tab Qualidade (admin) ─────────────────────────────────────────────────────
 * Gráfico de aranha das notas de qualidade do serviço, por mês e por vendedor.
 * As pontas são as dimensões (retails, contratos, BMW FS, CCGo, equipa,
 * NPS100). A escala é fixa (0–10) em ambos os eixos, para
 * se perceber quando nenhuma nota está no máximo.
 *  - Sem seleção: mostra-se a média da equipa.
 *  - Com vendedores escolhidos: o painel lateral abre uma coluna editável por
 *    cada um, para lançar/editar as notas de todos diretamente (sem ter de
 *    trocar o vendedor selecionado a cada alteração) e guardar de uma só vez.
 *    As teias sobrepõem-se (cada vendedor com a sua cor) para comparativo.
 * Perfis sem permissão de edição só veem a leitura (tabela de consulta).
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

const scoresFromForm = (f: FormState): QualityScores =>
  QUALITY_METRICS.reduce((acc, m) => {
    const n = Number(f[m.key]);
    acc[m.key] = Number.isFinite(n) ? n : 0;
    return acc;
  }, {} as QualityScores);

const formHasValue = (f: FormState) => QUALITY_METRICS.some(m => (f[m.key] ?? '').trim() !== '');

const sumScores = (s: QualityScores) => QUALITY_METRICS.reduce((t, m) => t + s[m.key], 0);

const fmtStamp = (iso: string) =>
  new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

const fmtNum = (n: number) => Number(n.toFixed(2));

export default function QualidadePage() {
  const { session } = useAuth();
  const { data } = useData();
  const { isAdmin } = usePermissions();
  // Lançar/editar/remover notas é exclusivo do perfil administrador; os restantes
  // perfis com acesso (ex.: Vendedor, Chefe de Vendas) só consultam.
  const editable = isAdmin;

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);   // 1–12

  const [rows, setRows] = useState<QualityRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());   // vendedores escolhidos
  const [showAvg, setShowAvg] = useState(true);                       // média sobreposta (toggle independente)
  // Uma entrada de formulário por vendedor selecionado (edição em coluna).
  const [forms, setForms] = useState<Record<string, FormState>>({});
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

  // Lista ordenada dos selecionados.
  const selectedList = useMemo(
    () => vendedores.filter(v => selected.has(v)),
    [vendedores, selected]);

  // Re-semear os formulários a partir da BD quando as linhas do mês mudam
  // (mudança de mês ou refresh após gravar). Descarta edições em curso — o que
  // é o comportamento certo, pois só chegamos aqui depois de guardar/navegar.
  useEffect(() => {
    setForms(() => {
      const next: Record<string, FormState> = {};
      selectedList.forEach(v => {
        const r = rowByVendedor.get(v);
        next[v] = r ? formFromScores(scoresFromRow(r)) : emptyForm();
      });
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  // Ajustar os formulários quando a seleção muda: acrescenta novos vendedores
  // (semeados com as notas da BD, ou vazios) e remove os desmarcados,
  // preservando as edições em curso dos que continuam selecionados.
  useEffect(() => {
    setForms(prev => {
      const next: Record<string, FormState> = {};
      selectedList.forEach(v => {
        if (prev[v]) { next[v] = prev[v]; return; }
        const r = rowByVendedor.get(v);
        next[v] = r ? formFromScores(scoresFromRow(r)) : emptyForm();
      });
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedList]);

  // Notas ao vivo de um vendedor: do formulário se existir, senão da BD.
  const liveScoresOf = useCallback(
    (v: string): QualityScores => { const f = forms[v]; return f ? scoresFromForm(f) : scoresOf(v); },
    [forms, scoresOf]);

  // Média da equipa (todos os vendedores com notas no mês).
  const teamAvg = useMemo(() => averageScores(rows), [rows]);

  // A média é uma teia independente que se pode sobrepor aos vendedores. Sem
  // nenhum vendedor escolhido mostra-se sempre a média, para o gráfico nunca ficar vazio.
  const avgShown = showAvg || selectedList.length === 0;

  // Séries desenhadas na teia (cada uma com a sua cor). Média (se ligada) + cada
  // vendedor selecionado com as notas ao vivo (formulário em edição).
  const series = useMemo<{ key: string; color: string; scores: QualityScores }[]>(() => {
    const out: { key: string; color: string; scores: QualityScores }[] = [];
    if (avgShown) out.push({ key: 'Média', color: AVG_COLOR, scores: teamAvg });
    selectedList.forEach(v =>
      out.push({ key: v, color: colorOf(v), scores: liveScoresOf(v) }));
    return out;
  }, [avgShown, selectedList, teamAvg, colorOf, liveScoresOf]);

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
    if (n.has(v)) n.delete(v); else n.add(v);
    return n;
  });

  const setField = (v: string, key: QualityMetricKey, value: string) =>
    setForms(prev => ({ ...prev, [v]: { ...(prev[v] ?? emptyForm()), [key]: value } }));

  const clampScoresFor = (v: string): QualityScores => {
    const s = liveScoresOf(v);
    return QUALITY_METRICS.reduce((acc, m) => {
      acc[m.key] = Math.min(QUALITY_MAX, Math.max(QUALITY_MIN, s[m.key]));
      return acc;
    }, {} as QualityScores);
  };

  // Guarda de uma só vez as notas de todos os vendedores selecionados que já
  // tenham registo ou tenham algum campo preenchido (evita criar linhas a zero
  // para colunas nunca tocadas, que baixariam a média da equipa).
  const handleSaveAll = async () => {
    const targets = selectedList.filter(v => rowByVendedor.has(v) || formHasValue(forms[v] ?? emptyForm()));
    if (targets.length === 0) { toast.info('Nada para guardar.'); return; }
    setSaving(true);
    try {
      for (const v of targets) {
        await saveVendedorScores(year, month, v, clampScoresFor(v), session?.user.email ?? null);
      }
      toast.success(targets.length === 1
        ? `Notas de ${targets[0]} guardadas.`
        : `Notas de ${targets.length} vendedores guardadas.`);
      await refresh();
    } catch (err) {
      toast.error('Não foi possível guardar as notas.');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteOne = async (v: string) => {
    setSaving(true);
    try {
      await deleteVendedorScores(year, month, v);
      toast.success(`Notas de ${v} removidas.`);
      await refresh();
    } catch (err) {
      toast.error('Não foi possível remover as notas.');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const subtitle = [
    avgShown ? `Média (${rows.length} vend.)` : null,
    selectedList.length === 1
      ? selectedList[0]
      : selectedList.length > 1 ? `${selectedList.length} vendedores` : null,
  ].filter(Boolean).join(' + ');

  const sidePanelTitle = selectedList.length === 0
    ? 'Média da equipa'
    : editable
      ? (selectedList.length === 1 ? `Editar notas — ${selectedList[0]}` : 'Editar notas')
      : 'Comparativo';

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <RadarIcon className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-bold tracking-tight">Qualidade</h1>
        <span className="text-xs text-muted-foreground">· Notas por vendedor · escala 0–{QUALITY_MAX}</span>
      </div>

      {/* Seletor de vendedores (múltiplo): nenhum = média; um ou mais abrem a
          edição em colunas (uma por vendedor). */}
      <Card>
        <CardContent className="py-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Vendedores <span className="normal-case font-normal">· a média combina-se com os vendedores; {editable ? 'cada vendedor escolhido ganha uma coluna para editar diretamente' : 'escolha vendedores para comparar'}</span>
            </p>
            <div className="flex items-center gap-2">
              {editable && vendedores.length > 0 && (
                <button onClick={() => setSelected(new Set(vendedores))}
                  className="text-[10px] font-medium text-primary hover:underline">Todos</button>
              )}
              {(selectedList.length > 0 || !showAvg) && (
                <button onClick={() => { setSelected(new Set()); setShowAvg(true); }}
                  className="text-[10px] font-medium text-primary hover:underline">Limpar</button>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setShowAvg(s => !s)}
              className={avgShown
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

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
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

        {/* ── Painel lateral: média (0) / edição em colunas (≥1, admin) / comparativo (≥1, consulta) ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">{sidePanelTitle}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {selectedList.length === 0 ? (
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
                  <span className="text-lg font-bold tabular-nums">{rows.length ? fmtNum(sumScores(teamAvg)) : '—'}</span>
                </div>

                <p className="text-[11px] text-muted-foreground">
                  {rows.length
                    ? `Média das notas de ${rows.length} vendedor${rows.length > 1 ? 'es' : ''} neste mês. Escolha vendedores para ${editable ? 'lançar/editar (uma coluna por vendedor)' : 'comparar'}.`
                    : `Ainda não há notas lançadas neste mês. Escolha ${editable ? 'vendedores para começar' : 'vendedores para comparar'}.`}
                </p>
              </>
            ) : editable ? (
              /* ── Edição em colunas: uma coluna por vendedor selecionado ─────── */
              <>
                <div className="overflow-x-auto -mx-2">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="text-[10px] text-muted-foreground">
                        <th className="px-2 py-1 text-left font-medium">Vetor</th>
                        {avgShown && (
                          <th className="px-2 py-1 text-right font-medium whitespace-nowrap">
                            <span className="inline-flex items-center gap-1">
                              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: AVG_COLOR }} />
                              Média
                            </span>
                          </th>
                        )}
                        {selectedList.map(v => (
                          <th key={v} className="px-1.5 py-1 text-center font-medium whitespace-nowrap">
                            <span className="inline-flex items-center gap-1">
                              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: colorOf(v) }} />
                              {v}
                              {rowByVendedor.has(v) && (
                                <button
                                  onClick={() => handleDeleteOne(v)}
                                  disabled={saving || loading}
                                  title={`Remover notas de ${v} neste mês`}
                                  className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              )}
                            </span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {QUALITY_METRICS.map(m => (
                        <tr key={m.key}>
                          <td className="px-2 py-1 text-foreground whitespace-nowrap">{m.label}</td>
                          {avgShown && (
                            <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{fmtNum(teamAvg[m.key])}</td>
                          )}
                          {selectedList.map(v => (
                            <td key={v} className="px-1 py-1">
                              <Input
                                aria-label={`${m.label} — ${v}`}
                                type="number"
                                inputMode="decimal"
                                step="any"
                                min={QUALITY_MIN}
                                max={QUALITY_MAX}
                                value={(forms[v] ?? emptyForm())[m.key]}
                                onChange={e => setField(v, m.key, e.target.value)}
                                placeholder="0"
                                className="h-8 w-16 px-1.5 text-right tabular-nums"
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                      <tr className="border-t font-semibold">
                        <td className="px-2 py-1 text-muted-foreground">Total</td>
                        {avgShown && (
                          <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{fmtNum(sumScores(teamAvg))}</td>
                        )}
                        {selectedList.map(v => (
                          <td key={v} className="px-1.5 py-1 text-right tabular-nums">{fmtNum(sumScores(liveScoresOf(v)))}</td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>

                <Button className="w-full" onClick={handleSaveAll} disabled={saving || loading}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {selectedList.length > 1 ? 'Guardar todos' : 'Guardar'}
                </Button>

                <p className="text-[11px] text-muted-foreground">
                  Edite as notas de cada vendedor diretamente na sua coluna e guarde de uma só vez. As teias atualizam ao vivo; o cesto remove as notas do mês desse vendedor.
                </p>

                {selectedList.length === 1 && rowByVendedor.get(selectedList[0])?.updated_at && (
                  <p className="text-[11px] text-muted-foreground">
                    Último registo{rowByVendedor.get(selectedList[0])!.updated_by ? ` por ${rowByVendedor.get(selectedList[0])!.updated_by}` : ''} em {fmtStamp(rowByVendedor.get(selectedList[0])!.updated_at)}
                  </p>
                )}
              </>
            ) : (
              /* Comparativo só de consulta (perfis sem permissão de edição). */
              <>
                <div className="overflow-x-auto -mx-2">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="text-[10px] text-muted-foreground">
                        <th className="px-2 py-1 text-left font-medium">Vetor</th>
                        {avgShown && (
                          <th className="px-2 py-1 text-right font-medium whitespace-nowrap">
                            <span className="inline-flex items-center gap-1">
                              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: AVG_COLOR }} />
                              Média
                            </span>
                          </th>
                        )}
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
                          {avgShown && (
                            <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{fmtNum(teamAvg[m.key])}</td>
                          )}
                          {selectedList.map(v => (
                            <td key={v} className="px-2 py-1 text-right tabular-nums">{fmtNum(scoresOf(v)[m.key])}</td>
                          ))}
                        </tr>
                      ))}
                      <tr className="border-t font-semibold">
                        <td className="px-2 py-1 text-muted-foreground">Total</td>
                        {avgShown && (
                          <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{fmtNum(sumScores(teamAvg))}</td>
                        )}
                        {selectedList.map(v => (
                          <td key={v} className="px-2 py-1 text-right tabular-nums">{fmtNum(sumScores(scoresOf(v)))}</td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Teias sobrepostas para comparação. Sem permissão para editar.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
