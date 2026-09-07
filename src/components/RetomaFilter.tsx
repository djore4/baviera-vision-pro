/**
 * Filtro de retoma (tri-estado) para os painéis de filtros.
 *   value === true  -> apenas processos COM retoma
 *   value === false -> apenas processos SEM retoma
 *   value === null  -> todos (sem filtro)
 * Clicar no botão já ativo desliga o filtro (volta a null).
 */
export function RetomaFilter({ value, onChange }: {
  value: boolean | null;
  onChange: (v: boolean | null) => void;
}) {
  const btn = (active: boolean) =>
    `flex-1 rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors ${
      active
        ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary'
        : 'border-border bg-background text-muted-foreground hover:bg-accent'
    }`;
  return (
    <div className="w-full rounded-lg border border-border bg-card p-2.5">
      <span className="text-[11px] font-semibold uppercase text-muted-foreground">Retoma</span>
      <div className="mt-1.5 flex gap-1">
        <button type="button" onClick={() => onChange(value === true ? null : true)} className={btn(value === true)}>
          Com
        </button>
        <button type="button" onClick={() => onChange(value === false ? null : false)} className={btn(value === false)}>
          Sem
        </button>
      </div>
    </div>
  );
}
