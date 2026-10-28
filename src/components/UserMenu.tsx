import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Download, LogOut, Settings } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/App';
import { usePermissions } from '@/contexts/PermissionsContext';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { InstallDialog } from '@/components/InstallDialog';
import { instalar, modoInstalar, subscrever } from '@/lib/install-prompt';

const initialsOf = (base: string) => {
  const parts = base.trim().split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
};

/* Menu do utilizador (canto superior direito): perfil, Definições, instalar a app e
 * terminar sessão. Mostra sempre a identidade REAL de quem tem a sessão, mesmo em
 * "ver como". */
export function UserMenu() {
  const { session } = useAuth();
  const { me, viewingAs, realIsAdmin, roleName } = usePermissions();
  const [instalarAberto, setInstalarAberto] = useState(false);
  const [, forcar] = useState(0);
  useEffect(() => subscrever(() => forcar(n => n + 1)), []);

  const email = session?.user.email ?? '';
  const nome = viewingAs ? null : me?.nome ?? null;
  const funcao = realIsAdmin ? 'Administrador' : roleName;
  const modo = modoInstalar();

  const instalarApp = () => {
    // Com o evento do browser abre-se o diálogo nativo; sem ele, as instruções.
    if (modo === 'nativo') void instalar();
    else setInstalarAberto(true);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button" aria-label="Menu do utilizador"
            className="grid h-8 w-8 place-items-center rounded-full bg-primary/10 text-[11px] font-bold text-primary outline-none transition-colors hover:bg-primary/20 focus-visible:ring-2 focus-visible:ring-ring"
          >
            {initialsOf(nome || email || '?')}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel className="font-normal">
            <div className="truncate text-sm font-semibold">{nome || email || '—'}</div>
            {nome && <div className="truncate text-xs text-muted-foreground">{email}</div>}
            {funcao && <div className="mt-0.5 text-[11px] text-muted-foreground">{funcao}</div>}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link to="/definicoes" className="cursor-pointer"><Settings className="mr-2 h-4 w-4" /> Definições</Link>
          </DropdownMenuItem>
          {modo === 'instalada' ? (
            <DropdownMenuItem disabled><Check className="mr-2 h-4 w-4" /> App instalada</DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={instalarApp} className="cursor-pointer">
              <Download className="mr-2 h-4 w-4" /> Instalar a app
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => { void supabase.auth.signOut(); }} className="cursor-pointer text-destructive focus:text-destructive">
            <LogOut className="mr-2 h-4 w-4" /> Terminar sessão
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <InstallDialog open={instalarAberto} onOpenChange={setInstalarAberto} />
    </>
  );
}
