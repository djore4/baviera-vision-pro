import { MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { locaisDoGrupo } from '@/lib/locations';

/* Escolha dos locais (stands) em que um utilizador opera. Sem nenhum escolhido a
 * pessoa abre as tabs sem filtro de local ("todos"). */
export function LocaisPicker({ value, onChange, disabled, className }: {
  value: string[]; onChange: (v: string[]) => void; disabled?: boolean; className?: string;
}) {
  const todos = locaisDoGrupo();
  if (todos.length === 0) return null;

  const toggle = (l: string) => onChange(value.includes(l) ? value.filter(x => x !== l) : todos.filter(x => x === l || value.includes(x)));

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" disabled={disabled} aria-label="Locais"
          className={cn('h-8 w-full min-w-[150px] justify-start gap-1.5 px-2 font-normal', className)}>
          <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          {value.length === 0
            ? <span className="text-muted-foreground">Todos os locais</span>
            : <span className="truncate">{value.join(', ')}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-52 p-2">
        <p className="px-2 pb-1.5 pt-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Opera em</p>
        {todos.map(l => (
          <label key={l} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted">
            <Checkbox checked={value.includes(l)} onCheckedChange={() => toggle(l)} />
            {l}
          </label>
        ))}
        {value.length > 0 && (
          <button type="button" onClick={() => onChange([])}
            className="mt-1 w-full rounded px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
            Limpar (todos os locais)
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
