import { useState } from 'react';
import { cn } from '@/lib/utils';
import { DadosTecnicos } from '@/components/produto/DadosTecnicos';
import { Opcionais } from '@/components/produto/Opcionais';
import { Comparador } from '@/components/produto/Comparador';
import { Calculadora } from '@/components/produto/Calculadora';

/* ── Tab Produto (Transversal) ────────────────────────────────────────────────
 * Catálogo BMW de consulta (vindo da plataforma Caetano): Dados Técnicos
 * (comparação de motorizações), Opcionais (por motorização), Comparador (entre
 * modelos) e Calculadora de carregamento. Só leitura: 'view'
 * chega. Cada vista monta na primeira visita e mantém o estado ao alternar.
 * ──────────────────────────────────────────────────────────────────────────── */

type Vista = 'dados' | 'opcionais' | 'comparador' | 'calculadora';
const VISTAS: { key: Vista; label: string }[] = [
  { key: 'dados', label: 'Dados Técnicos' },
  { key: 'opcionais', label: 'Opcionais' },
  { key: 'comparador', label: 'Comparador' },
  { key: 'calculadora', label: 'Calculadora' },
];

export default function ProdutoPage() {
  const [vista, setVista] = useState<Vista>('dados');
  const [visitadas, setVisitadas] = useState<Set<Vista>>(new Set(['dados']));

  const escolher = (v: Vista) => { setVista(v); setVisitadas(s => new Set(s).add(v)); };

  return (
    <div className="mx-auto max-w-6xl space-y-5 animate-fade-in">
      <div role="tablist" className="no-scrollbar flex gap-6 overflow-x-auto border-b border-border">
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
      <div hidden={vista !== 'comparador'}>{visitadas.has('comparador') && <Comparador />}</div>
      <div hidden={vista !== 'calculadora'}>{visitadas.has('calculadora') && <Calculadora />}</div>
    </div>
  );
}
