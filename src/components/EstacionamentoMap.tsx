/* ── Mapa de estacionamento (chefias e vendedores) ─────────────────────────────
 * Dados transcritos do mapa mensal enviado pela Caetano (PGO). Atualizar o mês
 * e as listas abaixo quando for publicado um mapa novo.
 * ──────────────────────────────────────────────────────────────────────────── */

const MAP_LABEL = 'Outubro 2026';

interface Spot { num: number; name: string; day: string }

// Fila de cima (da esquerda para a direita)
const ROW_TOP: Array<Spot | null> = [
  { num: 67, name: 'João Duarte', day: '4ª feira' },
  { num: 69, name: 'Gonçalo Pinto', day: '4ª feira' },
  { num: 68, name: 'Paula Abreu', day: '4ª feira' },
  { num: 67, name: 'Belmiro Resgate', day: '5ª feira' },
  { num: 66, name: 'Pedro Ferreirinha', day: '3ª feira' },
  { num: 65, name: 'Paulo Matos', day: '4ª feira' },
  { num: 64, name: 'Nuno Conde', day: '2ª feira' },
  { num: 63, name: 'Fernando Sousa', day: '3ª feira' },
];

// Fila de baixo
const ROW_BOTTOM: Array<Spot | null> = [
  { num: 55, name: 'António Lourenço', day: '2ª feira' },
  { num: 56, name: 'Rui Duarte', day: '5ª feira' },
  { num: 57, name: 'Ismael Ferreira', day: '5ª feira' },
  { num: 58, name: 'Pivot PGO', day: '4ª feira' },
  { num: 59, name: 'Salomão Pinto', day: '3ª feira' },
  { num: 60, name: 'Tiago Santos', day: '5ª feira' },
  { num: 61, name: 'Marcos Pinto', day: '2ª feira' },
  { num: 62, name: 'João C Duarte', day: '3ª feira' },
];

const DAYS: Array<{ label: string; names: string }> = [
  { label: '2ª Feira', names: 'António Lourenço, Nuno Conde e Marcos Pinto' },
  { label: '3ª Feira', names: 'Pedro Ferreirinha, Fernando Sousa, Salomão Pinto, João C Duarte' },
  { label: '4ª Feira', names: 'Gonçalo Pinto, Paula Abreu, Paulo Matos, Pivot PGO' },
  { label: '5ª Feira', names: 'Belmiro Resgate, Rui Duarte, Ismael Ferreira, Tiago Santos' },
];

function SpotCell({ spot }: { spot: Spot | null }) {
  if (!spot) {
    return (
      <div
        className="h-16 rounded border border-border bg-muted/40"
        style={{ backgroundImage: 'repeating-linear-gradient(135deg, transparent 0 5px, hsl(var(--border)) 5px 6px)' }}
        aria-label="Lugar bloqueado"
      />
    );
  }
  return (
    <div className="flex h-16 flex-col items-center justify-between rounded border border-border bg-sky-50 px-1 py-1 text-center dark:bg-sky-950/40">
      <div className="text-[10px] font-semibold leading-tight">{spot.name}</div>
      <div className="text-[9px] text-muted-foreground">{spot.day}</div>
      <div className="text-xs font-bold tabular-nums">{spot.num}</div>
    </div>
  );
}

export default function EstacionamentoMap() {
  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-3">
      <div className="flex items-baseline justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Mapa de estacionamento — chefias e vendedores
        </h3>
        <span className="text-[11px] text-muted-foreground">{MAP_LABEL}</span>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[36rem] space-y-1.5">
          <div className="mx-auto w-1/2 rounded bg-[#002060] py-2 text-center text-sm font-bold tracking-wider text-white">
            LAVAGEM
          </div>
          <div className="grid grid-cols-8 gap-1">
            {ROW_TOP.map((s, i) => <SpotCell key={i} spot={s} />)}
          </div>
          <div className="grid grid-cols-8 gap-1">
            {ROW_BOTTOM.map((s, i) => <SpotCell key={i} spot={s} />)}
          </div>
        </div>
      </div>

      <ul className="space-y-0.5 text-[11px] text-muted-foreground">
        {DAYS.map(d => (
          <li key={d.label}><strong className="text-foreground">{d.label}</strong> – {d.names}</li>
        ))}
      </ul>
    </div>
  );
}
