import { useState } from 'react';
import { Package } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DadosTecnicos } from '@/components/produto/DadosTecnicos';
import { Opcionais } from '@/components/produto/Opcionais';

/* ── Tab Produto (Transversal) ────────────────────────────────────────────────
 * Catálogo BMW de consulta (vindo da plataforma Caetano): Dados Técnicos
 * (comparação de motorizações) e Opcionais (por motorização). Só leitura: 'view'
 * chega. Cada vista monta na primeira visita e mantém o estado ao alternar.
 * ──────────────────────────────────────────────────────────────────────────── */

type Vista = 'dados' | 'opcionais';
const VISTAS: { key: Vista; label: string }[] = [
  { key: 'dados', label: 'Dados Técnicos' },
  { key: 'opcionais', label: 'Opcionais' },
];

export default function ProdutoPage() {
  const [vista, setVista] = useState<Vista>('dados');
  const [visitadas, setVisitadas] = useState<Set<Vista>>(new Set(['dados']));

  const escolher = (v: Vista) => { setVista(v); setVisitadas(s => new Set(s).add(v)); };

  return (
    <div className="mx-auto max-w-6xl space-y-5 animate-fade-in">
      <header className="flex items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-3 shadow-sm">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
          <Package className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-semibold leading-tight">Produto</h1>
          <p className="text-xs text-muted-foreground">Transversal · dados técnicos e opcionais</p>
        </div>
      </header>

      <div role="tablist" className="flex gap-6 border-b border-border">
        {VISTAS.map(v => (
          <button key={v.key} role="tab" aria-selected={vista === v.key} onClick={() => escolher(v.key)}
            className={cn('-mb-px whitespace-nowrap border-b-2 px-1 py-3 text-sm font-bold uppercase tracking-widest transition-colors',
              vista === v.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
            {v.label}
          </button>
        ))}
      </div>

      <div hidden={vista !== 'dados'}>{visitadas.has('dados') && <DadosTecnicos />}</div>
      <div hidden={vista !== 'opcionais'}>{visitadas.has('opcionais') && <Opcionais />}</div>
    </div>
  );
}
