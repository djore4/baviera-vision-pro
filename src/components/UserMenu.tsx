import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from 'next-themes';
import { ChevronRight, Check, Download, Lightbulb, LogOut, Monitor, Moon, Settings, Sun } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/App';
import { usePermissions } from '@/contexts/PermissionsContext';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { InstallDialog } from '@/components/InstallDialog';
import { SugestaoDialog } from '@/components/SugestaoDialog';
import { instalar, modoInstalar, subscrever } from '@/lib/install-prompt';
import { cn } from '@/lib/utils';

const initialsOf = (base: string) => {
  const parts = base.trim().split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
};

const THEME_OPTIONS = [
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'dark', label: 'Escuro', icon: Moon },
  { value: 'system', label: 'Sistema', icon: Monitor },
] as const;

const SECTION = 'px-4 py-3';
const SECTION_TITLE = 'mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground';
const ROW = 'flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm outline-none transition-colors hover:bg-muted focus-visible:bg-muted';

/* Menu do utilizador (canto superior direito): janela suspensa com as opções rápidas —
 * identidade, aparência (tema), instalar a app, Definições, sugestões e terminar sessão.
 * Mostra sempre a identidade REAL de quem tem a sessão, mesmo em "ver como". */
export function UserMenu() {
  const { session } = useAuth();
  const { me, viewingAs, realIsAdmin, roleName } = usePermissions();
  const { theme, setTheme } = useTheme();
  const [aberto, setAberto] = useState(false);
  const [instalarAberto, setInstalarAberto] = useState(false);
  const [sugestaoAberta, setSugestaoAberta] = useState(false);
  const [, forcar] = useState(0);
  useEffect(() => subscrever(() => forcar(n => n + 1)), []);

  const email = session?.user.email ?? '';
  const nome = viewingAs ? null : me?.nome ?? null;
  const funcao = realIsAdmin ? 'Administrador' : roleName;
  const modo = modoInstalar();
  const temaAtual = theme ?? 'system';

  const instalarApp = () => {
    setAberto(false);
    // Com o evento do browser abre-se o diálogo nativo; sem ele, as instruções.
    if (modo === 'nativo') void instalar();
    else setInstalarAberto(true);
  };

  return (
    <>
      <Popover open={aberto} onOpenChange={setAberto}>
        <PopoverTrigger asChild>
          <button
            type="button" aria-label="Menu do utilizador"
            className="grid h-8 w-8 place-items-center rounded-full bg-primary/10 text-[11px] font-bold text-primary outline-none transition-colors hover:bg-primary/20 focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-primary/20"
          >
            {initialsOf(nome || email || '?')}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" sideOffset={8} className="w-[min(20rem,calc(100vw-1.5rem))] rounded-2xl p-0">
          {/* Identidade */}
          <div className={cn(SECTION, 'flex items-center gap-3')}>
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-bold text-primary">
              {initialsOf(nome || email || '?')}
            </span>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{nome || email || '—'}</div>
              {nome && <div className="truncate text-xs text-muted-foreground">{email}</div>}
              {funcao && <div className="mt-0.5 text-[11px] text-muted-foreground">{funcao}</div>}
            </div>
          </div>

          {/* Aparência */}
          <div className={cn(SECTION, 'border-t border-border')}>
            <div className={SECTION_TITLE}>Aparência</div>
            <div role="radiogroup" aria-label="Tema" className="grid grid-cols-3 gap-1 rounded-xl border border-border bg-muted/50 p-1">
              {THEME_OPTIONS.map(opt => {
                const ativo = temaAtual === opt.value;
                return (
                  <button
                    key={opt.value} type="button" role="radio" aria-checked={ativo}
                    onClick={() => setTheme(opt.value)}
                    className={cn(
                      'flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                      ativo ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <opt.icon className="h-3.5 w-3.5" /> {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Aplicação */}
          <div className={cn(SECTION, 'border-t border-border')}>
            <div className={SECTION_TITLE}>Aplicação</div>
            {modo === 'instalada' ? (
              <>
                <div
                  aria-disabled="true"
                  className="flex items-center justify-center gap-2 rounded-xl bg-primary/15 py-2.5 text-sm font-semibold text-primary"
                >
                  <Check className="h-4 w-4" /> App instalada
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Estás a usar a app instalada.</p>
              </>
            ) : (
              <button
                type="button" onClick={instalarApp}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <Download className="h-4 w-4" /> Instalar a app
              </button>
            )}
          </div>

          {/* Atalhos */}
          <div className="space-y-0.5 border-t border-border p-2">
            <Link to="/definicoes" onClick={() => setAberto(false)} className={ROW}>
              <Settings className="h-4 w-4 text-muted-foreground" />
              <span className="flex-1">Definições</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Link>
            <button type="button" onClick={() => { setAberto(false); setSugestaoAberta(true); }} className={ROW}>
              <Lightbulb className="h-4 w-4 text-muted-foreground" />
              <span className="flex-1">Sugerir melhoria</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
            <button
              type="button" onClick={() => { void supabase.auth.signOut(); }}
              className={cn(ROW, 'text-destructive hover:bg-destructive/10 focus-visible:bg-destructive/10')}
            >
              <LogOut className="h-4 w-4" /> Terminar sessão
            </button>
          </div>
        </PopoverContent>
      </Popover>

      <InstallDialog open={instalarAberto} onOpenChange={setInstalarAberto} />
      <SugestaoDialog open={sugestaoAberta} onOpenChange={setSugestaoAberta} />
    </>
  );
}
