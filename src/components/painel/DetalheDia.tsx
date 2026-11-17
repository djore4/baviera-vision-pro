import { forwardRef, useState } from 'react';
import { ChevronRight, X } from 'lucide-react';
import type { ControlRecord } from '@/types/data';
import { formatDate } from '@/lib/viaturas';
import { cn } from '@/lib/utils';

/* Zona do Painel onde está a lista por trás de cada quadrado do resumo: clicar no quadrado
 * desloca a página até aqui. */

const VISIVEIS = 10;
const STATUS_ROTULO: Record<string, string> = { Carteira: 'Carteira', Matricula: 'Matrícula', Retail: 'Retail' };
const STATUS_COR: Record<string, string> = {
  Carteira: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  Matricula: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-400',
  Retail: 'bg-primary/10 text-primary',
};

interface Props {
  titulo: string;
  descricao: string;
  registos: ControlRecord[];
  mostrarResp: boolean;
  /** Abre a ficha completa (só quem edita Dados/Database). */
  onAbrir?: (id: string) => void;
  onFechar: () => void;
}

export const DetalheDia = forwardRef<HTMLElement, Props>(function DetalheDia({ titulo, descricao, registos, mostrarResp, onAbrir, onFechar }, ref) {
  const [todos, setTodos] = useState(false);
  const lista = todos ? registos : registos.slice(0, VISIVEIS);
  return (
    <section ref={ref} id="painel-detalhe" aria-label={titulo} data-testid="painel-detalhe"
      className="scroll-mt-4 rounded-xl border border-primary/30 bg-card p-4 shadow-sm">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">{titulo} <span className="tabular-nums text-muted-foreground">({registos.length})</span></h2>
          <p className="text-xs text-muted-foreground">{descricao}</p>
        </div>
        <button type="button" onClick={onFechar} aria-label="Fechar detalhe" title="Fechar"
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"><X className="h-4 w-4" /></button>
      </header>

      {registos.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Nada a mostrar.</p>
      ) : (
        <ul className="mt-2 divide-y divide-border/60">
          {lista.map((r, i) => {
            const corpo = (
              <>
                <div className="min-w-0 flex-1 text-left">
                  <div className="truncate text-sm font-medium">{[r.model, r.version].filter(Boolean).join(' ') || 'Viatura'}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {r.cliente || 'sem cliente'}{r.mat ? ` · ${r.mat}` : r.chas ? ` · …${r.chas.slice(-7)}` : ''}
                    {r.mes1 ? ` · entrega ${r.mes1}` : ''}
                  </div>
                </div>
                {r.neg && <span className="hidden shrink-0 text-[11px] text-muted-foreground sm:inline">neg. {formatDate(r.neg)}</span>}
                {mostrarResp && r.resp && <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">{r.resp}</span>}
                <span className={cn('shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold', STATUS_COR[r.status] ?? 'bg-muted text-muted-foreground')}>
                  {STATUS_ROTULO[r.status] ?? r.status}
                </span>
                {r.id && onAbrir && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />}
              </>
            );
            const key = r.id ?? `${r.chas}-${i}`;
            return (
              <li key={key}>
                {r.id && onAbrir
                  ? <button type="button" onClick={() => onAbrir(r.id!)} className="flex w-full items-center gap-2 rounded-md px-1 py-2 hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{corpo}</button>
                  : <div className="flex items-center gap-2 px-1 py-2">{corpo}</div>}
              </li>
            );
          })}
        </ul>
      )}
      {registos.length > VISIVEIS && (
        <button type="button" onClick={() => setTodos(t => !t)} className="mt-1 px-1 text-xs font-medium text-primary hover:underline">
          {todos ? 'Ver menos' : `Ver mais ${registos.length - VISIVEIS}`}
        </button>
      )}
    </section>
  );
});
