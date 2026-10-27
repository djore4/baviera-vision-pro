import { cn } from '@/lib/utils';

export const pill = (active: boolean) => cn(
  'rounded-md border px-4 py-2 text-xs font-semibold transition-colors',
  active
    ? 'border-primary bg-primary text-primary-foreground'
    : 'border-border bg-background text-foreground hover:border-primary hover:text-primary',
);
