import { useMemo, useState } from 'react';
import { AREAS, PERMISSION_TABS, SUB_PERMISSIONS, type AccessLevel, type AppRole, type AppUser } from '@/lib/permissions';
import { acessoEfetivo } from '@/lib/role-matrix';
import { locaisDoPerfil } from '@/lib/locations';
import { usePermissions } from '@/contexts/PermissionsContext';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

/* Acesso efetivo de uma pessoa, tab a tab, com a origem de cada nível (função + local + equipa).
 * Responde a "porque é que esta pessoa não consegue editar?". Não inclui as exceções por email
 * (só o próprio as lê) nem o acesso total de administrador. */

const LABEL: Record<AccessLevel, string> = { none: 'Sem acesso', view: 'Consulta', edit: 'Edição' };
const COR: Record<AccessLevel, string> = {
  none: 'bg-muted/50 text-muted-foreground',
  view: 'bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-200',
  edit: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200',
};

export function UserAccessDialog({ user, roles, onClose }: { user: AppUser | null; roles: AppRole[]; onClose: () => void }) {
  const { capabilities, tabsPorLocal } = usePermissions();
  const [todos, setTodos] = useState(false);
  const role = user ? roles.find(r => r.name === user.perfil) ?? null : null;
  const locais = locaisDoPerfil(user?.local);
  const equipa = user?.equipa ?? null;

  const areas = useMemo(() => {
    if (!user || !role) return [];
    const opts = { tabsPorLocal, equipa };
    return AREAS.map(area => ({
      area,
      linhas: PERMISSION_TABS.filter(t => t.area === area.key).flatMap(t => {
        const principal = { key: t.key, label: t.label, fina: false, ...acessoEfetivo(role, locais, t.key, opts) };
        const finas = SUB_PERMISSIONS.filter(sp => sp.parent === t.key && capabilities[sp.capability])
          .map(sp => ({ key: sp.key, label: `↳ ${sp.label}`, fina: true, ...acessoEfetivo(role, locais, sp.key, opts) }));
        return [principal, ...finas];
      }).filter(l => todos || l.nivel !== 'none'),
    })).filter(a => a.linhas.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, role, todos, tabsPorLocal, capabilities, equipa]);

  const temCamada = !!role?.permissions_equipa && Object.keys(role.permissions_equipa).length > 0;

  return (
    <Dialog open={!!user} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Acesso de {user?.nome || user?.email}</DialogTitle>
          <DialogDescription>
            Função <strong>{user?.perfil || '—'}</strong> · {locais.length ? locais.join(', ') : 'sem local'} · {equipa ? `equipa ${equipa}` : 'sem equipa definida'}
          </DialogDescription>
        </DialogHeader>
        {!role ? (
          <p className="text-sm text-muted-foreground">Esta conta não tem uma função válida: não tem acesso a nada.</p>
        ) : role.is_admin ? (
          <p className="text-sm text-muted-foreground">Função de administrador: acesso total a tudo.</p>
        ) : (
          <div className="space-y-3">
            {temCamada && !equipa && (
              <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
                Esta função tem acessos por equipa, mas a conta não tem equipa definida: só vale a matriz do local.
              </p>
            )}
            <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
              <input type="checkbox" checked={todos} onChange={e => setTodos(e.target.checked)} /> Mostrar também os tabs sem acesso
            </label>
            {areas.length === 0 && <p className="text-sm text-muted-foreground">Sem acesso a nenhum tab.</p>}
            {areas.map(({ area, linhas }) => (
              <div key={area.key} className="rounded-lg border border-border overflow-hidden">
                <div className="bg-muted/40 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">{area.label}</div>
                <ul className="divide-y divide-border/60">
                  {linhas.map(l => (
                    <li key={l.key} className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5">
                      <span className={cn('text-sm', l.fina ? 'pl-4 text-xs text-muted-foreground' : 'font-medium')}>{l.label}</span>
                      <span className="flex items-center gap-2">
                        <span className="text-[11px] text-muted-foreground">{l.origem}</span>
                        <span className={cn('rounded px-2 py-0.5 text-[11px] font-medium', COR[l.nivel])}>{l.fina ? (l.nivel === 'none' ? 'Não' : 'Sim') : LABEL[l.nivel]}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <p className="text-[11px] text-muted-foreground">Não inclui exceções pontuais por email nem o estado de administrador da plataforma.</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
