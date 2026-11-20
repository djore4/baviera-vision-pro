import { SlidersHorizontal } from 'lucide-react';

/* Botão "Filtros" que mostra/esconde o painel de filtros de uma página.
   As páginas arrancam com os filtros escondidos (como em Demos); o contador
   mostra quantos filtros estão ativos mesmo com o painel fechado. */
export function FiltrosToggle({ open, onToggle, count = 0 }: { open: boolean; onToggle: () => void; count?: number }) {
  return (
    <button
      type="button" onClick={onToggle} aria-expanded={open}
      className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-medium ${
        open || count > 0
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-secondary text-secondary-foreground hover:bg-accent'
      }`}
    >
      <SlidersHorizontal className="h-3.5 w-3.5" />Filtros{count > 0 ? ` (${count})` : ''}
    </button>
  );
}
