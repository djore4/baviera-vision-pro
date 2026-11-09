import { cn } from '@/lib/utils';

/* Estilo único para chips/pílulas de filtro e para os botões de ação da app. */
export const chip = (active: boolean) => cn(
  'rounded-md border px-3 py-1.5 text-[11px] font-bold transition-colors',
  active
    ? 'border-primary bg-primary text-primary-foreground'
    : 'border-border bg-background text-muted-foreground hover:border-primary hover:text-primary',
);

const btnBase = 'inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors';
export const btnPrimary = cn(btnBase, 'bg-primary text-primary-foreground hover:bg-primary/90');
export const btnSecondary = cn(btnBase, 'border border-border bg-background hover:bg-muted');
/* Ação discreta ao nível dos chips (ex.: "Limpar filtros"). */
export const btnGhost = 'inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-[11px] font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground';
