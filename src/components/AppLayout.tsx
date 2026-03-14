import { Link, useLocation } from 'react-router-dom';
import { BarChart3, TrendingUp, Briefcase, AlertTriangle, Menu, X } from 'lucide-react';
import { ExcelUpload } from '@/components/ExcelUpload';
import { getCurrentWeek } from '@/lib/excel-parser';
import { useData } from '@/contexts/DataContext';
import { useState } from 'react';

const NAV_ITEMS = [
  { path: '/retails', label: 'RETAILS', icon: BarChart3 },
  { path: '/producao', label: 'PRODUÇÃO', icon: TrendingUp },
  { path: '/carteira', label: 'CARTEIRA', icon: Briefcase },
  { path: '/pendentes', label: 'PENDENTES', icon: AlertTriangle },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { error } = useData();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const week = getCurrentWeek();

  return (
    <div className="min-h-screen flex w-full bg-background">
      {/* Sidebar */}
      <aside
        className={`${sidebarOpen ? 'w-52' : 'w-0 overflow-hidden'} bg-bmw-navy flex-shrink-0 flex flex-col transition-all duration-200`}
      >
        <div className="px-4 py-5 border-b border-white/10">
          <h1 className="text-lg font-bold tracking-tight text-white">
            BAVIERA<span className="text-bmw-blue ml-1">CONTROL</span>
          </h1>
        </div>
        <nav className="flex-1 px-2 py-3 space-y-0.5">
          {NAV_ITEMS.map(item => {
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
        </nav>
        <div className="px-4 py-3 border-t border-white/10">
          <span className="text-[10px] text-white/40 uppercase tracking-wider">BMW Dealer Dashboard</span>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-11 border-b border-border bg-card flex items-center justify-between px-4 flex-shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-muted-foreground hover:text-foreground">
              {sidebarOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {NAV_ITEMS.find(n => n.path === location.pathname)?.label || 'Dashboard'}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <ExcelUpload />
            <div className="text-xs font-semibold text-primary bg-primary/10 px-2.5 py-1 rounded">
              Semana {week}
            </div>
          </div>
        </header>

        {error && (
          <div className="mx-4 mt-2 px-3 py-2 bg-destructive/10 text-destructive text-xs rounded border border-destructive/20">
            {error}
          </div>
        )}

        <main className="flex-1 overflow-auto p-4">
          {children}
        </main>
      </div>
    </div>
  );
}
