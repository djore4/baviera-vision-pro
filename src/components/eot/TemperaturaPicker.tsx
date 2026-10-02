import { Thermometer, Check } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { TEMPERATURAS, tempDef, type Temperatura } from '@/lib/eot';

/* Seletor compacto de temperatura (Frio / Morno / Quente). Mostra a etiqueta com a
 * cor atual e abre um menu para classificar; sem permissão de edição é só leitura. */
export function TemperaturaPicker({ value, onChange, disabled }: {
  value: Temperatura | null;
  onChange: (v: Temperatura | null) => void;
  disabled?: boolean;
}) {
  const def = tempDef(value);
  const label = def ? (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap', def.badge)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', def.dot)} />{def.label}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] text-muted-foreground whitespace-nowrap">
      <Thermometer className="h-3 w-3" />Classificar
    </span>
  );

  if (disabled) return def ? label : <span className="text-[11px] text-muted-foreground/60">—</span>;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" onClick={e => e.stopPropagation()} className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring" title="Classificar negócio">
          {label}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" onClick={e => e.stopPropagation()}>
        {TEMPERATURAS.map(t => (
          <DropdownMenuItem key={t.value} onSelect={() => onChange(t.value)} className="gap-2">
            <span className={cn('h-2.5 w-2.5 rounded-full', t.dot)} />
            {t.label}
            {value === t.value && <Check className="h-3.5 w-3.5 ml-auto" />}
          </DropdownMenuItem>
        ))}
        {value && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onChange(null)} className="text-muted-foreground">Sem classificação</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
