import { Fragment, useMemo } from 'react';
import { Pencil, Trash2, Copy } from 'lucide-react';
import { PERMISSION_TABS, AREAS, SUB_PERMISSIONS, type AccessLevel, type AppCapabilities, type AppUser } from '@/lib/permissions';
import { diferentesDoMaioritario, proximoNivel, proximoNivelEquipa } from '@/lib/role-matrix';
import { locaisDoPerfil } from '@/lib/locations';
import { cn } from '@/lib/utils';
import { Select, SelectTrigger, SelectContent, SelectItem } from '@/components/ui/select';

/* Matriz única de permissões: linhas = tabs; colunas = cada perfil com os seus locais, "sem local"
 * e equipas lado a lado. Clicar numa célula percorre sem acesso → consulta → edição.
 * Equipa = camada por cima do local: célula vazia herda; preenchida substitui (incl. "sem acesso"). */

/** Colunas de um perfil: um local, 'base' (contas sem local) ou 'eq:<equipa>'. */
export const BASE = '__base__';
export const EQ = 'eq:';

export interface PerfilColuna { name: string; dirty: boolean }

const NIVEL_LABEL: Record<AccessLevel, string> = { none: 'Sem acesso', view: 'Consulta', edit: 'Edição' };
const CURTO: Record<AccessLevel, string> = { none: '—', view: 'Ver', edit: 'Editar' };
const COR: Record<AccessLevel, string> = {
  none: 'bg-muted/50 text-muted-foreground',
  view: 'bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-200',
  edit: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200',
};
const LEVELS: AccessLevel[] = ['none', 'view', 'edit'];

const nomes = (us: AppUser[]) => us.map(u => u.nome || u.email).join(', ');

export function PermissionsMatrix({
  perfis, locais, mostrarBase, equipas, users, allPerfis, capabilities, soDiferencas,
  getCell, setCells, onRename, onDelete, onCopyFrom,
}: {
  perfis: PerfilColuna[];
  /** Locais visíveis, por ordem. */
  locais: string[];
  mostrarBase: boolean;
  /** Equipas visíveis (colunas-camada). */
  equipas: string[];
  users: AppUser[];
  allPerfis: string[];
  capabilities: AppCapabilities;
  soDiferencas: boolean;
  /** Local/base: sempre um nível. Equipa: undefined = herda do local. */
  getCell: (perfil: string, col: string, key: string) => AccessLevel | undefined;
  setCells: (perfil: string, cols: string[], keys: string[], value: AccessLevel | undefined) => void;
  onRename: (perfil: string) => void;
  onDelete: (perfil: string) => void;
  onCopyFrom: (perfil: string, origem: string) => void;
}) {
  const colunas = useMemo(() => [
    ...locais.map(id => ({ id, label: id, tipo: 'local' as const })),
    ...(mostrarBase ? [{ id: BASE, label: 'Sem local', tipo: 'base' as const }] : []),
    ...equipas.map(e => ({ id: EQ + e, label: e, tipo: 'equipa' as const })),
  ], [locais, mostrarBase, equipas]);
  const nCols = colunas.length;
  const colsDeNivel = colunas.filter(c => c.tipo !== 'equipa').map(c => c.id);

  const utilizadoresDe = (perfil: string, col: { id: string; tipo: string }) =>
    users.filter(u => u.perfil === perfil && (
      col.tipo === 'local' ? locaisDoPerfil(u.local).includes(col.id)
      : col.tipo === 'base' ? locaisDoPerfil(u.local).length === 0
      : u.equipa === col.id.slice(EQ.length)));

  const nivelDe = (p: string, c: string, k: string): AccessLevel => getCell(p, c, k) ?? 'none';
  const variaEm = (p: string, k: string) => {
    const l = colunas.filter(c => c.tipo === 'local').map(c => nivelDe(p, c.id, k));
    return l.some(v => v !== l[0]) || colunas.some(c => c.tipo === 'equipa' && getCell(p, c.id, k) !== undefined);
  };
  const temDiferencas = (k: string) => perfis.some(p => variaEm(p.name, k));

  const areas = useMemo(() => AREAS.map(area => ({ area, tabs: PERMISSION_TABS.filter(t => t.area === area.key) })).filter(a => a.tabs.length > 0), []);
  const finasDe = (tab: string) => SUB_PERMISSIONS.filter(sp => sp.parent === tab && capabilities[sp.capability]);

  const celula = (perfil: string, col: (typeof colunas)[number], key: string, fina: boolean, destaque: boolean, rotulo: string, primeira: boolean) => {
    const v = getCell(perfil, col.id, key);
    const equipa = col.tipo === 'equipa';
    const herda = equipa && v === undefined;
    const nv: AccessLevel = v ?? 'none';
    const proximo = equipa ? proximoNivelEquipa(v, fina) : proximoNivel(nv, fina);
    const texto = herda ? 'herda' : fina ? (nv === 'none' ? 'Não' : 'Sim') : CURTO[nv];
    const desc = herda ? 'herda do local' : fina ? (nv === 'none' ? 'Não' : 'Sim') : NIVEL_LABEL[nv];
    return (
      <td key={col.id} className={cn('px-0.5 py-0.5 text-center', primeira && 'border-l-2 border-border')}>
        <button
          type="button"
          aria-label={`${rotulo} · ${perfil} · ${col.label}: ${desc}`}
          title={`${rotulo} · ${perfil} · ${col.label}: ${desc}. Clicar para alterar.`}
          onClick={() => setCells(perfil, [col.id], [key], proximo)}
          className={cn(
            'w-full min-w-[3.1rem] rounded px-1 py-0.5 text-[11px] font-medium leading-tight transition-colors hover:brightness-95',
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

  const destaques = (perfil: string, key: string) => {
    const ls = colunas.filter(c => c.tipo === 'local');
    return diferentesDoMaioritario(ls.map(c => nivelDe(perfil, c.id, key)));
  };

  if (perfis.length === 0) {
    return <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">Nenhum perfil visível. Escolhe pelo menos um perfil.</div>;
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-auto max-h-[78vh]">
      <table className="border-separate border-spacing-0 text-sm">
        <thead className="sticky top-0 z-30">
          {/* Perfil */}
          <tr>
            <th rowSpan={3} className="sticky left-0 z-40 bg-muted px-3 py-2 text-left text-[11px] font-semibold align-bottom min-w-[11rem]">Tab</th>
            {perfis.map(p => {
              const membros = users.filter(u => u.perfil === p.name);
              return (
                <th key={p.name} colSpan={nCols} className="bg-muted px-2 py-1.5 border-l-2 border-border text-left">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0">
                      <span className="text-sm font-bold">{p.name}</span>
                      {p.dirty && <span className="ml-1.5 inline-block h-2 w-2 rounded-full bg-amber-500 align-middle" title="Alterações por guardar" />}
                      <span className="ml-2 text-[11px] font-normal text-muted-foreground" title={nomes(membros)}>{membros.length} {membros.length === 1 ? 'utilizador' : 'utilizadores'}</span>
                    </span>
                    <span className="flex items-center gap-0.5 shrink-0">
                      <Select value="" onValueChange={o => onCopyFrom(p.name, o)}>
                        <SelectTrigger aria-label={`Copiar permissões para ${p.name}`} title="Copiar as permissões de outro perfil" className="h-6 w-6 p-0 justify-center border-0 bg-transparent [&>svg:last-child]:hidden"><Copy className="h-3.5 w-3.5" /></SelectTrigger>
                        <SelectContent>
                          {allPerfis.filter(n => n !== p.name).map(n => <SelectItem key={n} value={n}>Copiar de {n}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <button type="button" aria-label={`Renomear a função ${p.name}`} title={p.dirty ? 'Guarda ou descarta as alterações antes de renomear' : 'Renomear'} disabled={p.dirty}
                        onClick={() => onRename(p.name)} className="grid h-6 w-6 place-items-center rounded hover:bg-accent disabled:opacity-40"><Pencil className="h-3.5 w-3.5" /></button>
                      <button type="button" aria-label={`Eliminar a função ${p.name}`} title={membros.length ? 'Muda primeiro a função destes utilizadores' : 'Eliminar'} disabled={membros.length > 0}
                        onClick={() => onDelete(p.name)} className="grid h-6 w-6 place-items-center rounded text-destructive hover:bg-accent disabled:opacity-40"><Trash2 className="h-3.5 w-3.5" /></button>
                    </span>
                  </div>
                </th>
              );
            })}
          </tr>
          {/* Local / equipa */}
          <tr className="text-[11px] font-semibold">
            {perfis.map(p => colunas.map((c, i) => (
              <th key={p.name + c.id} className={cn('px-1 py-1 text-center', i === 0 && 'border-l-2 border-border', c.tipo === 'equipa' ? 'bg-violet-100 dark:bg-violet-950' : 'bg-muted')}
                title={c.tipo === 'equipa' ? 'Equipa: sobrepõe-se ao local (vazio = herda)' : undefined}>{c.label}</th>
            )))}
          </tr>
          {/* Utilizadores afetados */}
          <tr className="text-[10px] text-muted-foreground">
            {perfis.map(p => colunas.map((c, i) => {
              const us = utilizadoresDe(p.name, c);
              return (
                <th key={p.name + c.id} className={cn('px-1 pb-1 text-center font-normal bg-muted', i === 0 && 'border-l-2 border-border')} title={us.length ? nomes(us) : 'Sem utilizadores'}>
                  {us.length} 👤
                </th>
              );
            }))}
          </tr>
        </thead>
        {areas.map(({ area, tabs }) => {
          const linhas = tabs.filter(t => !soDiferencas || temDiferencas(t.key) || finasDe(t.key).some(sp => temDiferencas(sp.key)));
          if (linhas.length === 0) return null;
          const keys = tabs.map(t => t.key);
          return (
            <tbody key={area.key} data-area={area.key}>
              <tr>
                <td className="sticky left-0 z-10 bg-muted/60 px-3 py-1">
                  <h4 className={cn('text-xs font-bold uppercase tracking-wide', area.style === 'admin' ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground')}>{area.label}</h4>
                </td>
                {perfis.map(p => (
                  <td key={p.name} colSpan={nCols} className="bg-muted/40 px-2 py-1 border-l-2 border-border text-[11px]">
                    <span className="text-muted-foreground mr-1">Área toda ({p.name}):</span>
                    {LEVELS.map(l => (
                      <button key={l} type="button" aria-label={`${area.label} · ${p.name}: ${NIVEL_LABEL[l]} em todos os locais`} onClick={() => setCells(p.name, colsDeNivel, keys, l)}
                        className="mr-1 rounded border border-border bg-background px-1 py-0.5 hover:bg-accent">{CURTO[l]}</button>
                    ))}
                  </td>
                ))}
              </tr>
              {linhas.map(t => (
                <Fragment key={t.key}>
                  <tr className="hover:bg-muted/20">
                    <td className="sticky left-0 z-10 bg-card px-3 py-0.5 text-sm font-medium whitespace-nowrap">{t.label}</td>
                    {perfis.map(p => {
                      const dest = destaques(p.name, t.key);
                      let li = -1;
                      return colunas.map((c, i) => {
                        if (c.tipo === 'local') li += 1;
                        return (
                          <Fragment key={p.name + c.id}>
                            {celula(p.name, c, t.key, false, c.tipo === 'local' && dest[li], t.label, i === 0)}
                          </Fragment>
                        );
                      });
                    })}
                  </tr>
                  {finasDe(t.key).map(sp => (
                    <tr key={sp.key} className="hover:bg-muted/20">
                      <td className="sticky left-0 z-10 bg-card py-0.5 pl-7 pr-3 text-xs text-muted-foreground whitespace-nowrap" title={sp.hint}>↳ {sp.label}</td>
                      {perfis.map(p => {
                        const dest = destaques(p.name, sp.key);
                        let li = -1;
                        return colunas.map((c, i) => {
                          if (c.tipo === 'local') li += 1;
                          return (
                            <Fragment key={p.name + c.id}>
                              {celula(p.name, c, sp.key, true, c.tipo === 'local' && dest[li], sp.label, i === 0)}
                            </Fragment>
                          );
                        });
                      })}
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
