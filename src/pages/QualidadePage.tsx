import { useState, useEffect, useCallback, useMemo } from 'react';
import { Radar as RadarIcon, Loader2, Save, ChevronLeft, ChevronRight, Users, Trash2 } from 'lucide-react';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip,
} from 'recharts';
import { toast } from 'sonner';
import { useAuth } from '@/App';
import { useData } from '@/contexts/DataContext';
import { usePermissions } from '@/contexts/PermissionsContext';
import {
  QUALITY_METRICS, QUALITY_MIN, QUALITY_MAX, type QualityMetricKey, type QualityScores,
  type QualityRow, getMonthScores, saveVendedorScores, deleteVendedorScores, averageScores,
} from '@/lib/quality';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/* ── Tab Qualidade (admin) ─────────────────────────────────────────────────────
 * Gráfico de aranha das notas de qualidade do serviço, por mês e por vendedor.
 * As 7 séries são as dimensões (retails, contratos, atitude, atendimento,
 * assiduidade, equipa, NPS100). A escala é fixa (0–10) em ambos os eixos, para
 * se perceber quando nenhuma nota está no máximo. Escolhe-se um vendedor para
 * lançar/editar as suas notas do mês; sem seleção, mostra-se a média da equipa.
 * ──────────────────────────────────────────────────────────────────────────── */

const PT_MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const isVehicle = (t: string) => t === 'VN' || t === 'VD';
const RADIUS_TICKS = [0, 2, 4, 6, 8, 10];

type FormState = Record<QualityMetricKey, string>;
const emptyForm = (): FormState =>
  QUALITY_METRICS.reduce((acc, m) => { acc[m.key] = ''; return acc; }, {} as FormState);

const formFromScores = (scores: QualityScores): FormState =>
  QUALITY_METRICS.reduce((acc, m) => { acc[m.key] = String(scores[m.key] ?? 0); return acc; }, {} as FormState);

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
  const [selected, setSelected] = useState<string | null>(null);   // vendedor selecionado (null = média)
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Universo de vendedores: os do control (VN/VD) + quem já tem notas lançadas.
  const vendedores = useMemo(() => {
    const set = new Set<string>();
    (data?.control ?? []).forEach(r => { if (isVehicle(r.type) && r.resp) set.add(r.resp); });
    rows.forEach(r => { if (r.vendedor) set.add(r.vendedor); });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [data, rows]);

  // Vendedores com notas lançadas neste mês (para assinalar no seletor).
  const scoredSet = useMemo(() => new Set(rows.map(r => r.vendedor)), [rows]);

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

  // Repõe o formulário quando muda o vendedor selecionado ou as linhas do mês.
  const selectedRow = useMemo(
    () => (selected ? rows.find(r => r.vendedor === selected) ?? null : null),
    [rows, selected]);

  useEffect(() => {
    if (!selected) { setForm(emptyForm()); return; }
    setForm(selectedRow
      ? formFromScores(selectedRow)
      : emptyForm());
  }, [selected, selectedRow]);

  // Notas em edição (a partir do formulário do vendedor selecionado).
  const editScores = useMemo<QualityScores>(() =>
    QUALITY_METRICS.reduce((acc, m) => {
      const n = Number(form[m.key]);
      acc[m.key] = Number.isFinite(n) ? n : 0;
      return acc;
    }, {} as QualityScores),
    [form]);

  // Média da equipa (todos os vendedores com notas no mês).
  const teamAvg = useMemo(() => averageScores(rows), [rows]);

  // Notas mostradas no gráfico: vendedor selecionado → edição; senão → média.
  const shownScores = selected ? editScores : teamAvg;
  const total = useMemo(
    () => QUALITY_METRICS.reduce((s, m) => s + shownScores[m.key], 0),
    [shownScores]);
  const chartData = useMemo(
    () => QUALITY_METRICS.map(m => ({ metric: m.label, value: fmtNum(shownScores[m.key]) })),
    [shownScores]);

  const prevMonth = () => { if (month === 1) { setYear(y => y - 1); setMonth(12); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 12) { setYear(y => y + 1); setMonth(1); } else setMonth(m => m + 1); };

  const clampScores = (): QualityScores =>
    QUALITY_METRICS.reduce((acc, m) => {
      acc[m.key] = Math.min(QUALITY_MAX, Math.max(QUALITY_MIN, editScores[m.key]));
      return acc;
    }, {} as QualityScores);

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await saveVendedorScores(year, month, selected, clampScores(), session?.user.email ?? null);
      toast.success(`Notas de ${selected} guardadas.`);
      await refresh();
    } catch (err) {
      toast.error('Não foi possível guardar as notas.');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await deleteVendedorScores(year, month, selected);
      toast.success(`Notas de ${selected} removidas.`);
      await refresh();
    } catch (err) {
      toast.error('Não foi possível remover as notas.');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <RadarIcon className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-bold tracking-tight">Qualidade</h1>
        <span className="text-xs text-muted-foreground">· Notas de qualidade por vendedor · escala 0–{QUALITY_MAX}</span>
      </div>

      {/* Seletor de vendedor: nenhum = média da equipa. */}
      <Card>
        <CardContent className="py-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Vendedor</p>
            {selected && (
              <button onClick={() => setSelected(null)}
                className="text-[10px] font-medium text-primary hover:underline">Ver média</button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setSelected(null)}
              className={!selected
                ? 'inline-flex items-center gap-1 rounded-md border border-primary bg-primary px-2.5 py-1.5 text-[11px] font-semibold text-primary-foreground'
                : 'inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-[11px] font-medium text-foreground hover:bg-accent'}
            >
              <Users className="h-3.5 w-3.5" /> Média
            </button>
            {vendedores.map(v => {
              const active = selected === v;
              const scored = scoredSet.has(v);
              return (
                <button key={v} onClick={() => setSelected(active ? null : v)}
                  className={active
                    ? 'inline-flex items-center gap-1 rounded-md border border-primary bg-primary px-2.5 py-1.5 text-[11px] font-semibold text-primary-foreground'
                    : 'inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-[11px] font-medium text-foreground hover:bg-accent'}>
                  {v}
                  {scored && <span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-primary-foreground' : 'bg-primary'}`} />}
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
                <span className="text-xs font-normal text-muted-foreground">
                  · {selected ?? `Média (${rows.length} vend.)`}
                </span>
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
                  <Radar name="Notas" dataKey="value" stroke="#1C69D4" fill="#1C69D4" fillOpacity={0.35} isAnimationActive={false} />
                  <Tooltip
                    contentStyle={{ fontSize: 11, background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                    formatter={(v: number, _n, item: { payload?: { metric?: string } }) => [`${v} / ${QUALITY_MAX}`, item?.payload?.metric ?? '']} />
                </RadarChart>
              </ResponsiveContainer>
              {/* Somatório ao centro da teia */}
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Total</span>
                <span className="text-2xl font-bold tabular-nums leading-none">{fmtNum(total)}</span>
                <span className="text-[10px] text-muted-foreground">/ {QUALITY_METRICS.length * QUALITY_MAX}</span>
              </div>
            </div>
            {loading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> A carregar…
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Menu de inputs / média ────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">
              {selected ? `Notas — ${selected}` : 'Média da equipa'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {selected ? (
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
                  <span className="text-lg font-bold tabular-nums">{fmtNum(total)}</span>
                </div>

                {editable ? (
                  <>
                    <Button className="w-full" onClick={handleSave} disabled={saving || loading}>
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Guardar
                    </Button>
                    {selectedRow && (
                      <Button variant="outline" className="w-full text-destructive hover:text-destructive"
                        onClick={handleDelete} disabled={saving || loading}>
                        <Trash2 className="h-4 w-4" /> Remover notas do mês
                      </Button>
                    )}
                  </>
                ) : (
                  <p className="text-[11px] text-muted-foreground">Sem permissão para editar.</p>
                )}

                {selectedRow?.updated_at && (
                  <p className="text-[11px] text-muted-foreground">
                    Último registo{selectedRow.updated_by ? ` por ${selectedRow.updated_by}` : ''} em {fmtStamp(selectedRow.updated_at)}
                  </p>
                )}
              </>
            ) : (
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
                  <span className="text-lg font-bold tabular-nums">{rows.length ? fmtNum(total) : '—'}</span>
                </div>

                <p className="text-[11px] text-muted-foreground">
                  {rows.length
                    ? `Média das notas de ${rows.length} vendedor${rows.length > 1 ? 'es' : ''} neste mês. Escolha um vendedor para lançar ou editar as notas.`
                    : 'Ainda não há notas lançadas neste mês. Escolha um vendedor para começar.'}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
