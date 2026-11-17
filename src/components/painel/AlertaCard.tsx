import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Award, BatteryCharging, ChevronRight, FileCheck2, FileWarning, Landmark, ParkingSquare, TrendingDown,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AlertaGrupo, AlertaItem, RegraId, Severidade } from '@/lib/painel';

export const REGRA_ICONS: Record<RegraId, LucideIcon> = {
  'parque-sem-matricula': ParkingSquare,
  'matriculado-sem-certificado': FileCheck2,
  'financiamento-bmw': Landmark,
  'sem-bizagi': FileWarning,
  'bev-lead-cme': BatteryCharging,
  'reducao-preco': TrendingDown,
  'premio-venda': Award,
};

/* Cor por severidade: alta = vermelho, média = âmbar, informativa = azul da marca. */
export const SEV_STYLE: Record<Severidade, { barra: string; icone: string; chip: string; rotulo: string }> = {
  alta: { barra: 'bg-destructive', icone: 'bg-destructive/10 text-destructive', chip: 'bg-destructive/10 text-destructive', rotulo: 'Urgente' },
  media: { barra: 'bg-amber-500', icone: 'bg-amber-500/15 text-amber-600 dark:text-amber-400', chip: 'bg-amber-500/15 text-amber-700 dark:text-amber-400', rotulo: 'A tratar' },
  info: { barra: 'bg-primary', icone: 'bg-primary/10 text-primary', chip: 'bg-primary/10 text-primary', rotulo: 'Informação' },
};

/** O contador de dias de uma linha: o que se quer ver de relance. */
export function DiasChip({ item }: { item: AlertaItem }) {
  if (item.dias === null) {
    return <span title="Sem data de entrada registada (a viatura já estava em parque antes do registo)"
      className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">s/ data</span>;
  }
  const hoje = item.dias === 0;
  return (
    <span className={cn('rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums', SEV_STYLE[item.severidade].chip)}
      title={hoje ? 'Hoje' : `Há ${item.dias} dias`}>
      {hoje ? 'hoje' : `${item.dias} d`}
    </span>
  );
}

const VISIVEIS = 5;

interface Props {
  grupo: AlertaGrupo;
  /** Abre o registo (quando a pessoa o pode editar). */
  onAbrir?: (recordId: string) => void;
  /** Para onde "Abrir ›" leva (só se a pessoa tem acesso). */
  destino?: { path: string; label: string } | null;
  mostrarResp: boolean;
}

export function AlertaCard({ grupo, onAbrir, destino, mostrarResp }: Props) {
  const { regra, itens, urgentes } = grupo;
  const [todos, setTodos] = useState(false);
  const Icon = REGRA_ICONS[regra.id];
  // A cor do cartão é a do item mais grave que tem.
  const sev: Severidade = urgentes > 0 ? 'alta' : regra.base;
  const st = SEV_STYLE[sev];
  const lista = todos ? itens : itens.slice(0, VISIVEIS);

  return (
    <section data-testid={`alerta-${regra.id}`}
      className="relative flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md">
      <span className={cn('absolute inset-x-0 top-0 h-0.5', st.barra)} aria-hidden />
      <header className="flex items-start gap-3 px-4 pt-4 pb-2">
        <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-lg', st.icone)}><Icon className="h-[18px] w-[18px]" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold leading-snug">{regra.titulo}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{regra.acao}</p>
          <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/80">{regra.para}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={cn('grid h-7 min-w-[1.75rem] place-items-center rounded-full px-2 text-sm font-bold tabular-nums', st.chip)}>{itens.length}</span>
          {urgentes > 0 && <span className="text-[10px] font-semibold text-destructive">{urgentes} urgente{urgentes > 1 ? 's' : ''}</span>}
        </div>
      </header>

      <ul className="divide-y divide-border/60 px-2 pb-2">
        {lista.map(item => {
          const interativo = !!(item.recordId && onAbrir);
          const corpo = (
            <>
              <div className="min-w-0 flex-1 text-left">
                <div className="truncate text-sm font-medium">{item.titulo}</div>
                <div className="truncate text-xs text-muted-foreground">{item.detalhe}</div>
              </div>
              {item.nota && <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">{item.nota}</span>}
              {mostrarResp && item.resp && (
                <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">{item.resp}</span>
              )}
              <DiasChip item={item} />
              {interativo && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />}
            </>
          );
          return (
            <li key={item.id}>
              {interativo ? (
                <button type="button" onClick={() => onAbrir!(item.recordId!)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {corpo}
                </button>
              ) : (
                <div className="flex items-center gap-2 px-2 py-2">{corpo}</div>
              )}
            </li>
          );
        })}
      </ul>

      {(itens.length > VISIVEIS || destino) && (
        <footer className="mt-auto flex items-center justify-between border-t border-border/60 px-4 py-2 text-xs">
          {itens.length > VISIVEIS ? (
            <button type="button" onClick={() => setTodos(t => !t)} className="font-medium text-primary hover:underline">
              {todos ? 'Ver menos' : `Ver mais ${itens.length - VISIVEIS}`}
            </button>
          ) : <span />}
          {destino && (
            <Link to={destino.path} className="inline-flex items-center gap-0.5 font-medium text-muted-foreground hover:text-foreground">
              {destino.label} <ChevronRight className="h-3 w-3" />
            </Link>
          )}
        </footer>
      )}
    </section>
  );
}
