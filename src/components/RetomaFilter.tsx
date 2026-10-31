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
      <div
        className="grid w-full gap-0.5 rounded-lg bg-muted p-0.5"
        style={{ gridTemplateColumns: options.length > 3 ? `auto repeat(${options.length - 1}, minmax(0, 1fr))` : `repeat(${options.length}, minmax(0, 1fr))` }}
      >
        {options.map((o) => {
          const active = value === o.value;
          return (
            <button
              key={o.label}
              type="button"
              onClick={() => onChange(o.value)}
              aria-pressed={active}
              className={`rounded-md py-1 text-[11px] font-medium transition-colors ${options.length > 3 ? 'px-1.5' : 'px-2'} ${
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

/* Tipo de viatura e características usam a mesma lógica dos outros filtros: "Todos" explícito
 * e uma escolha de cada vez. Os valores externos continuam a ser conjuntos/booleanos, porque
 * os cartões em donut também os alteram; com mais de um ativo nenhum segmento fica marcado. */
const MULTI = '__multi__';

export const TIPOS_VIATURA = ['VN', 'VD', 'RMK', 'VP'] as const;

export function TipoFilter({ value, onChange, className = '' }: {
  value: Set<string>;
  onChange: (v: Set<string>) => void;
  className?: string;
}) {
  const current = value.size === 0 ? null : value.size === 1 ? Array.from(value)[0] : MULTI;
  return (
    <SegmentedFilter<string | null>
      label="Tipo" className={className} value={current}
      onChange={t => onChange(t ? new Set([t]) : new Set())}
      options={[{ label: 'Todos', value: null }, ...TIPOS_VIATURA.map(t => ({ label: t, value: t as string | null }))]}
    />
  );
}

/** BEV / QoR / M: escolher um mostra só os que têm essa característica. */
export function FlagsFilter({ flags, className = '' }: {
  flags: { label: string; value: boolean | null; onChange: (v: boolean | null) => void }[];
  className?: string;
}) {
  const on = flags.filter(f => f.value === true);
  const current = on.length === 0 ? null : on.length === 1 ? on[0].label : MULTI;
  const select = (label: string | null) => flags.forEach(f => f.onChange(f.label === label ? true : null));
  return (
    <SegmentedFilter<string | null>
      label="Características" className={className} value={current} onChange={select}
      options={[{ label: 'Todos', value: null }, ...flags.map(f => ({ label: f.label, value: f.label as string | null }))]}
    />
  );
}
