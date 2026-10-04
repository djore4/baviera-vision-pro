import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/App';
import {
  listRoles, listUsers, isPlatformAdmin, getMyAccessExceptions, getAppCapabilities, NO_CAPABILITIES, TABS, ADMIN_ONLY_TAB_KEYS,
  type AccessLevel, type AppCapabilities, type AppRole, type AppUser,
} from '@/lib/permissions';
import { client } from '@/clients';

/* Tabs restritos a administradores (fora da matriz de funções). */
const ADMIN_ONLY_TABS = new Set(ADMIN_ONLY_TAB_KEYS);

/* Tabs que não existem nesta instalação (configuração do cliente). */
const DISABLED_TABS = new Set(client.disabledTabs);

interface PermissionsValue {
  loading: boolean;
  isAdmin: boolean;
  managed: boolean;              // o email consta da tabela utilizadores
  roleName: string | null;
  me: AppUser | null;
  /** Capacidades da base de dados (migrações já aplicadas). */
  capabilities: AppCapabilities;
  access: (tab: string) => AccessLevel;
  canView: (tab: string) => boolean;
  canEdit: (tab: string) => boolean;
  reload: () => void;
}

const PermissionsContext = createContext<PermissionsValue>({
  loading: true, isAdmin: false, managed: false, roleName: null, me: null,
  capabilities: NO_CAPABILITIES,
  access: () => 'none', canView: () => false, canEdit: () => false, reload: () => {},
});

export const usePermissions = () => useContext(PermissionsContext);

export function PermissionsProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const email = session?.user.email?.toLowerCase() ?? null;

  const [roles, setRoles] = useState<AppRole[] | null>(null);
  const [me, setMe] = useState<AppUser | null | undefined>(undefined);
  const [platformAdmin, setPlatformAdmin] = useState(false);
  // Exceções pontuais de acesso, fora da matriz de funções (tabela
  // app_access_exceptions). Usar com parcimónia — a via normal é a matriz.
  const [exceptions, setExceptions] = useState<Record<string, AccessLevel>>({});
  const [capabilities, setCapabilities] = useState<AppCapabilities>(NO_CAPABILITIES);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [rs, us, pa, ex, caps] = await Promise.all([
          listRoles(), listUsers(), isPlatformAdmin().catch(() => false),
          getMyAccessExceptions(email).catch(() => ({} as Record<string, AccessLevel>)),
          getAppCapabilities().catch((): AppCapabilities => ({ ...NO_CAPABILITIES })),
        ]);
        if (!alive) return;
        setPlatformAdmin(pa);
        setExceptions(ex);
        setCapabilities(caps);
        setRoles(rs);
        setMe(us.find(u => (u.email ?? '').toLowerCase() === email) ?? null);
      } catch (e) {
        if (!alive) return;
        // Em caso de falha, não bloquear o utilizador (fallback legado).
        console.error(e);
        setRoles([]);
        setMe(null);
      }
    })();
    return () => { alive = false; };
  }, [email, tick]);

  const value = useMemo<PermissionsValue>(() => {
    const loading = roles === null || me === undefined;
    const role = me?.perfil ? roles?.find(r => r.name === me.perfil) ?? null : null;
    const isAdmin = platformAdmin || !!role?.is_admin;
    const managed = !!me;

    const access = (tab: string): AccessLevel => {
      if (DISABLED_TABS.has(tab)) return 'none';
      if (isAdmin) return 'edit';
      // Tabs restritos a admin não são acessíveis a mais ninguém, mesmo que a
      // função os inclua na matriz (bloqueio "para já", ver TabDef.adminOnly).
      if (ADMIN_ONLY_TABS.has(tab)) return 'none';
      // Exceção pontual por email (tem precedência sobre a função, mas não sobre
      // o acesso total de admin). Só eleva o acesso, nunca o reduz.
      const exception = exceptions[tab];
      const roleAccess = role ? ((role.permissions?.[tab] as AccessLevel) ?? 'none') : 'none';
      if (exception) {
        const rank: Record<AccessLevel, number> = { none: 0, view: 1, edit: 2 };
        return rank[exception] >= rank[roleAccess] ? exception : roleAccess;
      }
      if (role) return roleAccess;
      // Sem perfil nesta plataforma → sem acesso (tem de ser adicionado por um
      // admin no tab Utilizadores). Impede o acesso de contas de outras
      // plataformas que partilham a autenticação.
      return 'none';
    };

    return {
      loading, isAdmin, managed,
      roleName: role?.name ?? me?.perfil ?? null,
      me: me ?? null,
      capabilities,
      access,
      canView: (t) => access(t) !== 'none',
      canEdit: (t) => access(t) === 'edit',
      reload,
    };
  }, [roles, me, platformAdmin, exceptions, capabilities, reload]);

  if (value.loading) return null;

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}

/* Guarda de rota: exige, pelo menos, acesso de consulta ao tab.
 * Se não houver acesso, encaminha para o primeiro tab acessível. */
export function RequireTab({ tab, children }: { tab: string; children: React.ReactNode }) {
  const { canView } = usePermissions();
  if (canView(tab)) return <>{children}</>;

  const target = TABS.find(t => canView(t.key));
  if (!target) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div className="max-w-sm space-y-2">
          <h1 className="text-lg font-semibold">Sem acesso</h1>
          <p className="text-sm text-muted-foreground">
            O seu perfil não tem acesso a nenhuma área. Contacte um administrador.
          </p>
        </div>
      </div>
    );
  }
  return <Navigate to={target.path} replace />;
}
