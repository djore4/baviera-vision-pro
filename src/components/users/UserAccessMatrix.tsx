import { useMemo, useState } from 'react';
import { AREAS, PERMISSION_TABS, SUB_PERMISSIONS, type AccessLevel, type AppRole, type AppUser } from '@/lib/permissions';
import { acessoEfetivo, diferentesDoMaioritario } from '@/lib/role-matrix';
import { locaisDoGrupo, locaisDoPerfil } from '@/lib/locations';
import { usePermissions } from '@/contexts/PermissionsContext';
import { cn } from '@/lib/utils';

/* Acesso de UMA conta, tab a tab, com todos os locais lado a lado: o que a função da pessoa (e a sua
 * equipa) dá em cada local, para se verem logo as diferenças entre locais. Os locais da conta ficam
 * marcados e a última coluna é o acesso final (o mais alto entre os locais da conta) com a origem.
 * Só leitura: a função, os locais e a equipa mudam-se na própria linha da conta. Não inclui exceções
 * pontuais por email nem o estado de administrador da plataforma. */

const LABEL: Record<AccessLevel, string> = { none: 'Sem acesso', view: 'Consulta', edit: 'Edição' };
const CURTO: Record<AccessLevel, string> = { none: '—', view: 'Ver', edit: 'Editar' };
const COR: Record<AccessLevel, string> = {
  none: 'bg-muted/50 text-muted-foreground',
  view: 'bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-200',
  edit: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200',
};

export function UserAccessMatrix({ user, roles }: { user: AppUser; roles: AppRole[] }) {
  const { capabilities, tabsPorLocal } = usePermissions();
  const [soDiferencas, setSoDiferencas] = useState(false);
  const [soComAcesso, setSoComAcesso] = useState(true);
  const role = roles.find(r => r.name === user.perfil) ?? null;
  const minhas = locaisDoPerfil(user.local);
  const todosLocais = locaisDoGrupo();
  const equipa = user.equipa ?? null;
  // Sem locais configurados nesta instalação (ou conta sem local): uma só coluna, "sem local".
  const colunas: { id: string; label: string; locais: string[] }[] = todosLocais.length > 0
    ? todosLocais.map(l => ({ id: l, label: l, locais: [l] }))
    : [{ id: '', label: 'Sem local', locais: [] }];

  const linhasPorArea = useMemo(() => {
    if (!role || role.is_admin) return [];
    const opts = { tabsPorLocal, equipa };
    const celulas = (key: string) => {
      const porLocal = colunas.map(c => acessoEfetivo(role, c.locais, key, opts));
      const final = acessoEfetivo(role, minhas, key, opts);
      const dif = diferentesDoMaioritario(porLocal.map(p => p.nivel));
      return { porLocal, final, dif, variam: dif.some(Boolean) };
    };
    return AREAS.map(area => ({
      area,
      linhas: PERMISSION_TABS.filter(t => t.area === area.key).flatMap(t => [
        { key: t.key, label: t.label, fina: false, ...celulas(t.key) },
        ...SUB_PERMISSIONS.filter(sp => sp.parent === t.key && capabilities[sp.capability])
          .map(sp => ({ key: sp.key, label: sp.label, fina: true, ...celulas(sp.key) })),
      ]).filter(l => (!soDiferencas || l.variam) && (!soComAcesso || l.final.nivel !== 'none' || l.porLocal.some(p => p.nivel !== 'none'))),
    })).filter(a => a.linhas.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, equipa, user.local, tabsPorLocal, capabilities, soDiferencas, soComAcesso]);

  if (!role) return <p className="px-4 py-3 text-sm text-muted-foreground">Esta conta não tem uma função válida: não tem acesso a nada.</p>;
  if (role.is_admin) return <p className="px-4 py-3 text-sm text-muted-foreground">Função de administrador: acesso total a tudo, em todos os locais.</p>;

  const temCamada = !!role.permissions_equipa && Object.keys(role.permissions_equipa).length > 0;
  const nCols = colunas.length;

  return (
    <div className="space-y-2 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Função <strong className="text-foreground">{user.perfil}</strong> · {minhas.length ? <>locais da conta: <strong className="text-foreground">{minhas.join(', ')}</strong></> : 'sem local'} · {equipa ? <>equipa <strong className="text-foreground">{equipa}</strong></> : 'sem equipa definida'}
        </p>
        <div className="flex items-center gap-3 text-xs">
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input type="checkbox" checked={soComAcesso} onChange={e => setSoComAcesso(e.target.checked)} /> Só tabs com acesso
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input type="checkbox" checked={soDiferencas} onChange={e => setSoDiferencas(e.target.checked)} /> Só diferenças entre locais
          </label>
        </div>
      </div>
      {temCamada && !equipa && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
          Esta função tem acessos por equipa, mas a conta não tem equipa definida: só vale a matriz do local.
        </p>
      )}
      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <table className="w-full text-sm border-separate border-spacing-0">
          <thead>
            <tr className="bg-muted text-[11px] font-semibold">
              <th className="sticky left-0 z-20 bg-muted px-3 py-2 text-left">Tab</th>
              {colunas.map(c => {
                const daConta = c.locais.length > 0 && minhas.includes(c.locais[0]);
                return (
                  <th key={c.id} className={cn('px-2 py-2 text-center border-l border-border', daConta && 'bg-primary/10 text-primary')}>
                    {c.label}{daConta && <span className="block text-[9px] font-medium uppercase tracking-wide">conta</span>}
                  </th>
                );
              })}
              <th className="px-3 py-2 text-left border-l border-border bg-muted">Acesso da conta</th>
            </tr>
          </thead>
          {linhasPorArea.length === 0 && (
            <tbody><tr><td colSpan={nCols + 2} className="px-3 py-6 text-center text-sm text-muted-foreground">Nenhum tab corresponde aos filtros.</td></tr></tbody>
          )}
          {linhasPorArea.map(({ area, linhas }) => (
            <tbody key={area.key} data-area={area.key}>
              <tr>
                <td colSpan={nCols + 2} className="bg-muted/40 px-3 py-1">
                  <h4 className={cn('text-[11px] font-bold uppercase tracking-wide', area.style === 'admin' ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground')}>{area.label}</h4>
                </td>
              </tr>
              {linhas.map(l => (
                <tr key={l.key} className="hover:bg-muted/20">
                  <td className={cn('sticky left-0 z-10 bg-card px-3 py-1 whitespace-nowrap', l.fina ? 'pl-7 text-xs text-muted-foreground' : 'text-sm font-medium')}>{l.fina ? `↳ ${l.label}` : l.label}</td>
                  {l.porLocal.map((p, i) => (
                    <td key={colunas[i].id} className="px-1 py-1 text-center border-l border-border/50">
                      <span
                        title={`${l.label} · ${colunas[i].label}: ${l.fina ? (p.nivel === 'none' ? 'Não' : 'Sim') : LABEL[p.nivel]} — ${p.origem}`}
                        aria-label={`${l.label} · ${colunas[i].label}: ${l.fina ? (p.nivel === 'none' ? 'Não' : 'Sim') : LABEL[p.nivel]}`}
                        className={cn('inline-block min-w-[3.25rem] rounded px-1.5 py-0.5 text-[11px] font-medium', COR[p.nivel], l.dif[i] && 'outline outline-2 outline-amber-500')}
                      >
                        {l.fina ? (p.nivel === 'none' ? 'Não' : 'Sim') : CURTO[p.nivel]}
                      </span>
                    </td>
                  ))}
                  <td className="px-3 py-1 border-l border-border whitespace-nowrap">
                    <span className={cn('rounded px-2 py-0.5 text-[11px] font-medium', COR[l.final.nivel])}>{l.fina ? (l.final.nivel === 'none' ? 'Não' : 'Sim') : LABEL[l.final.nivel]}</span>
                    <span className="ml-2 text-[11px] text-muted-foreground">{l.final.origem}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Cada coluna mostra o que a função dá a quem opera nesse local; o contorno âmbar marca os locais que diferem da maioria da linha.
        Quem opera em vários locais fica com o nível mais alto entre eles. Não inclui exceções por email.
      </p>
    </div>
  );
}
