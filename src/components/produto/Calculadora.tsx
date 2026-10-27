import { useState } from 'react';
import { Map as MapIcon, Wallet, Zap } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { CALC_DEFAULTS, calcular, fmtNum, formatarTempo, type CalcInputs } from '@/lib/produto';

/* Calculadora de carregamento: tempo, custo de uma carga e custo de uma viagem. */

function Cartao({ icone: Icone, titulo, tom, children }: {
  icone: typeof Zap; titulo: string; tom: string; children: React.ReactNode;
}) {
  return (
    <section className="mb-4 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <header className={cn('flex items-center gap-2 px-5 py-3 text-white', tom)}>
        <Icone className="h-4 w-4" />
        <h2 className="text-xs font-black uppercase tracking-widest">{titulo}</h2>
      </header>
      <div className="space-y-4 p-5">{children}</div>
    </section>
  );
}

function Controlo({ label, valor, texto, min, max, step, onChange }: {
  label: string; valor: number; texto: string; min: number; max: number; step: number; onChange: (v: number) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
      <div className="flex items-center gap-3">
        <Slider aria-label={label} min={min} max={max} step={step} value={[valor]} onValueChange={v => onChange(v[0])} />
        <span className="w-16 text-right text-base font-black text-primary">{texto}</span>
      </div>
    </div>
  );
}

const Resultado = ({ label, valor, grande }: { label: string; valor: string; grande?: boolean }) => (
  <div className="rounded-xl border border-primary/20 bg-primary/10 px-4 py-3">
    <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
    <p className={cn('mt-1 font-black text-primary', grande ? 'text-3xl' : 'text-2xl')}>{valor}</p>
  </div>
);

export function Calculadora() {
  const [i, setI] = useState<CalcInputs>(CALC_DEFAULTS);
  const set = (k: keyof CalcInputs) => (v: number) => setI(s => ({ ...s, [k]: v }));
  const r = calcular(i);

  return (
    <div className="mx-auto max-w-3xl">
      <Cartao icone={Zap} titulo="Tempo de carregamento" tom="bg-gradient-to-r from-primary to-primary/70">
        <div className="grid gap-4 sm:grid-cols-2">
          <Controlo label="Capacidade da bateria (kWh)" valor={i.bateria} texto={fmtNum(i.bateria, 0)} min={10} max={120} step={1} onChange={set('bateria')} />
          <Controlo label="Potência de carga (kW)" valor={i.potencia} texto={fmtNum(i.potencia, 1)} min={1} max={350} step={0.5} onChange={set('potencia')} />
          <Controlo label="Estado inicial (%)" valor={i.socIni} texto={`${i.socIni}%`} min={0} max={95} step={5} onChange={set('socIni')} />
          <Controlo label="Estado final (%)" valor={i.socFin} texto={`${i.socFin}%`} min={5} max={100} step={5} onChange={set('socFin')} />
        </div>
        <div className="flex items-center justify-between rounded-xl border border-primary/20 bg-primary/10 px-5 py-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Tempo estimado</p>
            <p data-testid="calc-tempo" className="mt-1 text-3xl font-black text-primary">{r.valido ? formatarTempo(r.horas) : 'Inválido'}</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Energia a carregar</p>
            <p className="mt-1 text-xl font-black">{r.valido ? `${fmtNum(r.energia, 1)} kWh` : '—'}</p>
          </div>
        </div>
      </Cartao>

      <Cartao icone={Wallet} titulo="Custo de carregamento" tom="bg-gradient-to-r from-green-500 to-green-400">
        <div>
          <Controlo label="Preço por kWh (€)" valor={i.precoKwh} texto={`${fmtNum(i.precoKwh)} €`} min={0.05} max={0.6} step={0.01} onChange={set('precoKwh')} />
          <div className="mt-1 flex justify-between px-1 text-xs text-muted-foreground/60">
            <span>0,05 €</span><span>Casa (~0,15€)</span><span>Público (~0,40€)</span><span>0,60 €</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Resultado label="Custo total" valor={r.valido ? `${fmtNum(r.custoCarga)} €` : '—'} />
          <Resultado label="Custo / 100 km" valor={r.valido ? `${fmtNum(r.custoPor100km)} €` : '—'} />
        </div>
      </Cartao>

      <Cartao icone={MapIcon} titulo="Custo por viagem" tom="bg-gradient-to-r from-purple-500 to-purple-400">
        <div className="grid gap-4 sm:grid-cols-2">
          <Controlo label="Distância (km)" valor={i.km} texto={fmtNum(i.km, 0)} min={10} max={800} step={10} onChange={set('km')} />
          <Controlo label="Consumo (kWh/100 km)" valor={i.consumo} texto={fmtNum(i.consumo, 1)} min={10} max={40} step={0.5} onChange={set('consumo')} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Resultado label="Energia da viagem" valor={`${fmtNum(r.energiaViagem, 1)} kWh`} />
          <Resultado label="Custo da viagem" valor={`${fmtNum(r.custoViagem)} €`} />
        </div>
      </Cartao>
    </div>
  );
}
