import { ParkingCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { RetomaFilter, TipoFilter, GarantiaFilter, FlagsFilter } from '@/components/RetomaFilter';

/* Filtros partilhados pelas páginas VN (WIP, Produção, Carteira): Em Parque, Retoma, Tipo,
 * Garantia e Características (BEV / QoR / M). Cada página guarda o estado; aqui só o desenho. */

/** "Em parque": semana 198 com P e ainda não entregue ao cliente. */
export const isParked = (r: { week198: string; status: string }) =>
  r.week198.toUpperCase().includes('P') && r.status !== 'Retail';

export type Garantia = 'GAR' | 'nGAR' | null;

export interface ExtraFiltersState {
  ret: boolean | null; setRet: (v: boolean | null) => void;
  gar: Garantia; setGar: (v: Garantia) => void;
  types: Set<string>; setTypes: (v: Set<string>) => void;
  bev: boolean | null; setBev: (v: boolean | null) => void;
  qor: boolean | null; setQor: (v: boolean | null) => void;
  m: boolean | null; setM: (v: boolean | null) => void;
  park: boolean; setPark: (v: boolean) => void;
}

export function ParkFilter({ active, count, onToggle }: { active: boolean; count: number; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      aria-label="Em Parque"
      title="Em Parque"
      className={`flex items-center gap-1 rounded-md border px-1.5 py-0.5 transition-all ${active ? 'border-primary bg-primary/10 ring-1 ring-primary' : 'border-border bg-background hover:bg-accent'}`}
    >
      <ParkingCircle className={`h-3.5 w-3.5 ${active ? 'text-primary' : 'text-muted-foreground'}`} />
      <Badge variant={active ? 'default' : 'secondary'} className="px-1.5 py-0 text-[10px]">{count}</Badge>
    </button>
  );
}

/** `column`: empilhados (coluna da esquerda); `bar`: lado a lado (barra de topo). */
export function ExtraFilters({ s, parkCount, layout = 'column' }: { s: ExtraFiltersState; parkCount: number; layout?: 'column' | 'bar' }) {
  const bar = layout === 'bar';
  const item = bar ? 'w-40' : '';
  return (
    <div className={bar ? 'flex flex-wrap items-end gap-x-4 gap-y-2' : 'space-y-2'}>
      <RetomaFilter value={s.ret} onChange={s.setRet} className={item}
        labelAction={<ParkFilter active={s.park} count={parkCount} onToggle={() => s.setPark(!s.park)} />} />
      <TipoFilter value={s.types} onChange={s.setTypes} className={item} />
      <GarantiaFilter value={s.gar} onChange={s.setGar} className={item} />
      <FlagsFilter className={item} flags={[
        { label: 'BEV', value: s.bev, onChange: s.setBev },
        { label: 'QoR', value: s.qor, onChange: s.setQor },
        { label: 'M', value: s.m, onChange: s.setM },
      ]} />
    </div>
  );
}

/** Chips de filtros ativos dos controlos acima (cada chip limpa o seu filtro). */
export function ExtraFilterChips({ s, className = 'text-[10px] cursor-pointer justify-between' }: { s: ExtraFiltersState; className?: string }) {
  return (
    <>
      {s.park && <Badge variant="secondary" className={className} onClick={() => s.setPark(false)}>Parque x</Badge>}
      {s.ret !== null && <Badge variant="secondary" className={className} onClick={() => s.setRet(null)}>Retoma: {s.ret ? 'Com' : 'Sem'} x</Badge>}
      {s.types.size > 0 && <Badge variant="secondary" className={className} onClick={() => s.setTypes(new Set())}>Tipo: {Array.from(s.types).join(', ')} x</Badge>}
      {s.gar && <Badge variant="secondary" className={className} onClick={() => s.setGar(null)}>Garantia: {s.gar} x</Badge>}
      {s.bev !== null && <Badge variant="secondary" className={className} onClick={() => s.setBev(null)}>BEV x</Badge>}
      {s.qor !== null && <Badge variant="secondary" className={className} onClick={() => s.setQor(null)}>QoR x</Badge>}
      {s.m !== null && <Badge variant="secondary" className={className} onClick={() => s.setM(null)}>M x</Badge>}
    </>
  );
}

export const hasExtraFilters = (s: ExtraFiltersState) =>
  s.park || s.ret !== null || s.types.size > 0 || !!s.gar || s.bev !== null || s.qor !== null || s.m !== null;
