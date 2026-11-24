import { useMemo, useState } from 'react';
import { AREAS, PERMISSION_TABS, SUB_PERMISSIONS, type AccessLevel, type AppRole, type AppUser } from '@/lib/permissions';
import { acessoEfetivo } from '@/lib/role-matrix';
import { locaisDoPerfil } from '@/lib/locations';
import { usePermissions } from '@/contexts/PermissionsContext';
import { cn } from '@/lib/utils';

/* O que esta conta pode fazer, tab a tab, e porquê (perfil + local + equipa). Só leitura, lista vertical.
 * Não inclui exceções pontuais por email nem o estado de administrador da plataforma. */

const LABEL: Record<AccessLevel, string> = { none: 'Sem acesso', view: 'Consulta', edit: 'Edição' };
const COR: Record<AccessLevel, string> = {
  none: 'bg-muted/50 text-muted-foreground',
  view: 'bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-200',
  edit: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200',
};

export function UserAccessMatrix({ user, roles }: { user: AppUser; roles: AppRole[] }) {
  const { capabilities } = usePermissions();
  const [todos, setTodos] = useState(false);
  const role = roles.find(r => r.name === user.perfil) ?? null;
  const locais = locaisDoPerfil(user.local);
  const equipa = user.equipa ?? null;

  const areas = useMemo(() => {
    if (!role || role.is_admin) return [];
    const opts = { equipa };
    return AREAS.map(area => ({
      area,
      linhas: PERMISSION_TABS.filter(t => t.area === area.key).flatMap(t => [
        { key: t.key, label: t.label, fina: false, ...acessoEfetivo(role, locais, t.key, opts) },
        ...SUB_PERMISSIONS.filter(sp => sp.parent === t.key && capabilities[sp.capability])
          .map(sp => ({ key: sp.key, label: sp.label, fina: true, ...acessoEfetivo(role, locais, sp.key, opts) })),
      ]).filter(l => todos || l.nivel !== 'none'),
    })).filter(a => a.linhas.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, equipa, user.local, capabilities, todos]);

  if (!role) return <p className="px-4 py-3 text-sm text-muted-foreground">Esta conta não tem um perfil válido: não tem acesso a nada.</p>;
  if (role.is_admin) return <p className="px-4 py-3 text-sm text-muted-foreground">Perfil de administrador: acesso total a tudo.</p>;

  return (
    <div className="space-y-2 px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>Perfil <strong className="text-foreground">{user.perfil}</strong> · {locais.length ? locais.join(', ') : 'sem local'}</span>
        <label className="flex items-center gap-1.5 cursor-pointer select-none">
          <input type="checkbox" checked={todos} onChange={e => setTodos(e.target.checked)} /> Mostrar também sem acesso
        </label>
      </div>
      {areas.length === 0 && <p className="text-sm text-muted-foreground">Sem acesso a nenhum tab.</p>}
      {areas.map(({ area, linhas }) => (
        <div key={area.key} data-area={area.key} className="rounded-lg border border-border overflow-hidden">
          <div className="bg-muted/40 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{area.label}</div>
          <ul className="divide-y divide-border/60">
            {linhas.map(l => (
              <li key={l.key} className="flex items-center justify-between gap-3 px-3 py-1.5">
                <div className="min-w-0">
                  <div className={cn('truncate', l.fina ? 'pl-3 text-xs text-muted-foreground' : 'text-sm font-medium')}>{l.fina ? `↳ ${l.label}` : l.label}</div>
                  <div className={cn('text-[11px] text-muted-foreground', l.fina && 'pl-3')}>{l.origem}</div>
                </div>
                <span className={cn('shrink-0 rounded px-2 py-0.5 text-[11px] font-medium', COR[l.nivel])}>{l.fina ? (l.nivel === 'none' ? 'Não' : 'Sim') : LABEL[l.nivel]}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
