import { Link, useLocation } from 'react-router-dom';
import { BarChart3, TrendingUp, Briefcase, AlertTriangle, Menu, X, Database, CalendarDays, Filter, LogOut, Coins, Car, Target, Calculator, CalendarClock, Users, HeartHandshake, Droplets, UserCog } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { getCurrentWeek } from '@/lib/excel-parser';
import { useData } from '@/contexts/DataContext';
import { usePermissions } from '@/contexts/PermissionsContext';
import { useState, useEffect } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import bmwLogo from '@/assets/bmw-logo.png';

const NAV_ITEMS = [
  { path: '/retails', label: 'RETAILS', icon: BarChart3 },
  { path: '/funil', label: 'FUNIL', icon: Filter },
  { path: '/producao', label: 'PRODUÇÃO', icon: TrendingUp },
  { path: '/carteira', label: 'CARTEIRA', icon: Briefcase },
  { path: '/pendentes', label: 'PENDENTES', icon: AlertTriangle },
  { path: '/ficha-margem', label: 'FICHA MARGEM', icon: Calculator },
  { path: '/escala', label: 'ESCALA', icon: CalendarDays },
  { path: '/emprestimos', label: 'EMPRÉSTIMOS', icon: CalendarClock },
];

const ADMIN_NAV_ITEMS = [
  { path: '/vendedores', label: 'PERFORMANCE', icon: Users },
  { path: '/fidelizacao', label: 'FIDELIZAÇÃO', icon: HeartHandshake },
  { path: '/lavagem', label: 'LAVAGEM', icon: Droplets },
  { path: '/multas', label: 'MULTAS', icon: Coins },
  { path: '/dados', label: 'DADOS', icon: Database },
  { path: '/database', label: 'DATABASE', icon: Database },
  { path: '/demos', label: 'DEMOS', icon: Car },
  { path: '/objetivos', label: 'OBJETIVOS', icon: Target },
  { path: '/utilizadores', label: 'UTILIZADORES', icon: UserCog },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { error } = useData();
  const { canView } = usePermissions();
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);
  const week = getCurrentWeek();

  const navItems = NAV_ITEMS.filter(item => canView(item.path.slice(1)));
  const adminNavItems = ADMIN_NAV_ITEMS.filter(item => canView(item.path.slice(1)));

  useEffect(() => {
    if (isMobile) setSidebarOpen(false);
  }, [location.pathname, isMobile]);

  useEffect(() => {
    setSidebarOpen(!isMobile);
  }, [isMobile]);

  return (
    <div className="min-h-screen flex w-full bg-background">
      {isMobile && sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setSidebarOpen(false)} />
      )}

      <aside
        className={`
          ${isMobile ? 'fixed inset-y-0 left-0 z-50' : 'relative'}
          ${sidebarOpen ? 'w-52' : 'w-0 overflow-hidden'}
          bg-bmw-navy flex-shrink-0 flex flex-col transition-all duration-200
        `}
      >
        <div className="px-4 py-5 border-b border-white/10 flex items-center justify-between">
          <h1 className="text-lg font-bold tracking-tight text-white whitespace-nowrap">
            Caetano<span className="text-bmw-blue ml-1">BMW</span>
          </h1>
          {isMobile && (
            <button onClick={() => setSidebarOpen(false)} className="text-white/60 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <nav className="flex-1 px-2 py-3 space-y-0.5">
          {navItems.map(item => {
            const active = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-2.5 px-3 py-2 rounded text-sm font-medium transition-colors ${
                  active
                    ? 'bg-bmw-blue text-white'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
          {adminNavItems.map(item => {
            const active = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-2.5 px-3 py-2 rounded text-sm font-medium transition-colors ${
                  active
                    ? 'bg-amber-500 text-black'
                    : 'text-amber-400/70 hover:text-amber-400 hover:bg-white/5'
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="px-4 py-3 border-t border-white/10">
          <span className="text-[10px] text-white/40 uppercase tracking-wider">BMW Dealer Dashboard</span>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-11 border-b border-border bg-card flex items-center justify-between px-3 sm:px-4 flex-shrink-0">
          <div className="flex items-center gap-2 sm:gap-3">
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-muted-foreground hover:text-foreground">
              {sidebarOpen && !isMobile ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
            <img src={bmwLogo} alt="BMW" className="h-8 w-8" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {[...NAV_ITEMS, ...ADMIN_NAV_ITEMS].find(n => n.path === location.pathname)?.label || 'Dashboard'}
            </span>
          </div>
<div className="flex items-center gap-2">
            <div className="text-[10px] sm:text-xs font-semibold text-primary bg-primary/10 px-2 py-1 rounded">
              Semana {week}
            </div>
            <button onClick={() => supabase.auth.signOut()} className="text-muted-foreground hover:text-foreground">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </header>

        {error && (
          <div className="mx-3 sm:mx-4 mt-2 px-3 py-2 bg-destructive/10 text-destructive text-xs rounded border border-destructive/20">
            {error}
          </div>
        )}

        <main className="flex-1 overflow-auto p-2 sm:p-4">
          {children}
        </main>
      </div>
    </div>
  );
}
