import { Fragment, useMemo } from 'react';
import { PERMISSION_TABS, AREAS, SUB_PERMISSIONS, EQUIPAS_DA_MATRIZ, SEM_EQUIPA, SEM_LOCAL, type AccessLevel, type AppCapabilities, type AppUser, type Matriz } from '@/lib/permissions';
import { locaisDoGrupo, locaisDoPerfil } from '@/lib/locations';
import { nivelDe, proximoNivel } from '@/lib/matriz';
import { cn } from '@/lib/utils';

/* Um perfil: linhas = tabs; colunas = LOCAIS e, dentro de cada local, as suas EQUIPAS.
 * Clicar numa célula percorre sem acesso → consulta → edição; clicar no nome do tab aplica a toda a linha. */

const NOME: Record<AccessLevel, string> = { none: 'Sem acesso', view: 'Consulta', edit: 'Edição' };
const CURTO: Record<AccessLevel, string> = { none: '—', view: 'V', edit: 'E' };
const COR: Record<AccessLevel, string> = {
  none: 'text-muted-foreground/40 hover:bg-muted',
  view: 'bg-sky-100 text-sky-800 dark:bg-sky-500/25 dark:text-sky-100',
  edit: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/25 dark:text-emerald-100',
};
const ABREV: Record<string, string> = { 'BMW VN': 'VN', 'BMW VU': 'VU', Motorrad: 'Mot', APV: 'APV', [SEM_EQUIPA]: 'Sem' };

export function MatrizPerfil({ perfil, matriz, users, finas, capabilities, onCells, soComContas }: {
  perfil: string;
  matriz: Matriz;
  users: AppUser[];
  finas: boolean;
  capabilities: AppCapabilities;
  /** Define o nível de várias células; locais/equipas/tabs por extenso. */
  onCells: (locais: string[], equipas: string[], tabs: string[], valor: AccessLevel) => void;
  /** Esconde as colunas (local, equipa) sem nenhuma conta deste perfil. */
  soComContas: boolean;
}) {
  const locais = useMemo(() => [...locaisDoGrupo(), SEM_LOCAL], []);
  const equipasTodas = useMemo(() => [...EQUIPAS_DA_MATRIZ, SEM_EQUIPA] as string[], []);

  const contas = (l: string, e: string) => users.filter(u => {
    if (u.perfil !== perfil) return false;
    const ls = locaisDoPerfil(u.local);
    const noLocal = l === SEM_LOCAL ? ls.length === 0 : ls.includes(l);
    const eq = (EQUIPAS_DA_MATRIZ as readonly string[]).includes(u.equipa ?? '') ? (u.equipa as string) : SEM_EQUIPA;
    return noLocal && eq === e;
  });

  const grupos = useMemo(() => locais.map(l => ({
    local: l,
    equipas: equipasTodas.filter(e => !soComContas || contas(l, e).length > 0),
  })).filter(g => g.equipas.length > 0),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [locais, equipasTodas, soComContas, users, perfil]);

  const areas = useMemo(() => AREAS.map(area => ({ area, tabs: PERMISSION_TABS.filter(t => t.area === area.key) })).filter(a => a.tabs.length > 0), []);
  const finasDe = (tab: string) => finas ? SUB_PERMISSIONS.filter(sp => sp.parent === tab && capabilities[sp.capability]) : [];
  const todasLocais = grupos.map(g => g.local);

  const celulas = grupos.flatMap(g => g.equipas.map(e => ({ l: g.local, e })));
  const aplicarLinha = (key: string) => {
    const primeiro = celulas.length ? nivelDe(matriz, celulas[0].l, celulas[0].e, key) : 'none';
    onCells(todasLocais, equipasTodas, [key], proximoNivel(primeiro));
  };

  if (grupos.length === 0) return <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Este perfil ainda não tem contas. Desliga "Só colunas com contas" para o configurar.</div>;

  const linha = (key: string, rotulo: string, fina: boolean) => (
    <tr className="hover:bg-muted/20">
      <td className={cn('sticky left-0 z-10 bg-card px-3 py-px whitespace-nowrap', fina ? 'pl-7 text-xs text-muted-foreground' : 'text-[13px]')}>
        <button type="button" onClick={() => aplicarLinha(key)} title="Clicar aplica o próximo nível a toda a linha" className="text-left hover:underline">
          {fina ? `↳ ${rotulo}` : rotulo}
        </button>
      </td>
      {grupos.map(g => g.equipas.map((e, i) => {
        const v = nivelDe(matriz, g.local, e, key);
        const nome = `${rotulo} · ${g.local === SEM_LOCAL ? 'Sem local' : g.local} · ${e === SEM_EQUIPA ? 'Sem equipa' : e}`;
        return (
          <td key={g.local + e} className={cn('px-px py-px text-center', i === 0 && 'border-l-2 border-border')}>
            <button type="button" aria-label={`${nome}: ${NOME[v]}`} title={`${nome}: ${NOME[v]}`}
              onClick={() => onCells([g.local], [e], [key], proximoNivel(v))}
              className={cn('h-6 w-full min-w-[1.9rem] rounded text-[11px] font-semibold transition-colors', COR[v])}>
              {CURTO[v]}
            </button>
          </td>
        );
      }))}
    </tr>
  );

  return (
    <div className="rounded-xl border border-border bg-card overflow-auto max-h-[75vh]">
      <table className="border-separate border-spacing-0 text-sm">
        <thead className="sticky top-0 z-30 bg-muted">
          <tr>
            <th rowSpan={3} className="sticky left-0 z-40 bg-muted px-3 py-2 text-left text-[11px] font-semibold align-bottom min-w-[10rem]">Tab</th>
            {grupos.map(g => (
              <th key={g.local} colSpan={g.equipas.length} className="border-l-2 border-border bg-muted px-1 py-1 text-center text-xs font-bold">
                {g.local === SEM_LOCAL ? 'Sem local' : g.local}
              </th>
            ))}
          </tr>
          <tr className="text-[10px] font-semibold">
            {grupos.map(g => g.equipas.map((e, i) => (
              <th key={g.local + e} title={e === SEM_EQUIPA ? 'Sem equipa' : e} className={cn('bg-muted px-px py-0.5 text-center', i === 0 && 'border-l-2 border-border')}>{ABREV[e]}</th>
            )))}
          </tr>
          <tr className="text-[10px] font-normal text-muted-foreground">
            {grupos.map(g => g.equipas.map((e, i) => {
              const us = contas(g.local, e);
              return <th key={g.local + e} title={us.length ? us.map(u => u.nome || u.email).join(', ') : 'Sem contas'} className={cn('bg-muted px-px pb-1 text-center font-normal', i === 0 && 'border-l-2 border-border')}>{us.length || ''}</th>;
            }))}
          </tr>
        </thead>
        {areas.map(({ area, tabs }) => (
          <tbody key={area.key} data-area={area.key}>
            <tr>
              <td colSpan={celulas.length + 1} className="sticky left-0 bg-muted/60 px-3 py-0.5">
                <h4 className={cn('text-[11px] font-bold uppercase tracking-wide', area.style === 'admin' ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground')}>{area.label}</h4>
              </td>
            </tr>
            {tabs.map(t => (
              <Fragment key={t.key}>
                {linha(t.key, t.label, false)}
                {finasDe(t.key).map(sp => <Fragment key={sp.key}>{linha(sp.key, sp.label, true)}</Fragment>)}
              </Fragment>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}
