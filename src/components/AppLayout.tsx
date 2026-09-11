import { Link, useLocation } from 'react-router-dom';
import { BarChart3, TrendingUp, Briefcase, Menu, X, Database, CalendarDays, Filter, LogOut, Calculator, Users, Droplets, UserCog, Archive, Settings, Target, Car, ClipboardList, Handshake, Warehouse, type LucideIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { getCurrentWeek } from '@/lib/excel-parser';
import { useData } from '@/contexts/DataContext';
import { usePermissions } from '@/contexts/PermissionsContext';
import { useProspec } from '@/contexts/ProspecContext';
import { AREAS, TABS, ARCHIVED_TAB_KEYS } from '@/lib/permissions';
import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useIsMobile } from '@/hooks/use-mobile';
import { seasonalFlags } from '@/lib/seasonal';
import { NotificationBell } from '@/components/NotificationBell';
import bmwLogo from '@/assets/bmw-logo.png';

/* Ícone por tab (a camada de dados em permissions.ts mantém-se sem deps de UI). */
const TAB_ICONS: Record<string, LucideIcon> = {
  retails: BarChart3,
  funil: Filter,
  producao: TrendingUp,
  carteira: Briefcase,
  'ficha-margem': Calculator,
  escala: CalendarDays,
  vendedores: Users,
  prospecao: Target,
  wip: ClipboardList,
  angariacao: Handshake,
  stock: Warehouse,
  lavagem: Droplets,
  retoma: Car,
  dados: Database,
  arquivo: Archive,
  utilizadores: UserCog,
};

/* Sempre disponível (área pessoal, fora da matriz de permissões). */
const SETTINGS_NAV_ITEM = { path: '/definicoes', label: 'DEFINIÇÕES', icon: Settings };

const ARCHIVED = new Set(ARCHIVED_TAB_KEYS);

export function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { error } = useData();
  const { canView } = usePermissions();
  const { overdue: prospecOverdue } = useProspec();
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);
  const week = getCurrentWeek();
  const season = seasonalFlags();

  // Navegação agrupada por área macro. Exclui os tabs arrumados no Arquivo e os
  // que o utilizador não pode ver; áreas sem tabs visíveis não são mostradas.
  const sections = AREAS
    .map(area => ({
      area,
      items: TABS.filter(t => t.area === area.key && !ARCHIVED.has(t.key) && canView(t.key)),
    }))
    .filter(s => s.items.length > 0);

  // Easter egg: clicar no logo várias vezes seguidas faz "vrum".
  const [vroom, setVroom] = useState(false);
  const logoClicks = useRef(0);
  const logoTimer = useRef<number | null>(null);
  const handleLogoClick = () => {
    logoClicks.current += 1;
    if (logoTimer.current) window.clearTimeout(logoTimer.current);
    logoTimer.current = window.setTimeout(() => { logoClicks.current = 0; }, 1200);
    if (logoClicks.current >= 7) {
      logoClicks.current = 0;
      setVroom(true);
      window.setTimeout(() => setVroom(false), 500);
      toast('🏁 Vrum vrum!', { description: 'Este dashboard tem cavalos a mais.' });
    }
  };

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
          {sections.map(({ area, items }) => {
            const isAdminArea = area.style === 'admin';
            return (
              <div key={area.key} className="pt-1 first:pt-0">
                <div className={`px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider ${
                  isAdminArea ? 'text-amber-400/60' : 'text-white/35'
                }`}>
                  {area.label}
                </div>
                {items.map(item => {
                  const active = location.pathname === item.path;
                  const Icon = TAB_ICONS[item.key];
                  const badge = item.key === 'prospecao' && prospecOverdue > 0 ? prospecOverdue : null;
                  const cls = isAdminArea
                    ? (active ? 'bg-amber-500 text-black' : 'text-amber-400/70 hover:text-amber-400 hover:bg-white/5')
                    : (active ? 'bg-bmw-blue text-white' : 'text-white/60 hover:text-white hover:bg-white/5');
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded text-sm font-medium transition-colors ${cls}`}
                    >
                      {Icon && <Icon className="h-4 w-4" />}
                      {item.label.toUpperCase()}
                      {badge !== null && (
                        <span className="ml-auto rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold px-1.5 py-0.5 leading-none" title={`${badge} em atraso`}>
                          {badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            );
          })}

          {/* Definições — sempre visível (área pessoal). */}
          <div className="pt-2 mt-2 border-t border-white/10">
            <Link
              to={SETTINGS_NAV_ITEM.path}
              className={`flex items-center gap-2.5 px-3 py-2 rounded text-sm font-medium transition-colors ${
                location.pathname === SETTINGS_NAV_ITEM.path
                  ? 'bg-bmw-blue text-white'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              <SETTINGS_NAV_ITEM.icon className="h-4 w-4" />
              {SETTINGS_NAV_ITEM.label}
            </Link>
          </div>
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
            <button onClick={handleLogoClick} className="relative flex-shrink-0" title="BMW" aria-label="BMW">
              <img src={bmwLogo} alt="BMW" className={`h-8 w-8 dark:rounded-full dark:bg-white dark:p-0.5 ${vroom ? 'animate-vroom' : ''}`} />
              {season.xmas && (
                <span className="absolute -top-2 -right-1 text-[13px] leading-none select-none" aria-hidden>🎅</span>
              )}
            </button>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {(location.pathname === SETTINGS_NAV_ITEM.path ? SETTINGS_NAV_ITEM.label : null)
                || TABS.find(t => t.path === location.pathname)?.label
                || 'Dashboard'}
            </span>
          </div>
<div className="flex items-center gap-2.5">
            <NotificationBell />
            <div className="text-[10px] sm:text-xs font-semibold text-primary bg-primary/10 px-2 py-1 rounded">
              Semana {week}{season.fridayPM && <span className="hidden sm:inline"> · Bom fim de semana 🎉</span>}
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
