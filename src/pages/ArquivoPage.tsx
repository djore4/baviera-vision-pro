import { Link } from 'react-router-dom';
import { Archive, CalendarClock, Coins, Database, Car, Target, Fuel, AlertTriangle, ChevronRight } from 'lucide-react';
import { usePermissions } from '@/contexts/PermissionsContext';
import { Card } from '@/components/ui/card';

/* ── Tab Arquivo (admin) ──────────────────────────────────────────────────────
 * Agrupa as áreas que ficam "arrumadas" fora da barra lateral principal.
 * Cada cartão liga ao tab respetivo; só aparecem os que o utilizador pode ver.
 * ──────────────────────────────────────────────────────────────────────────── */

const ARCHIVED = [
  { key: 'pendentes', label: 'Pendentes', path: '/pendentes', icon: AlertTriangle, desc: 'Negócios pendentes de faturação' },
  { key: 'escala-repsol', label: 'Escala Repsol', path: '/escala-repsol', icon: Fuel, desc: 'Escala do posto Repsol' },
  { key: 'emprestimos', label: 'Empréstimos', path: '/emprestimos', icon: CalendarClock, desc: 'Empréstimos de viaturas demo' },
  { key: 'multas', label: 'Multas', path: '/multas', icon: Coins, desc: 'Infrações e penalizações' },
  { key: 'database', label: 'Database', path: '/database', icon: Database, desc: 'Base de dados / registos' },
  { key: 'demos', label: 'Demos', path: '/demos', icon: Car, desc: 'Viaturas de demonstração' },
  { key: 'objetivos', label: 'Objetivos', path: '/objetivos', icon: Target, desc: 'Objetivos e orçamentos' },
];

export default function ArquivoPage() {
  const { canView } = usePermissions();
  const items = ARCHIVED.filter(i => canView(i.key));

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Archive className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-bold tracking-tight">Arquivo</h1>
        <span className="text-xs text-muted-foreground">· Áreas arrumadas</span>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Não há áreas disponíveis no arquivo.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map(i => (
            <Link key={i.key} to={i.path} className="block">
              <Card className="h-full p-4 flex items-center gap-3 hover:border-primary/60 hover:shadow-sm transition-colors">
                <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <i.icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-sm">{i.label}</div>
                  <div className="text-xs text-muted-foreground truncate">{i.desc}</div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
