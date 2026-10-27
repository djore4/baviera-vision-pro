import { useState } from 'react';
import { BatteryCharging, Gauge, GitCompareArrows, ListChecks, type LucideIcon } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DadosTecnicos } from '@/components/produto/DadosTecnicos';
import { Opcionais } from '@/components/produto/Opcionais';
import { Comparador } from '@/components/produto/Comparador';
import { Calculadora } from '@/components/produto/Calculadora';

/* ── Tab Produto (Transversal) ────────────────────────────────────────────────
 * Catálogo BMW de consulta (vindo da plataforma Caetano): Dados Técnicos
 * (comparação de motorizações), Opcionais (por motorização), Comparador (entre
 * modelos) e Calculadora de carregamento. Só leitura: 'view' chega.
 * As vistas escolhem-se no controlo segmentado do topo (mesmo padrão do
 * End-of-Term); cada uma monta na primeira visita e mantém o estado ao alternar.
 * ──────────────────────────────────────────────────────────────────────────── */

type Vista = 'dados' | 'opcionais' | 'comparador' | 'calculadora';
const VISTAS: { key: Vista; label: string; curto: string; icon: LucideIcon }[] = [
  { key: 'dados', label: 'Dados Técnicos', curto: 'Dados', icon: Gauge },
  { key: 'opcionais', label: 'Opcionais', curto: 'Opcionais', icon: ListChecks },
  { key: 'comparador', label: 'Comparador', curto: 'Comparar', icon: GitCompareArrows },
  { key: 'calculadora', label: 'Calculadora', curto: 'Calcular', icon: BatteryCharging },
];

const PAINEL: Record<Vista, () => JSX.Element> = {
  dados: DadosTecnicos,
  opcionais: Opcionais,
  comparador: Comparador,
  calculadora: Calculadora,
};

export default function ProdutoPage() {
  const [vista, setVista] = useState<Vista>('dados');
  const [visitadas, setVisitadas] = useState<Set<Vista>>(new Set(['dados']));

  const escolher = (v: string) => {
    setVista(v as Vista);
    setVisitadas(s => new Set(s).add(v as Vista));
  };

  return (
    <Tabs value={vista} onValueChange={escolher} className="mx-auto max-w-6xl animate-fade-in">
      {/* Telemóvel: 4 colunas iguais, ícone por cima do nome (cabem todas, sem scroll).
          Ecrã largo: pílula compacta com ícone ao lado do nome. */}
      <TabsList className="grid h-auto w-full grid-cols-4 gap-1 bg-muted/60 p-1 sm:inline-flex sm:w-auto">
        {VISTAS.map(({ key, label, curto, icon: Icon }) => (
          <TabsTrigger
            key={key}
            value={key}
            aria-label={label}
            className="flex-col gap-0.5 px-1 py-2 text-[11px] leading-tight data-[state=active]:shadow-sm sm:flex-row sm:gap-1.5 sm:px-4 sm:py-1.5 sm:text-sm"
          >
            <Icon className="h-5 w-5 sm:h-4 sm:w-4" />
            <span className="sm:hidden">{curto}</span>
            <span className="hidden sm:inline">{label}</span>
          </TabsTrigger>
        ))}
      </TabsList>

      {VISTAS.map(({ key }) => {
        const Painel = PAINEL[key];
        return (
          <TabsContent key={key} value={key} forceMount className="mt-4 data-[state=inactive]:hidden">
            {visitadas.has(key) && <Painel />}
          </TabsContent>
        );
      })}
    </Tabs>
  );
}
