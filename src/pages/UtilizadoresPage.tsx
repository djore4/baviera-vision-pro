import { useState, useEffect, useCallback, useMemo } from 'react';
import { Users as UsersIcon, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { usePermissions } from '@/contexts/PermissionsContext';
import { type AppRole, type AppUser, listRoles, listUsers } from '@/lib/permissions';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { UsersPanel } from '@/components/users/UsersPanel';
import { RolesPanel } from '@/components/users/RolesPanel';

/* ── Tab Utilizadores (admin) ─────────────────────────────────────────────────
 * Duas vistas: Contas (procurar, filtrar por função, criar, repor password,
 * eliminar) e Permissões (por função, agrupadas por área, com edição em bloco).
 * ──────────────────────────────────────────────────────────────────────────── */

export default function UtilizadoresPage() {
  const { reload: reloadPerms } = usePermissions();

  const [users, setUsers] = useState<AppUser[]>([]);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [us, rs] = await Promise.all([listUsers(), listRoles()]);
      setUsers(us);
      setRoles(rs);
    } catch (e) {
      toast.error('Não foi possível carregar os utilizadores.');
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const roleNames = useMemo(() => roles.map(r => r.name), [roles]);

  return (
    <div className="max-w-6xl mx-auto">
      <Tabs defaultValue="contas">
        <TabsList className="h-10 p-1 bg-muted/60 w-full sm:w-auto">
          <TabsTrigger value="contas" className="flex-1 sm:flex-none gap-1.5 data-[state=active]:shadow-sm">
            <UsersIcon className="h-4 w-4" />Contas
            <span className="text-xs font-normal text-muted-foreground">{users.length}</span>
          </TabsTrigger>
          <TabsTrigger value="permissoes" className="flex-1 sm:flex-none gap-1.5 data-[state=active]:shadow-sm">
            <ShieldCheck className="h-4 w-4" />Permissões por função
          </TabsTrigger>
        </TabsList>

        <TabsContent value="contas" className="mt-4">
          <UsersPanel users={users} loading={loading} roleNames={roleNames} onChanged={load} />
        </TabsContent>

        <TabsContent value="permissoes" className="mt-4">
          <RolesPanel
            roles={roles} users={users} loading={loading}
            onSaved={async () => { await load(); reloadPerms(); }}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
