import { useState, useEffect, useCallback, useMemo } from 'react';
import { Radar as RadarIcon, Loader2, Save, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip,
} from 'recharts';
import { toast } from 'sonner';
import { useAuth } from '@/App';
import {
  QUALITY_METRICS, type QualityMetricKey, type QualityScores,
  getQualityScores, saveQualityScores,
} from '@/lib/quality';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/* ── Tab Qualidade (admin) ─────────────────────────────────────────────────────
 * Gráfico de aranha das notas de qualidade do serviço, por mês. As 7 séries são
 * as dimensões (retails, contratos, atitude, atendimento, assiduidade, equipa,
 * NPS100); no centro fica o somatório das notas. Menu lateral para inserir/editar
 * os valores do mês selecionado (gravados no Supabase).
 * ──────────────────────────────────────────────────────────────────────────── */

const PT_MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

type FormState = Record<QualityMetricKey, string>;
const emptyForm = (): FormState =>
  QUALITY_METRICS.reduce((acc, m) => { acc[m.key] = ''; return acc; }, {} as FormState);

const fmtStamp = (iso: string) =>
  new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

export default function QualidadePage() {
  const { session } = useAuth();

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);   // 1–12

  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [stamp, setStamp] = useState<{ by: string | null; at: string } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const row = await getQualityScores(year, month);
      if (row) {
        const next = emptyForm();
        QUALITY_METRICS.forEach(m => { next[m.key] = String(row[m.key] ?? 0); });
        setForm(next);
        setStamp({ by: row.updated_by, at: row.updated_at });
      } else {
        setForm(emptyForm());
        setStamp(null);
      }
    } catch (err) {
      toast.error('Não foi possível carregar as notas de qualidade.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => { refresh(); }, [refresh]);

  // Valores numéricos derivados (para gráfico + somatório).
  const scores = useMemo<QualityScores>(() =>
    QUALITY_METRICS.reduce((acc, m) => {
      const n = Number(form[m.key]);
      acc[m.key] = Number.isFinite(n) ? n : 0;
      return acc;
    }, {} as QualityScores),
    [form]);

  const total = useMemo(() => QUALITY_METRICS.reduce((s, m) => s + scores[m.key], 0), [scores]);
  const chartData = useMemo(
    () => QUALITY_METRICS.map(m => ({ metric: m.label, value: scores[m.key] })),
    [scores]);
  const maxVal = useMemo(() => Math.max(...QUALITY_METRICS.map(m => scores[m.key]), 1), [scores]);

  const prevMonth = () => { if (month === 1) { setYear(y => y - 1); setMonth(12); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 12) { setYear(y => y + 1); setMonth(1); } else setMonth(m => m + 1); };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveQualityScores(year, month, scores, session?.user.email ?? null);
      toast.success('Notas de qualidade guardadas.');
      await refresh();
    } catch (err) {
      toast.error('Não foi possível guardar as notas.');
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
        <span className="text-xs text-muted-foreground">· Notas de qualidade do serviço</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        {/* ── Gráfico de aranha ─────────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm font-semibold">
                {PT_MONTHS[month - 1]} {year}
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
                  <PolarRadiusAxis domain={[0, maxVal]} tick={{ fontSize: 9 }} stroke="hsl(var(--border))" />
                  <Radar name="Notas" dataKey="value" stroke="#1C69D4" fill="#1C69D4" fillOpacity={0.35} isAnimationActive={false} />
                  <Tooltip
                    contentStyle={{ fontSize: 11, background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                    formatter={(v: number, _n, item: { payload?: { metric?: string } }) => [v, item?.payload?.metric ?? '']} />
                </RadarChart>
              </ResponsiveContainer>
              {/* Somatório ao centro da teia */}
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Total</span>
                <span className="text-2xl font-bold tabular-nums leading-none">{Number(total.toFixed(2))}</span>
              </div>
            </div>
            {loading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> A carregar…
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Menu de inputs ────────────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Notas do mês</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {QUALITY_METRICS.map(m => (
              <div key={m.key} className="grid grid-cols-[1fr_88px] items-center gap-2">
                <Label htmlFor={`q-${m.key}`}>{m.label}</Label>
                <Input
                  id={`q-${m.key}`}
                  type="number"
                  inputMode="decimal"
                  step="any"
                  value={form[m.key]}
                  onChange={e => setForm(f => ({ ...f, [m.key]: e.target.value }))}
                  placeholder="0"
                  className="text-right tabular-nums"
                />
              </div>
            ))}

            <div className="flex items-center justify-between border-t pt-3">
              <span className="text-xs font-medium text-muted-foreground">Somatório</span>
              <span className="text-lg font-bold tabular-nums">{Number(total.toFixed(2))}</span>
            </div>

            <Button className="w-full" onClick={handleSave} disabled={saving || loading}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Guardar
            </Button>

            {stamp?.at && (
              <p className="text-[11px] text-muted-foreground">
                Último registo{stamp.by ? ` por ${stamp.by}` : ''} em {fmtStamp(stamp.at)}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
