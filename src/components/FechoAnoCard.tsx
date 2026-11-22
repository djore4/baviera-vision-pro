import { useMemo } from 'react';
import { CalendarClock } from 'lucide-react';
import { useData } from '@/contexts/DataContext';
import { usePermissions } from '@/contexts/PermissionsContext';
import { buildAnual } from '@/lib/objetivos-anual';
import { diasUteisAteFimDeAno, faltaObjetivo, type FaltaObjetivo } from '@/lib/fecho-ano';
import { seasonalFlags } from '@/lib/seasonal';

/* ── Contador de fecho de ano ─────────────────────────────────────────────────
 * Dias úteis até 31/12 e o que falta para o objetivo anual (GSC e BMW), com o ritmo
 * por dia útil. Aparece de 15/11 a 31/12, só no ano corrente. É informação, não
 * decoração: usa cores neutras (nada de verde/vermelho, que aqui significam
 * objetivo) e não depende do efeito sazonal. As linhas de objetivo só aparecem a
 * quem pode ver o tab Objetivos. ─────────────────────────────────────────── */

function Linha({ label, f }: { label: string; f: FaltaObjetivo }) {
  const pct = Math.min(100, Math.round((f.real / f.objetivo) * 100));
  return (
    <div className="min-w-[200px] flex-1" data-testid={`fecho-${label}`}>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-semibold">{label}</span>
        <span className="tabular-nums text-muted-foreground">{f.real} / {f.objetivo} · {pct}%</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={`Objetivo anual ${label}`} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        {f.atingido
          ? 'Objetivo anual atingido.'
          : <>Faltam <b className="text-foreground">{f.falta}</b> retails{f.porDiaUtil !== null && <> · <b className="text-foreground">{f.porDiaUtil.toLocaleString('pt-PT')}</b> por dia útil</>}</>}
      </p>
    </div>
  );
}

export function FechoAnoCard({ ano, hoje = new Date() }: { ano?: number; hoje?: Date }) {
  const { data } = useData();
  const { canView } = usePermissions();
  const anoAtual = hoje.getFullYear();
  const visivel = seasonalFlags(hoje).fechoAno && (ano ?? anoAtual) === anoAtual;
  const verObjetivos = canView('objetivos');

  const dias = diasUteisAteFimDeAno(hoje);
  const total = useMemo(
    () => visivel && verObjetivos
      ? buildAnual(anoAtual, data?.objetivosTotal ?? [], data?.objetivosResp ?? [], data?.control ?? [], hoje).total
      : null,
    [visivel, verObjetivos, anoAtual, data, hoje],
  );

  if (!visivel) return null;
  const gsc = total ? faltaObjetivo(total.gsc, total.retails, dias) : null;
  const bmw = total ? faltaObjetivo(total.bmw, total.retails, dias) : null;

  return (
    <section className="rounded-xl border border-border bg-card p-4" data-testid="fecho-ano" aria-label="Fecho de ano">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-3">
          <CalendarClock className="h-6 w-6 text-primary" aria-hidden />
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Fecho de ano</p>
            <p className="text-sm">
              <b className="text-2xl font-bold tabular-nums" data-testid="fecho-dias">{dias}</b>{' '}
              {dias !== 1 ? 'dias úteis' : 'dia útil'} até 31/12
            </p>
          </div>
        </div>
        {gsc && <Linha label="GSC" f={gsc} />}
        {bmw && <Linha label="BMW" f={bmw} />}
      </div>
    </section>
  );
}
