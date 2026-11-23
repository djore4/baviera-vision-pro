import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Pencil, Plus, Save, ShieldCheck, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { PERMISSION_TABS, SUB_PERMISSIONS, permissoesDoLocal, type AccessLevel, type AppRole, type AppUser } from '@/lib/permissions';
import { EQUIPAS } from '@/lib/cartao-go';
import { PermissionsMatrix, BASE, EQ, type PerfilColuna } from '@/components/users/PermissionsMatrix';
import { locaisDoGrupo } from '@/lib/locations';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { saveRole, deleteRole, renameRole } from '@/lib/permissions';
import { usePermissions } from '@/contexts/PermissionsContext';

type Perms = Record<string, AccessLevel>;

/* Rascunho de uma função: a matriz base (contas sem local), uma matriz por local e a camada de cada
 * equipa (só as chaves que a equipa sobrepõe: chave ausente = herda do local). */
interface Draft { base: Perms; locais: Record<string, Perms>; equipas: Record<string, Perms> }

const LOCAIS = locaisDoGrupo();

/* Matrizes guardadas de uma função; um local sem entrada mostra o que a regra anterior lhe dava. */
const draftOf = (r: AppRole, tabsPorLocal: readonly string[]): Draft => ({
  base: { ...(r.permissions ?? {}) },
  locais: Object.fromEntries(LOCAIS.map(l => [l, { ...permissoesDoLocal(r, l, tabsPorLocal) }])),
  equipas: Object.fromEntries(EQUIPAS.map(e => [e, { ...(r.permissions_equipa?.[e] ?? {}) }])),
});

const level = (p: Perms | undefined, key: string): AccessLevel => p?.[key] ?? 'none';

/* Chaves com valor 'none' equivalem a chave ausente: normaliza para comparar. */
/* Chaves editáveis na matriz: os tabs e as suas permissões finas ('lavagem:iniciar'…). */
const MATRIX_KEYS = [...PERMISSION_TABS.map(t => t.key), ...SUB_PERMISSIONS.map(sp => sp.key)];
const normalize = (p: Perms | undefined): Perms => {
  const out: Perms = {};
  MATRIX_KEYS.forEach(k => { const v = level(p, k); if (v !== 'none') out[k] = v; });
  return out;
};
/* Chaves fora da matriz (tabs desativados, arrumados no Arquivo ou só de admin)
 * não se editam aqui: preservam-se tal como estão ao guardar. */
const hiddenKeys = (p: Perms | undefined): Perms => {
  const known = new Set(MATRIX_KEYS);
  const extra: Perms = {};
  Object.entries(p ?? {}).forEach(([k, v]) => { if (!known.has(k)) extra[k] = v; });
  return extra;
};
const forSave = (p: Perms | undefined): Perms => ({ ...hiddenKeys(p), ...normalize(p) });
const samePerms = (a: Perms | undefined, b: Perms | undefined) => {
  const na = normalize(a), nb = normalize(b);
  const keys = new Set([...Object.keys(na), ...Object.keys(nb)]);
  return [...keys].every(k => na[k] === nb[k]);
};
const sameLocais = (a: Draft | undefined, b: Draft | undefined) =>
  LOCAIS.every(l => samePerms(a?.locais[l], b?.locais[l]));
/* Camada de equipa: ausente ≠ 'none' (ausente herda, 'none' retira o acesso), por isso compara-se o valor cru. */
const sameLayer = (a: Perms | undefined, b: Perms | undefined) => MATRIX_KEYS.every(k => a?.[k] === b?.[k]);
const sameEquipas = (a: Draft | undefined, b: Draft | undefined) => EQUIPAS.every(e => sameLayer(a?.equipas[e], b?.equipas[e]));
const sameDraft = (a: Draft | undefined, b: Draft | undefined) => samePerms(a?.base, b?.base) && sameLocais(a, b) && sameEquipas(a, b);
/* Camadas a gravar: as editadas aqui (só chaves da matriz) mais as chaves fora da matriz e as equipas que a
 * matriz não conhece, tal como estavam. Camadas vazias não se gravam. */
const equipasForSave = (d: Draft | undefined, r: AppRole): Record<string, Perms> => {
  const out: Record<string, Perms> = { ...(r.permissions_equipa ?? {}) };
  EQUIPAS.forEach(e => {
    const layer = d?.equipas[e] ?? {};
    out[e] = { ...hiddenKeys(r.permissions_equipa?.[e]), ...Object.fromEntries(MATRIX_KEYS.filter(k => layer[k] !== undefined).map(k => [k, layer[k]])) };
  });
  Object.keys(out).forEach(e => { if (Object.keys(out[e] ?? {}).length === 0) delete out[e]; });
  return out;
};
const locaisForSave = (d: Draft | undefined): Record<string, Perms> =>
  Object.fromEntries(LOCAIS.map(l => [l, forSave(d?.locais[l])]));

export function RolesPanel({
  roles, users, loading, onSaved,
}: {
  roles: AppRole[]; users: AppUser[]; loading: boolean; onSaved: () => Promise<void>;
}) {
  // Funções de administrador têm acesso total e nada editável: ficam de fora.
  // As permissões por ação (ex.: 'lavagem:iniciar') só se mostram quando a base de dados já as suporta.
  const { capabilities, tabsPorLocal } = usePermissions();
  const editableRoles = useMemo(() => roles.filter(r => !r.is_admin), [roles]);
  const adminRoles = useMemo(() => roles.filter(r => r.is_admin), [roles]);

  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [delTarget, setDelTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Filtros de visualização (não alteram nada, só o que se vê).
  const [perfisOcultos, setPerfisOcultos] = useState<string[]>([]);
  const [locaisOcultos, setLocaisOcultos] = useState<string[]>([]);
  const [verBase, setVerBase] = useState(true);
  const [equipasVisiveis, setEquipasVisiveis] = useState<string[]>([...EQUIPAS]);
  const [soDiferencas, setSoDiferencas] = useState(false);

  // Repõe os rascunhos quando os dados guardados mudam. Um recarregamento não pode apagar alterações por
  // guardar: só se repõe o rascunho das funções cujo rascunho coincide com o guardado antes.
  const prevRoles = useRef<AppRole[]>([]);
  useEffect(() => {
    const antes = prevRoles.current;
    prevRoles.current = roles;
    setDrafts(prev => {
      const d: Record<string, Draft> = {};
      roles.forEach(r => {
        const old = antes.find(x => x.name === r.name);
        const sujo = !!prev[r.name] && !!old && !sameDraft(prev[r.name], draftOf(old, tabsPorLocal));
        d[r.name] = sujo ? prev[r.name] : draftOf(r, tabsPorLocal);
      });
      return d;
    });
  }, [roles, tabsPorLocal]);

  const savedOf = (name: string): Draft => {
    const r = roles.find(x => x.name === name);
    return r ? draftOf(r, tabsPorLocal) : { base: {}, locais: {}, equipas: {} };
  };
  const isDirty = (name: string) => !sameDraft(drafts[name], savedOf(name));
  const dirtyRoles = editableRoles.filter(r => isDirty(r.name));

  const getCell = (perfil: string, col: string, key: string): AccessLevel | undefined => {
    const d = drafts[perfil];
    return col === BASE ? level(d?.base, key)
      : col.startsWith(EQ) ? d?.equipas[col.slice(EQ.length)]?.[key]
      : level(d?.locais[col], key);
  };

  /* Define o nível de várias células de um perfil. Nas equipas, `undefined` volta a herdar do local. */
  const setCells = (perfil: string, cols: string[], keys: string[], value: AccessLevel | undefined) => {
    setDrafts(prev => {
      const cur = prev[perfil] ?? { base: {}, locais: {}, equipas: {} };
      const next: Draft = { base: { ...cur.base }, locais: { ...cur.locais }, equipas: { ...cur.equipas } };
      cols.forEach(col => {
        const alvo: Perms = col === BASE ? next.base
          : col.startsWith(EQ) ? (next.equipas[col.slice(EQ.length)] = { ...(next.equipas[col.slice(EQ.length)] ?? {}) })
          : (next.locais[col] = { ...(next.locais[col] ?? {}) });
        keys.forEach(k => { if (value === undefined) delete alvo[k]; else alvo[k] = value; });
      });
      return { ...prev, [perfil]: next };
    });
  };

  const copyFrom = (target: string, source: string) => {
    setDrafts(prev => {
      const src = prev[source]; const cur = prev[target];
      if (!src || !cur) return prev;
      const merge = (mine: Perms | undefined, from: Perms | undefined): Perms => ({ ...hiddenKeys(mine), ...normalize(from) });
      return { ...prev, [target]: {
        base: merge(cur.base, src.base),
        locais: Object.fromEntries(LOCAIS.map(l => [l, merge(cur.locais[l], src.locais[l])])),
        equipas: Object.fromEntries(EQUIPAS.map(e => [e, { ...(src.equipas[e] ?? {}) }])),
      } };
    });
    toast.success(`Permissões de "${source}" copiadas para "${target}" (por guardar).`);
  };

  const discardAll = () => setDrafts(prev => ({ ...prev, ...Object.fromEntries(dirtyRoles.map(r => [r.name, savedOf(r.name)])) }));

  const saveAll = async () => {
    setSaving(true);
    try {
      for (const r of dirtyRoles) {
        const d = drafts[r.name];
        // Só se envia a matriz por local quando algo mudou nos locais ou nas equipas: editar só a matriz base
        // não "congela" em entradas os locais que ainda seguem a regra anterior. Com equipas a mudar,
        // congelam-se: um local sem matriz própria segue a regra anterior e a camada da equipa não o alcançaria.
        const guardada = savedOf(r.name);
        const equipasMudaram = !sameEquipas(d, guardada);
        const locaisMudaram = LOCAIS.length > 0 && (!sameLocais(d, guardada) || equipasMudaram);
        await saveRole(r.name, forSave(d?.base), false, locaisMudaram ? locaisForSave(d) : undefined,
          equipasMudaram ? equipasForSave(d, r) : undefined);
      }
      toast.success(dirtyRoles.length === 1 ? `Permissões de "${dirtyRoles[0].name}" guardadas.` : `${dirtyRoles.length} funções guardadas.`);
      await onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível guardar as permissões.');
    } finally { setSaving(false); }
  };

  const confirmDelete = async () => {
    if (!delTarget) return;
    setDeleting(true);
    try {
      await deleteRole(delTarget);
      toast.success('Função eliminada.');
      setDelTarget(null);
      await onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível eliminar a função.');
    } finally { setDeleting(false); }
  };

  if (loading) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center"><Loader2 className="h-4 w-4 animate-spin" /> A carregar…</div>;
  }

  const toggle = (lista: string[], set: (v: string[]) => void, v: string) => set(lista.includes(v) ? lista.filter(x => x !== v) : [...lista, v]);
  const chip = (ativo: boolean) => cn('rounded-full border px-2.5 py-0.5 text-xs transition-colors',
    ativo ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground hover:bg-accent');
  const perfisVisiveis = editableRoles.filter(r => !perfisOcultos.includes(r.name));
  const renameRole_ = roles.find(r => r.name === renameTarget) ?? null;
  const renameMembers = renameTarget ? users.filter(u => u.perfil === renameTarget).length : 0;

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border bg-card p-3 space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 max-w-3xl">
            <h3 className="text-sm font-semibold leading-tight">Matriz de permissões</h3>
            <p className="text-xs text-muted-foreground">
              Cada coluna é um <strong>perfil</strong> num <strong>local</strong>; as linhas são os tabs. Clica numa célula para percorrer
              sem acesso → consulta → edição. Os números 👤 mostram quantos utilizadores são afetados (passa o rato para ver quem).
              A <strong>equipa</strong> sobrepõe-se ao local: <em>herda</em> = segue o local; preenchida = vale em todos os locais.
              O contorno <span className="rounded px-1 outline outline-2 outline-amber-500">âmbar</span> marca os locais que diferem da maioria do perfil.
            </p>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}><Plus className="h-3.5 w-3.5" /> Novo perfil</Button>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
          <div className="flex flex-wrap items-center gap-1"><span className="text-muted-foreground mr-1">Perfis</span>
            {editableRoles.map(r => <button key={r.name} type="button" aria-pressed={!perfisOcultos.includes(r.name)} onClick={() => toggle(perfisOcultos, setPerfisOcultos, r.name)} className={chip(!perfisOcultos.includes(r.name))}>{r.name}</button>)}
          </div>
          <div className="flex flex-wrap items-center gap-1"><span className="text-muted-foreground mr-1">Locais</span>
            {LOCAIS.map(l => <button key={l} type="button" aria-pressed={!locaisOcultos.includes(l)} onClick={() => toggle(locaisOcultos, setLocaisOcultos, l)} className={chip(!locaisOcultos.includes(l))}>{l}</button>)}
            <button type="button" aria-pressed={verBase} onClick={() => setVerBase(v => !v)} className={chip(verBase)}>Sem local</button>
          </div>
          <div className="flex flex-wrap items-center gap-1"><span className="text-muted-foreground mr-1">Equipas</span>
            {EQUIPAS.map(e => <button key={e} type="button" aria-pressed={equipasVisiveis.includes(e)} onClick={() => toggle(equipasVisiveis, setEquipasVisiveis, e)} className={chip(equipasVisiveis.includes(e))}>{e}</button>)}
          </div>
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input type="checkbox" checked={soDiferencas} onChange={e => setSoDiferencas(e.target.checked)} /> Só linhas com diferenças
          </label>
        </div>
        {adminRoles.length > 0 && (
          <p className="text-[11px] text-muted-foreground"><ShieldCheck className="h-3 w-3 inline mr-1" />{adminRoles.map(r => r.name).join(', ')}: acesso total, não editável.</p>
        )}
      </div>

      <PermissionsMatrix
        perfis={perfisVisiveis.map(r => ({ name: r.name, dirty: isDirty(r.name) }))}
        locais={LOCAIS.filter(l => !locaisOcultos.includes(l))}
        mostrarBase={verBase || LOCAIS.length === 0}
        equipas={EQUIPAS.filter(e => equipasVisiveis.includes(e))}
        users={users} allPerfis={editableRoles.map(r => r.name)} capabilities={capabilities} soDiferencas={soDiferencas}
        getCell={getCell} setCells={setCells}
        onRename={setRenameTarget} onDelete={setDelTarget} onCopyFrom={copyFrom}
      />

      {/* Barra de guardar (fixa em baixo quando há alterações) */}
      {dirtyRoles.length > 0 && (
        <div className="sticky bottom-3 z-40 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/50 bg-card/95 backdrop-blur px-3 py-2 shadow-lg">
          <span className="text-sm">
            <strong>{dirtyRoles.length}</strong> {dirtyRoles.length === 1 ? 'função com alterações' : 'funções com alterações'} por guardar
            <span className="text-muted-foreground"> ({dirtyRoles.map(r => r.name).join(', ')})</span>
          </span>
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="sm" className="gap-1.5" onClick={discardAll}><Undo2 className="h-3.5 w-3.5" /> Descartar tudo</Button>
            <Button size="sm" className="gap-1.5" onClick={saveAll} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Guardar
            </Button>
          </div>
        </div>
      )}

      <CreateRoleDialog
        open={createOpen} onOpenChange={setCreateOpen} roles={editableRoles} allNames={roles.map(r => r.name)} tabsPorLocal={tabsPorLocal}
        onCreated={async () => { await onSaved(); }}
      />

      <RenameRoleDialog
        role={renameRole_} allNames={roles.map(r => r.name)} memberCount={renameMembers}
        onClose={() => setRenameTarget(null)}
        onRenamed={async () => { await onSaved(); }}
      />

      <AlertDialog open={!!delTarget} onOpenChange={o => { if (!o) setDelTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar a função "{delTarget}"?</AlertDialogTitle>
            <AlertDialogDescription>Nenhum utilizador tem esta função. As permissões definidas perdem-se.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={e => { e.preventDefault(); confirmDelete(); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CreateRoleDialog({ open, onOpenChange, roles, allNames, tabsPorLocal, onCreated }: {
  open: boolean; onOpenChange: (v: boolean) => void; roles: AppRole[]; allNames: string[]; tabsPorLocal: readonly string[];
  onCreated: (name: string) => Promise<void>;
}) {
  const NONE = '__none__';
  const [name, setName] = useState('');
  const [from, setFrom] = useState(NONE);
  const [saving, setSaving] = useState(false);

  const close = (v: boolean) => { onOpenChange(v); if (!v) { setName(''); setFrom(NONE); } };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    if (allNames.some(x => x.toLowerCase() === n.toLowerCase())) { toast.error('Já existe uma função com esse nome.'); return; }
    setSaving(true);
    try {
      const src = from === NONE ? undefined : roles.find(r => r.name === from);
      const base = src ? normalize(src.permissions) : {};
      // Uma função nova guarda sempre a matriz de todos os locais (sem entrada, o local seguiria a regra anterior).
      const locais = Object.fromEntries(LOCAIS.map(l => [l, src ? normalize(permissoesDoLocal(src, l, tabsPorLocal)) : {}]));
      const equipas = src?.permissions_equipa && Object.keys(src.permissions_equipa).length > 0 ? src.permissions_equipa : undefined;
      await saveRole(n, base, false, LOCAIS.length > 0 ? locais : undefined, equipas);
      toast.success(`Função "${n}" criada.`);
      close(false);
      await onCreated(n);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível criar a função.');
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Nova função</DialogTitle>
          <DialogDescription>Começa do zero ou parte das permissões de uma função existente.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="role-name">Nome</Label>
            <Input id="role-name" value={name} onChange={e => setName(e.target.value)} placeholder="ex.: Lavador" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>Partir de</Label>
            <Select value={from} onValueChange={setFrom}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Sem permissões</SelectItem>
                {roles.map(r => <SelectItem key={r.name} value={r.name}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => close(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving || !name.trim()} className="gap-1.5">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Criar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* Funções com uma regra antiga ligada ao NOME (só vale enquanto as migrações de
 * permissões não estiverem aplicadas; ver lavagem-access.ts e eot-access.ts). */
const NOMES_COM_REGRA_ANTIGA = ['Lavador', 'Preparador', 'Vendedor', 'APV', 'Finance'];

function RenameRoleDialog({ role, allNames, memberCount, onClose, onRenamed }: {
  role: AppRole | null; allNames: string[]; memberCount: number;
  onClose: () => void; onRenamed: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (role) setName(role.name); }, [role]);

  const n = name.trim();
  const igual = !!role && n === role.name;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!role || !n || igual) return;
    if (allNames.some(x => x !== role.name && x.toLowerCase() === n.toLowerCase())) { toast.error('Já existe uma função com esse nome.'); return; }
    setSaving(true);
    try {
      await renameRole(role.name, n);
      toast.success(`"${role.name}" passou a "${n}".`);
      onClose();
      await onRenamed(n);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível renomear a função.');
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={!!role} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Renomear função</DialogTitle>
          <DialogDescription>
            {memberCount > 0
              ? `${memberCount === 1 ? 'O utilizador com esta função passa' : `Os ${memberCount} utilizadores com esta função passam`} para o novo nome; as permissões mantêm-se.`
              : 'As permissões mantêm-se.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="role-rename">Novo nome</Label>
            <Input id="role-rename" value={name} onChange={e => setName(e.target.value)} autoFocus />
          </div>
          {role && NOMES_COM_REGRA_ANTIGA.includes(role.name) && (
            <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
              "{role.name}" ainda tem uma regra antiga ligada ao nome (só em uso enquanto as migrações de permissões
              não estiverem aplicadas). Se já estão aplicadas, não há impacto.
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={saving || !n || igual} className="gap-1.5">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />} Renomear
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
