import { Loader2, Lock, Star } from 'lucide-react';

/* Cartão de uma viatura do parque (vista em cartões, telemóvel e desktop), no estilo da Gestão VD da
 * Sales Force: título com modelo + versão, estado em etiqueta, identificação numa linha, preço final
 * em grande e linhas rótulo/valor. Acrescenta o que é próprio desta plataforma: comissão, prémio de
 * venda e reserva de 24 h (a barra lateral passa a laranja/amarela e a reserva ganha o seu estado). */

export interface CartaoVM {
  chassis: string;
  modelo: string;
  versao: string;
  matricula: string;
  local: string;
  negocio: 'VD' | 'VU';
  marca: string;
  tecnologia: string;
  dataMatricula: string;
  idade: number;
  pvp: number;
  pvpDesc: number;
  bsiIncluido: boolean;
  comissao: number | null;
  premio: number;
  reservado: boolean;
  reservaAte: string;
  reservaPor: string;
  capa?: string;
}

const eur0 = (n: number) => n.toLocaleString('pt-PT', { maximumFractionDigits: 0 }) + ' €';
const eur2 = (n: number) => n.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

function Pill({ tom, children }: { tom: 'verde' | 'amarelo' | 'vermelho'; children: React.ReactNode }) {
  const c = tom === 'verde'
    ? 'border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400'
    : tom === 'amarelo'
      ? 'border-yellow-500/50 bg-yellow-400/15 text-yellow-800 dark:text-yellow-300'
      : 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400';
  return <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${c}`}>{children}</span>;
}

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <dt className="shrink-0 whitespace-nowrap text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{rotulo}</dt>
      <dd className="min-w-0 truncate text-right text-sm font-bold tabular-nums text-foreground">{children}</dd>
    </div>
  );
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
  const desconto = vm.pvp > 0 && vm.pvpDesc > 0 ? Math.max(0, vm.pvp - vm.pvpDesc) : 0;
  const barra = vm.reservado ? 'bg-yellow-400' : comPremio ? 'bg-orange-500' : 'bg-brand-primary';
  const idadeTom = vm.idade <= 90 ? 'verde' : vm.idade <= 180 ? 'amarelo' : 'vermelho';
  const idadePill = idadeTom === 'verde'
    ? 'border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400'
    : idadeTom === 'amarelo'
      ? 'border-yellow-500/50 bg-yellow-400/15 text-yellow-800 dark:text-yellow-300'
      : 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400';
  const ident = [vm.marca, vm.matricula, vm.local, vm.tecnologia, vm.dataMatricula].filter(Boolean).join(' • ');

  return (
    <article
      onClick={onAbrir}
      data-premio={comPremio ? 'sim' : undefined}
      data-reservada={vm.reservado ? 'sim' : undefined}
      className={`relative flex h-full cursor-pointer flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition hover:shadow-md active:scale-[0.99] ${
        vm.reservado ? 'border-yellow-400/60' : comPremio ? 'border-orange-400/50' : 'border-border'}`}
    >
      <span aria-hidden className={`absolute inset-y-0 left-0 w-1.5 ${barra}`} />

      <div className="flex-1 space-y-3 p-4 pl-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2.5">
            {vm.capa && <img src={vm.capa} alt="" loading="lazy" className="h-11 w-11 shrink-0 rounded-lg border border-border object-cover" />}
            <div className="min-w-0">
              <h3 className="text-[17px] font-extrabold leading-snug text-foreground">
                {[vm.modelo, vm.versao].filter(Boolean).join(' ') || '—'}
              </h3>
              <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] leading-snug text-muted-foreground">
                <span className={`rounded border px-1 py-px text-[9px] font-bold ${
                  vm.negocio === 'VU'
                    ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                    : 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300'}`}>{vm.negocio}</span>
                <span>{ident}</span>
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            {vm.reservado
              ? <Pill tom="amarelo"><Lock className="h-2.5 w-2.5" aria-hidden />Reservada</Pill>
              : <Pill tom="verde"><span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />Disponível</Pill>}
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${idadePill}`}>{vm.idade === 0 ? 'Novo' : `${vm.idade} dias`}</span>
          </div>
        </div>

        <p className="text-[32px] font-extrabold leading-none tabular-nums text-brand-primary dark:text-sky-400">
          {vm.pvpDesc > 0 ? eur2(vm.pvpDesc) : '—'}
        </p>

        <dl className="divide-y divide-border/60 border-t border-border pt-1">
          {totalComissao > 0 && (
            <Linha rotulo="Comissão">
              <span className={`inline-block rounded-md border px-2 py-0.5 text-base font-extrabold ${
                comPremio
                  ? 'border-orange-400/70 bg-orange-500/15 text-orange-700 dark:text-orange-300'
                  : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'}`}>
                {eur0(totalComissao)}
              </span>
            </Linha>
          )}
          {comPremio && (
            <Linha rotulo="Prémio de venda">
              <span className="inline-flex items-center gap-1 text-orange-700 dark:text-orange-300">
                <Star className="h-3 w-3 fill-current" aria-hidden />+{eur0(vm.premio)}
              </span>
            </Linha>
          )}
          {vm.reservado && (
            <Linha rotulo="Reserva até">
              <span className="text-yellow-800 dark:text-yellow-300">{vm.reservaAte}{vm.reservaPor ? ` · ${vm.reservaPor}` : ''}</span>
            </Linha>
          )}
          <Linha rotulo="Desconto total">{desconto > 0 ? eur2(desconto) : '—'}</Linha>
          <Linha rotulo="PVP (novo)">{vm.pvp > 0 ? eur2(vm.pvp) : '—'}</Linha>
          <Linha rotulo="BSI incluído">{vm.bsiIncluido ? 'Sim' : 'Não'}</Linha>
        </dl>
      </div>

      {podeReservar && (
        <div className="border-t border-border px-4 py-2.5 pl-6">
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
