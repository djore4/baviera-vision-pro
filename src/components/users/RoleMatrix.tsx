import { Fragment, useMemo } from 'react';
import { PERMISSION_TABS, AREAS, SUB_PERMISSIONS, type AccessLevel, type AppCapabilities } from '@/lib/permissions';
import { diferentesDoMaioritario, proximoNivel, proximoNivelEquipa } from '@/lib/role-matrix';
import { cn } from '@/lib/utils';

/* Matriz tab × (locais, sem local, equipas): tudo lado a lado, edição por clique na célula.
 * Locais e "sem local": sem acesso → consulta → edição. Equipas: camada por cima do local
 * (célula vazia herda; preenchida substitui, incluindo "sem acesso"). As células de um local
 * que diferem da maioria da linha ficam destacadas. */

export interface Coluna { id: string; label: string; tipo: 'local' | 'base' | 'equipa' }

const NIVEL_LABEL: Record<AccessLevel, string> = { none: 'Sem acesso', view: 'Consulta', edit: 'Edição' };
const CURTO: Record<AccessLevel, string> = { none: '—', view: 'Ver', edit: 'Editar' };
const COR: Record<AccessLevel, string> = {
  none: 'bg-muted/50 text-muted-foreground',
  view: 'bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-200',
  edit: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200',
};
const LEVELS: AccessLevel[] = ['none', 'view', 'edit'];

export function RoleMatrix({ colunas, getCell, setCells, capabilities, soDiferencas }: {
  colunas: Coluna[];
  /** Local/base: sempre um nível. Equipa: undefined = herda do local. */
  getCell: (col: string, key: string) => AccessLevel | undefined;
  setCells: (cols: string[], keys: string[], value: AccessLevel | undefined) => void;
  capabilities: AppCapabilities;
  soDiferencas: boolean;
}) {
  const locais = colunas.filter(c => c.tipo === 'local');
  const baseECols = colunas.filter(c => c.tipo !== 'equipa').map(c => c.id);
  const equipas = colunas.filter(c => c.tipo === 'equipa');
  const nivelDe = (col: string, key: string): AccessLevel => getCell(col, key) ?? 'none';

  /** Linha com diferenças: locais não são todos iguais, ou há alguma equipa a sobrepor-se. */
  const temDiferencas = (key: string) => {
    const l = locais.map(c => nivelDe(c.id, key));
    return l.some(v => v !== l[0]) || equipas.some(c => getCell(c.id, key) !== undefined);
  };

  const areas = useMemo(() => AREAS.map(area => ({ area, tabs: PERMISSION_TABS.filter(t => t.area === area.key) })).filter(a => a.tabs.length > 0), []);

  const celula = (col: Coluna, key: string, fina: boolean, destaque: boolean, rotulo: string) => {
    const v = getCell(col.id, key);
    const equipa = col.tipo === 'equipa';
    const herda = equipa && v === undefined;
    const nv: AccessLevel = v ?? 'none';
    const proximo = equipa ? proximoNivelEquipa(v, fina) : proximoNivel(nv, fina);
    const texto = herda ? 'herda' : v === undefined ? CURTO.none : fina ? (nv === 'none' ? 'Não' : 'Sim') : CURTO[nv];
    const desc = herda ? 'herda do local' : fina ? (nv === 'none' ? 'Não' : 'Sim') : NIVEL_LABEL[nv];
    return (
      <td key={col.id} className="px-1 py-1 text-center">
        <button
          type="button"
          aria-label={`${rotulo} · ${col.label}: ${desc}`}
          title={`${rotulo} · ${col.label}: ${desc}. Clicar para alterar.`}
          onClick={() => setCells([col.id], [key], proximo)}
          className={cn(
            'w-full min-w-[3.75rem] rounded px-1.5 py-1 text-[11px] font-medium leading-tight transition-colors hover:brightness-95',
            herda ? 'border border-dashed border-border text-muted-foreground/60 bg-transparent' : COR[nv],
            equipa && !herda && 'ring-1 ring-violet-500/60',
            destaque && 'outline outline-2 outline-amber-500',
          )}
        >
          {texto}
        </button>
      </td>
    );
  };

  const nCols = 1 + colunas.length + 1;
  return (
    <div className="rounded-xl border border-border bg-card overflow-x-auto">
      <table className="w-full text-sm border-separate border-spacing-0">
        <thead>
          <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
            <th className="sticky left-0 z-20 bg-muted px-3 py-1.5" />
            {(locais.length > 0 || colunas.some(c => c.tipo === 'base')) && (
              <th colSpan={locais.length + (colunas.some(c => c.tipo === 'base') ? 1 : 0)} className="bg-muted/60 px-2 py-1.5 text-center border-l border-border">Local</th>
            )}
            {equipas.length > 0 && (
              <th colSpan={equipas.length} className="bg-violet-500/10 px-2 py-1.5 text-center border-l border-border text-violet-800 dark:text-violet-300"
                title="A equipa sobrepõe-se ao local: uma célula preenchida vale em todos os locais; vazia herda do local.">
                Equipa (sobrepõe o local)
              </th>
            )}
            <th className="bg-muted/60 px-2 py-1.5 border-l border-border">Todos os locais</th>
          </tr>
          <tr className="text-[11px] font-semibold text-foreground">
            <th className="sticky left-0 z-20 bg-muted px-3 py-2 text-left">Tab</th>
            {colunas.map(c => (
              <th key={c.id} className={cn('px-1 py-2 text-center border-l border-border', c.tipo === 'equipa' ? 'bg-violet-500/10' : 'bg-muted/60')}>{c.label}</th>
            ))}
            <th className="bg-muted/60 px-1 py-2 border-l border-border" />
          </tr>
        </thead>
        {areas.map(({ area, tabs }) => {
          const linhas = tabs.filter(t => !soDiferencas || temDiferencas(t.key)
            || SUB_PERMISSIONS.some(sp => sp.parent === t.key && capabilities[sp.capability] && temDiferencas(sp.key)));
          if (linhas.length === 0) return null;
          const keys = tabs.map(t => t.key);
          return (
            <tbody key={area.key} data-area={area.key}>
              <tr>
                <td className="sticky left-0 z-10 bg-muted/40 px-3 py-1.5" colSpan={1}>
                  <h4 className={cn('text-xs font-bold uppercase tracking-wide', area.style === 'admin' ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground')}>{area.label}</h4>
                </td>
                <td colSpan={nCols - 1} className="bg-muted/40 px-3 py-1.5 text-right">
                  <span className="text-[11px] text-muted-foreground mr-1.5">Área toda, em todos os locais:</span>
                  {LEVELS.map(l => (
                    <button key={l} type="button" onClick={() => setCells(baseECols, keys, l)}
                      className="mr-1 rounded border border-border bg-background px-1.5 py-0.5 text-[11px] hover:bg-accent">{NIVEL_LABEL[l]}</button>
                  ))}
                </td>
              </tr>
              {linhas.map(t => (
                <Fragment key={t.key}>
                  <tr className="hover:bg-muted/20">
                    <td className="sticky left-0 z-10 bg-card px-3 py-1 text-sm font-medium whitespace-nowrap">{t.label}</td>
                    {colunas.map(c => celula(c, t.key, false,
                      c.tipo === 'local' && diferentesDoMaioritario(locais.map(l => nivelDe(l.id, t.key)))[locais.findIndex(l => l.id === c.id)], t.label))}
                    <td className="px-1 py-1 text-center whitespace-nowrap border-l border-border">
                      {LEVELS.map(l => (
                        <button key={l} type="button" aria-label={`${t.label} · todos os locais: ${NIVEL_LABEL[l]}`} title={`${t.label}: ${NIVEL_LABEL[l]} em todos os locais`}
                          onClick={() => setCells(baseECols, [t.key], l)}
                          className="mx-0.5 rounded border border-border px-1 py-0.5 text-[10px] text-muted-foreground hover:bg-accent">{CURTO[l]}</button>
                      ))}
                    </td>
                  </tr>
                  {SUB_PERMISSIONS.filter(sp => sp.parent === t.key && capabilities[sp.capability]).map(sp => (
                    <tr key={sp.key} className="hover:bg-muted/20">
                      <td className="sticky left-0 z-10 bg-card py-0.5 pl-7 pr-3 text-xs text-muted-foreground whitespace-nowrap" title={sp.hint}>↳ {sp.label}</td>
                      {colunas.map(c => celula(c, sp.key, true,
                        c.tipo === 'local' && diferentesDoMaioritario(locais.map(l => nivelDe(l.id, sp.key)))[locais.findIndex(l => l.id === c.id)], sp.label))}
                      <td className="border-l border-border" />
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}
