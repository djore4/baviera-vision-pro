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
import { locaisDoGrupo, locaisDoPerfil } from '@/lib/locations';
import { cn } from '@/lib/utils';
import { nomeCurto } from '@/lib/nome';

const initialsOf = (base: string) => {
  const parts = base.trim().split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
};

const THEME_OPTIONS = [
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'dark', label: 'Escuro', icon: Moon },
  { value: 'system', label: 'Sistema', icon: Monitor },
] as const;

/* Valor jsonb de app_users (array, texto ou nulo) → lista de textos. */
const listaDe = (v: unknown): string[] =>
  (Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[,;]/) : [])
    .map(x => (typeof x === 'string' ? x.trim() : ''))
    .filter(Boolean);

/* Acesso por tipo de viatura: só há VN (novos; guardado como VD nalgumas contas) e VU. */
const acessoDe = (v: unknown): string[] => {
  const tipos = listaDe(v).map(t => t.toUpperCase()).map(t => (t === 'VD' ? 'VN' : t));
  return ['VN', 'VU'].filter(t => tipos.includes(t) || tipos.includes('TODAS'));
};

const temTodas = (v: unknown) => listaDe(v).some(x => x.toLowerCase() === 'todas');

function PerfilLinha({ label, itens, destaque }: { label: string; itens: string[]; destaque?: boolean }) {
  if (itens.length === 0) return null;
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 pt-0.5 text-xs text-muted-foreground">{label}</span>
      <div className="flex flex-wrap justify-end gap-1">
        {itens.map(i => (
          <span
            key={i}
            className={cn(
              'rounded-md border px-2 py-0.5 text-[11px] font-semibold',
              destaque ? 'border-primary bg-primary text-primary-foreground' : 'border-primary/30 bg-primary/10 text-primary',
            )}
          >
            {i}
          </span>
        ))}
      </div>
    </div>
  );
}

const SECTION = 'px-4 py-3';
const SECTION_TITLE = 'mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground';
const ROW = 'flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm outline-none transition-colors hover:bg-muted focus-visible:bg-muted';

/* Menu do utilizador (canto superior direito): janela suspensa com as opções rápidas —
 * identidade, aparência (tema), instalar a app, Definições, sugestões e terminar sessão.
 * Mostra sempre a identidade REAL de quem tem a sessão, mesmo em "ver como". */
export function UserMenu() {
  const { session } = useAuth();
  const { me, realMe, viewingAs, realIsAdmin, roleName } = usePermissions();
  const { theme, setTheme } = useTheme();
  const [aberto, setAberto] = useState(false);
  const [instalarAberto, setInstalarAberto] = useState(false);
  const [sugestaoAberta, setSugestaoAberta] = useState(false);
  const [, forcar] = useState(0);
  useEffect(() => subscrever(() => forcar(n => n + 1)), []);

  const email = session?.user.email ?? '';
  const nome = viewingAs ? null : nomeCurto(me?.nome, email) || null;
  const funcao = realIsAdmin ? 'Administrador' : roleName;
  // Perfil de acesso: sempre o de quem tem a sessão, mesmo em "ver como".
  // O administrador (ou quem tem "Todas") tem acesso a tudo, como na Sales Force.
  const perfilLocais = realIsAdmin || temTodas(realMe?.local) ? locaisDoGrupo() : locaisDoPerfil(realMe?.local);
  const perfilNegocio = realIsAdmin ? ['VN', 'VU'] : acessoDe(realMe?.negocio);
  const perfilMarca = listaDe(realMe?.marca);
  const temPerfil = !!funcao || perfilLocais.length + perfilNegocio.length + perfilMarca.length > 0;
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
            </div>
          </div>

          {/* Perfil de acesso */}
          {temPerfil && (
            <div className={cn(SECTION, 'space-y-2 border-t border-border')}>
              <div className={SECTION_TITLE}>Perfil de acesso</div>
              <PerfilLinha label="Perfil" itens={funcao ? [funcao] : []} destaque />
              <PerfilLinha label="Concessões" itens={perfilLocais} />
              <PerfilLinha label="Acesso" itens={perfilNegocio} />
              <PerfilLinha label="Marca" itens={perfilMarca} />
            </div>
          )}

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
