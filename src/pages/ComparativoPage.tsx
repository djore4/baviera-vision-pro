import { useEffect, useMemo, useState } from 'react';
import { Swords } from 'lucide-react';
import { useData } from '@/contexts/DataContext';
import { PeriodFilter } from '@/components/PeriodFilter';
import { getLatestScores } from '@/lib/quality';
import { BASELINES, computeComparativo, qualityTotals, type Baseline } from '@/lib/comparativo';
import { C, type CompareCtx } from '@/components/comparativo/shared';
import {
  Chip, EvolutionView, HeadToHeadView, MixView, OverviewView, RankingView, ScatterView, Seg,
} from '@/components/comparativo/views';

/* ── Tab Comparativo (admin) ─────────────────────────────────────────────────
 * Visão "na pele do vendedor": escolhe-se um vendedor (foco) e vê-se onde ele
 * está face à equipa em todos os KPIs — posição, diferença para a média /
 * mediana / melhor, perfil em radar, evolução, dispersão, mix e frente a frente
 * com um colega. Só leitura; o período é o filtro global da plataforma.
 * O cálculo vive em lib/comparativo.ts.
 * ──────────────────────────────────────────────────────────────────────────── */

type View = 'geral' | 'ranking' | 'evolucao' | 'dispersao' | 'mix' | 'duelo';
const VIEWS: { key: View; label: string }[] = [
  { key: 'geral', label: 'Visão geral' },
  { key: 'ranking', label: 'Ranking' },
  { key: 'evolucao', label: 'Evolução' },
  { key: 'dispersao', label: 'Dispersão' },
  { key: 'mix', label: 'Mix' },
  { key: 'duelo', label: 'Frente a frente' },
];

const STORE = 'comparativo.prefs';
interface Prefs { focus?: string; baseline?: Baseline; view?: View }
const readPrefs = (): Prefs => {
  try { return JSON.parse(localStorage.getItem(STORE) ?? '{}') as Prefs; } catch { return {}; }
};
const writePrefs = (p: Prefs) => { try { localStorage.setItem(STORE, JSON.stringify(p)); } catch { /* ignora */ } };

export default function ComparativoPage() {
  const { data, filter } = useData();
  const [prefs] = useState(readPrefs);
  const [focusRaw, setFocusRaw] = useState(prefs.focus ?? '');
  const [rival, setRival] = useState<string | null>(null);
  const [baseline, setBaseline] = useState<Baseline>(BASELINES.some(b => b.key === prefs.baseline) ? prefs.baseline! : 'media');
  const [view, setView] = useState<View>(VIEWS.some(v => v.key === prefs.view) ? prefs.view! : 'geral');
  const [quality, setQuality] = useState<Record<string, number>>({});

  // Notas de qualidade (mês mais recente lançado); se falharem, o KPI fica vazio.
  useEffect(() => {
    let alive = true;
    getLatestScores()
      .then(res => { if (alive && res) setQuality(qualityTotals(res.rows)); })
      .catch(() => { /* sem notas: o KPI Qualidade fica vazio */ });
    return () => { alive = false; };
  }, []);

  const { sellers, team } = useMemo(
    () => computeComparativo({ control: data?.control ?? [], objetivos: data?.objetivosResp ?? [], filter, quality }),
    [data, filter, quality],
  );

  const focus = sellers.some(s => s.resp === focusRaw) ? focusRaw : (sellers[0]?.resp ?? '');
  const rivalOk = rival && rival !== focus && sellers.some(s => s.resp === rival) ? rival : null;

  useEffect(() => { writePrefs({ focus: focusRaw || undefined, baseline, view }); }, [focusRaw, baseline, view]);

  const setFocus = (resp: string) => { setFocusRaw(resp); if (resp === rival) setRival(null); };
  const ctx: CompareCtx = { sellers, team, focus, rival: rivalOk, baseline, setFocus, setRival };

  if (!data) return <div className="text-sm text-muted-foreground p-4">Sem dados carregados.</div>;

  return (
    <div className="space-y-3 animate-fade-in">
      <div className="flex flex-col lg:flex-row gap-3">
        <div className="w-full lg:w-44 flex-shrink-0">
          <PeriodFilter />
        </div>

        <div className="flex-1 min-w-0 space-y-3">
          <div className="bg-card border border-border rounded-lg p-2.5 space-y-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mr-1">Eu sou</span>
              {sellers.map(s => (
                <Chip key={s.resp} active={s.resp === focus} color={C.focus} onClick={() => setFocus(s.resp)}>{s.resp}</Chip>
              ))}
              {sellers.length === 0 && <span className="text-[11px] text-muted-foreground">Sem vendedores com atividade no período.</span>}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Comparar com</span>
                <Seg value={baseline} onChange={v => setBaseline(v as Baseline)} options={BASELINES} />
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                  <Swords className="h-3 w-3" /> e com
                </span>
                {sellers.filter(s => s.resp !== focus).map(s => (
                  <Chip key={s.resp} active={s.resp === rivalOk} color={C.rival} onClick={() => setRival(s.resp === rivalOk ? null : s.resp)}>{s.resp}</Chip>
                ))}
              </div>
            </div>
          </div>

          <Seg value={view} onChange={v => setView(v as View)} options={VIEWS} />

          {sellers.length === 0 ? (
            <div className="bg-card border border-border rounded-lg p-8 text-center text-xs text-muted-foreground">
              Sem negócios nem retails no período selecionado.
            </div>
          ) : (
            <>
              {view === 'geral' && <OverviewView ctx={ctx} />}
              {view === 'ranking' && <RankingView ctx={ctx} />}
              {view === 'evolucao' && <EvolutionView ctx={ctx} />}
              {view === 'dispersao' && <ScatterView ctx={ctx} />}
              {view === 'mix' && <MixView ctx={ctx} />}
              {view === 'duelo' && <HeadToHeadView ctx={ctx} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
