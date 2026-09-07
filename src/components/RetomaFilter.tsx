/**
 * Filtro de retoma (tri-estado) — controlo segmentado.
 *   value === null  -> Todos (sem filtro)
 *   value === true  -> apenas processos COM retoma
 *   value === false -> apenas processos SEM retoma
 * O segmento ativo fica destacado, por isso o estado (incluindo "Todos") é
 * sempre explícito, ao contrário de dois botões soltos.
 */
export function RetomaFilter({ value, onChange, className = '' }: {
  value: boolean | null;
  onChange: (v: boolean | null) => void;
  className?: string;
}) {
  const opts: { label: string; v: boolean | null }[] = [
    { label: 'Todos', v: null },
    { label: 'Com', v: true },
    { label: 'Sem', v: false },
  ];
  return (
    <div className={className}>
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Retoma
      </span>
      <div className="grid w-full grid-cols-3 gap-0.5 rounded-lg bg-muted p-0.5">
        {opts.map((o) => {
          const active = value === o.v;
          return (
            <button
              key={o.label}
              type="button"
              onClick={() => onChange(o.v)}
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
