/**
 * Filtros segmentados da coluna da esquerda (WIP, etc.). O segmento ativo fica
 * destacado, por isso o estado (incluindo "Todos") é sempre explícito, ao contrário
 * de botões soltos.
 */
export function SegmentedFilter<T>({ label, options, value, onChange, className = '' }: {
  label: string;
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={className}>
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className="grid w-full gap-0.5 rounded-lg bg-muted p-0.5" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        {options.map((o) => {
          const active = value === o.value;
          return (
            <button
              key={o.label}
              type="button"
              onClick={() => onChange(o.value)}
              aria-pressed={active}
              className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                active
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Tri-estado: null = Todos (sem filtro), true = sim/com, false = não/sem. */
export function TriStateFilter({ label, value, onChange, yes = 'Sim', no = 'Não', className }: {
  label: string;
  value: boolean | null;
  onChange: (v: boolean | null) => void;
  yes?: string;
  no?: string;
  className?: string;
}) {
  return (
    <SegmentedFilter<boolean | null>
      label={label} className={className} value={value} onChange={onChange}
      options={[{ label: 'Todos', value: null }, { label: yes, value: true }, { label: no, value: false }]}
    />
  );
}

/** Filtro de retoma: apenas processos COM (true) ou SEM (false) retoma. */
export function RetomaFilter({ value, onChange, className = '' }: {
  value: boolean | null;
  onChange: (v: boolean | null) => void;
  className?: string;
}) {
  return <TriStateFilter label="Retoma" value={value} onChange={onChange} yes="Com" no="Sem" className={className} />;
}

/** Garantia de entrega (GAR / nGAR). */
export function GarantiaFilter({ value, onChange, className }: {
  value: 'GAR' | 'nGAR' | null;
  onChange: (v: 'GAR' | 'nGAR' | null) => void;
  className?: string;
}) {
  return (
    <SegmentedFilter<'GAR' | 'nGAR' | null>
      label="Garantia" className={className} value={value} onChange={onChange}
      options={[{ label: 'Todos', value: null }, { label: 'GAR', value: 'GAR' }, { label: 'nGAR', value: 'nGAR' }]}
    />
  );
}

/** Tipo de viatura (multi-seleção): sem nenhum escolhido = sem filtro. */
export const TIPOS_VIATURA = ['VN', 'VD', 'RMK', 'VP'] as const;

export function TipoFilter({ value, onChange, className = '' }: {
  value: Set<string>;
  onChange: (v: Set<string>) => void;
  className?: string;
}) {
  const toggle = (t: string) => {
    const next = new Set(value);
    if (next.has(t)) next.delete(t); else next.add(t);
    onChange(next);
  };
  return (
    <div className={className}>
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Tipo</span>
      <div className="grid grid-cols-2 gap-0.5 rounded-lg bg-muted p-0.5">
        {TIPOS_VIATURA.map(t => {
          const active = value.has(t);
          return (
            <button
              key={t}
              type="button"
              onClick={() => toggle(t)}
              aria-pressed={active}
              title={t === 'VP' ? 'VP conta para faturas, não para retails' : undefined}
              className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t}
            </button>
          );
        })}
      </div>
    </div>
  );
}
