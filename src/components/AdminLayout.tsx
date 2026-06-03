import { Link, useLocation } from 'react-router-dom';
import { Database, Car, Target, LogOut, Menu, X, ChevronLeft } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useState, useEffect } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import bmwLogo from '@/assets/bmw-logo.png';

const ADMIN_NAV = [
  { path: '/admin/database', label: 'DATABASE', icon: Database },
  { path: '/admin/demos', label: 'DEMOS', icon: Car },
  { path: '/admin/objetivos', label: 'OBJETIVOS', icon: Target },
];

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);

  useEffect(() => {
    if (isMobile) setSidebarOpen(false);
  }, [location.pathname, isMobile]);

  useEffect(() => {
    setSidebarOpen(!isMobile);
  }, [isMobile]);

  const currentLabel = ADMIN_NAV.find(n => n.path === location.pathname)?.label || 'ADMIN';

  return (
    <div className="min-h-screen flex w-full bg-background">
      {isMobile && sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setSidebarOpen(false)} />
      )}

      <aside
        className={`
          ${isMobile ? 'fixed inset-y-0 left-0 z-50' : 'relative'}
          ${sidebarOpen ? 'w-52' : 'w-0 overflow-hidden'}
          bg-zinc-900 flex-shrink-0 flex flex-col transition-all duration-200
        `}
      >
        <div className="px-4 py-5 border-b border-white/10 flex items-center justify-between">
          <div>
            <h1 className="text-sm font-bold tracking-tight text-white whitespace-nowrap">
              Caetano<span className="text-amber-400 ml-1">ADMIN</span>
            </h1>
            <p className="text-[10px] text-white/40 mt-0.5">Área restrita</p>
          </div>
          {isMobile && (
            <button onClick={() => setSidebarOpen(false)} className="text-white/60 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <nav className="flex-1 px-2 py-3 space-y-0.5">
          {ADMIN_NAV.map(item => {
            const active = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-2.5 px-3 py-2 rounded text-sm font-medium transition-colors ${
                  active
                    ? 'bg-amber-500 text-black'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="px-2 py-3 border-t border-white/10 space-y-0.5">
          <Link
            to="/retails"
            className="flex items-center gap-2.5 px-3 py-2 rounded text-sm font-medium text-white/40 hover:text-white hover:bg-white/5 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            Voltar ao dashboard
          </Link>
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
              {currentLabel}
            </span>
            <span className="text-[10px] bg-amber-500/20 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded font-semibold">
              ADMIN
            </span>
          </div>
          <button onClick={() => supabase.auth.signOut()} className="text-muted-foreground hover:text-foreground">
            <LogOut className="h-4 w-4" />
          </button>
        </header>

        <main className="flex-1 overflow-auto p-2 sm:p-4">
          {children}
        </main>
      </div>
    </div>
  );
}
