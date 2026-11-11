import { Loader2, Lock, Star } from 'lucide-react';

/* Cartão de uma viatura do parque (vista em cartões, telemóvel e desktop).
 * Hierarquia: 1) o que é (modelo + versão), 2) como a encontrar (matrícula, chassis, local),
 * 3) o que vale (PVP final e comissão). Reserva e prémio aparecem numa faixa no topo e numa
 * barra de cor lateral; só se mostra a comissão quando existe. */

export interface CartaoVM {
  chassis: string;
  modelo: string;
  versao: string;
  matricula: string;
  chassisCurto: string;
  local: string;
  negocio: 'VD' | 'VU';
  marcaExtra: string;
  tags: string[];
  idade: number;
  pvp: number;
  pvpDesc: number;
  comissao: number | null;
  premio: number;
  reservado: boolean;
  reservaAte: string;
  reservaPor: string;
  capa?: string;
}

const eur0 = (n: number) => n.toLocaleString('pt-PT', { maximumFractionDigits: 0 }) + ' €';

function idadeTom(dias: number) {
  if (dias <= 90) return { dot: 'bg-green-500', txt: 'text-green-700 dark:text-green-400' };
  if (dias <= 180) return { dot: 'bg-yellow-500', txt: 'text-yellow-700 dark:text-yellow-400' };
  return { dot: 'bg-red-500', txt: 'text-red-700 dark:text-red-400' };
}

export default function CartaoViatura({ vm, podeReservar, reservando, onReservar, onAbrir }: {
  vm: CartaoVM;
  podeReservar: boolean;
  reservando: boolean;
  onReservar: (libertar: boolean) => void;
  onAbrir: () => void;
}) {
  const comPremio = vm.premio > 0;
  const totalComissao = (vm.comissao ?? 0) + vm.premio;
  const idade = idadeTom(vm.idade);
  const barra = vm.reservado ? 'bg-yellow-400' : comPremio ? 'bg-orange-500' : '';
  const meta = [vm.local, vm.negocio, vm.marcaExtra, ...vm.tags].filter(Boolean);

  return (
    <article
      onClick={onAbrir}
      data-premio={comPremio ? 'sim' : undefined}
      data-reservada={vm.reservado ? 'sim' : undefined}
      className={`relative flex h-full flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition active:scale-[0.99] cursor-pointer hover:shadow-md ${
        vm.reservado ? 'border-yellow-400/70' : comPremio ? 'border-orange-400/60' : 'border-border'}`}
    >
      {barra && <span aria-hidden className={`absolute inset-y-0 left-0 w-1.5 ${barra}`} />}

      {vm.reservado && (
        <div className="flex items-center gap-1.5 bg-yellow-400/25 px-4 py-1.5 pl-5 text-[11px] font-bold text-yellow-900 dark:text-yellow-200">
          <Lock className="h-3 w-3 shrink-0" aria-hidden />
          <span className="truncate">Reservada até {vm.reservaAte}{vm.reservaPor ? ` · ${vm.reservaPor}` : ''}</span>
        </div>
      )}
      {comPremio && (
        <div className="flex items-center gap-1.5 bg-orange-500/15 px-4 py-1.5 pl-5 text-[11px] font-bold text-orange-800 dark:text-orange-300">
          <Star className="h-3 w-3 shrink-0 fill-current" aria-hidden />
          <span>Prémio de venda +{eur0(vm.premio)}</span>
        </div>
      )}

      <div className="flex-1 space-y-2.5 px-4 pb-3 pt-3.5 pl-5">
        <div className="flex items-start gap-3">
          {vm.capa && <img src={vm.capa} alt="" loading="lazy" className="h-14 w-14 shrink-0 rounded-xl border border-border object-cover" />}
          <div className="min-w-0">
            <h3 className="truncate text-base font-extrabold leading-tight text-foreground">{vm.modelo || '—'}</h3>
            <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">{vm.versao || '—'}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <span className="rounded-md border border-border bg-muted/50 px-2 py-0.5 font-mono text-[13px] font-semibold uppercase tracking-wider text-foreground">
            {vm.matricula || 'sem matrícula'}
          </span>
          <span className="font-mono text-xs uppercase text-muted-foreground">{vm.chassisCurto}</span>
          <span className={`ml-auto inline-flex items-center gap-1.5 text-xs font-semibold ${idade.txt}`}>
            <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${idade.dot}`} />
            {vm.idade === 0 ? 'Novo' : `${vm.idade} dias`}
          </span>
        </div>

        {meta.length > 0 && <p className="text-xs text-muted-foreground">{meta.join(' · ')}</p>}
      </div>

      <div className="flex items-end justify-between gap-4 border-t border-border bg-muted/30 px-4 py-3 pl-5">
        <div>
          <span className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">PVP final</span>
          <span className="block text-xl font-extrabold leading-tight tabular-nums text-brand-primary">
            {vm.pvpDesc > 0 ? eur0(vm.pvpDesc) : '—'}
          </span>
          {vm.pvp > 0 && vm.pvpDesc > 0 && <span className="block text-xs tabular-nums text-muted-foreground line-through">{eur0(vm.pvp)}</span>}
        </div>
        {totalComissao > 0 && (
          <div className="text-right">
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Comissão</span>
            <span className={`mt-0.5 inline-block rounded-lg border px-2.5 py-1 text-lg font-extrabold leading-tight tabular-nums ${
              comPremio
                ? 'border-orange-400/70 bg-orange-500/15 text-orange-700 dark:text-orange-300'
                : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'}`}>
              {eur0(totalComissao)}
            </span>
            {comPremio && vm.comissao ? (
              <span className="mt-0.5 block text-[10px] font-semibold text-muted-foreground">{eur0(vm.comissao)} + {eur0(vm.premio)} prémio</span>
            ) : null}
          </div>
        )}
      </div>

      {podeReservar && (
        <div className="border-t border-border px-3 py-2 pl-4">
          <button
            type="button" disabled={reservando}
            onClick={e => { e.stopPropagation(); onReservar(vm.reservado); }}
            className={`flex h-10 w-full items-center justify-center gap-2 rounded-lg border text-sm font-semibold transition-colors ${
              vm.reservado
                ? 'border-yellow-500/60 bg-yellow-400/20 text-yellow-900 hover:bg-yellow-400/30 dark:text-yellow-200'
                : 'border-border bg-background text-foreground hover:bg-muted'}`}
          >
            {reservando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
            {vm.reservado ? 'Libertar reserva' : 'Reservar por 24 h'}
          </button>
        </div>
      )}
    </article>
  );
}
