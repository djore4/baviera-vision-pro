import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Pencil, Plus, Save, Trash2, TriangleAlert, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { PERMISSION_TABS, SUB_PERMISSIONS, type AccessLevel, type AppRole, type AppUser } from '@/lib/permissions';
import { PerfilEditor } from '@/components/users/PerfilEditor';
import { comNivel, comOnde, type Onde } from '@/lib/perfil-linha';
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
import { saveRoleSimples, deleteRole, renameRole } from '@/lib/permissions';
import { usePermissions } from '@/contexts/PermissionsContext';

type Perms = Record<string, AccessLevel>;

/* Rascunho de um perfil: a matriz "completa" (Aveiro e contas sem local) e a de "outros locais". */
interface Draft { completo: Perms; outros: Perms }

const draftOf = (r: AppRole): Draft => ({ completo: { ...(r.permissions ?? {}) }, outros: { ...(r.permissions_outros ?? {}) } });

const level = (p: Perms | undefined, key: string): AccessLevel => p?.[key] ?? 'none';

/* Chaves editáveis na matriz: os tabs e as suas permissões finas ('lavagem:iniciar'…). */
const MATRIX_KEYS = [...PERMISSION_TABS.map(t => t.key), ...SUB_PERMISSIONS.map(sp => sp.key)];
/* Chaves com valor 'none' equivalem a chave ausente: normaliza para comparar. */
const normalize = (p: Perms | undefined): Perms => {
  const out: Perms = {};
  MATRIX_KEYS.forEach(k => { const v = level(p, k); if (v !== 'none') out[k] = v; });
  return out;
};
/* Chaves fora da matriz (tabs desativados, arrumados no Arquivo ou só de admin) não se editam aqui:
 * preservam-se tal como estão ao guardar. */
const hiddenKeys = (p: Perms | undefined): Perms => {
  const known = new Set(MATRIX_KEYS);
  const extra: Perms = {};
  Object.entries(p ?? {}).forEach(([k, v]) => { if (!known.has(k)) extra[k] = v; });
  return extra;
};
const forSave = (p: Perms | undefined): Perms => ({ ...hiddenKeys(p), ...normalize(p) });
const samePerms = (a: Perms | undefined, b: Perms | undefined) => {
  const na = normalize(a), nb = normalize(b);
  return [...new Set([...Object.keys(na), ...Object.keys(nb)])].every(k => na[k] === nb[k]);
};
const sameDraft = (a: Draft | undefined, b: Draft | undefined) => samePerms(a?.completo, b?.completo) && samePerms(a?.outros, b?.outros);

export function RolesPanel({
  roles, users, loading, onSaved,
}: {
  roles: AppRole[]; users: AppUser[]; loading: boolean; onSaved: () => Promise<void>;
}) {
  // Funções de administrador têm acesso total e nada editável: ficam de fora.
  const { capabilities } = usePermissions();
  const editableRoles = useMemo(() => roles.filter(r => !r.is_admin), [roles]);
  // Perfis que ainda seguem o modelo antigo (migração 20261123120000 por aplicar): não se editam aqui.
  const porMigrar = useMemo(() => editableRoles.filter(r => !r.modelo_simples), [editableRoles]);

  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Repõe os rascunhos quando os dados guardados mudam, sem apagar alterações por guardar.
  const prevRoles = useRef<AppRole[]>([]);
  useEffect(() => {
    const antes = prevRoles.current;
    prevRoles.current = roles;
    setDrafts(prev => {
      const d: Record<string, Draft> = {};
      roles.forEach(r => {
        const old = antes.find(x => x.name === r.name);
        const sujo = !!prev[r.name] && !!old && !sameDraft(prev[r.name], draftOf(old));
        d[r.name] = sujo ? prev[r.name] : draftOf(r);
      });
      return d;
    });
  }, [roles]);

  useEffect(() => {
    if (!selected || !editableRoles.some(r => r.name === selected)) setSelected(editableRoles[0]?.name ?? null);
  }, [editableRoles, selected]);

  const savedOf = (name: string): Draft => { const r = roles.find(x => x.name === name); return r ? draftOf(r) : { completo: {}, outros: {} }; };
  const isDirty = (name: string) => !sameDraft(drafts[name], savedOf(name));
  const dirtyRoles = editableRoles.filter(r => isDirty(r.name));

  const role = editableRoles.find(r => r.name === selected) ?? null;
  const draft = role ? drafts[role.name] : undefined;
  const members = role ? users.filter(u => u.perfil === role.name) : [];

  /* Um tab tem UM nível e um "onde" (ver perfil-linha.ts): converte-se para as duas matrizes. */
  const aplicar = (keys: string[], f: (c: AccessLevel, o: AccessLevel) => [AccessLevel, AccessLevel]) => {
    if (!role) return;
    setDrafts(prev => {
      const cur = prev[role.name] ?? { completo: {}, outros: {} };
      const next: Draft = { completo: { ...cur.completo }, outros: { ...cur.outros } };
      keys.forEach(k => { const [c, o] = f(level(cur.completo, k), level(cur.outros, k)); next.completo[k] = c; next.outros[k] = o; });
      return { ...prev, [role.name]: next };
    });
  };
  const setNivel = (keys: string[], nivel: AccessLevel) => aplicar(keys, (c, o) => comNivel(c, o, nivel));
  const setOnde = (key: string, onde: Onde) => aplicar([key], (c, o) => comOnde(c, o, onde));

  const copyFrom = (source: string) => {
    if (!role) return;
    setDrafts(prev => {
      const src = prev[source]; const cur = prev[role.name];
      if (!src || !cur) return prev;
      return { ...prev, [role.name]: { completo: { ...hiddenKeys(cur.completo), ...normalize(src.completo) }, outros: { ...hiddenKeys(cur.outros), ...normalize(src.outros) } } };
    });
    toast.success(`Permissões de "${source}" copiadas (por guardar).`);
  };

  const discardAll = () => setDrafts(prev => ({ ...prev, ...Object.fromEntries(dirtyRoles.map(r => [r.name, savedOf(r.name)])) }));

  const saveAll = async () => {
    setSaving(true);
    try {
      for (const r of dirtyRoles) {
        const d = drafts[r.name];
        await saveRoleSimples(r.name, forSave(d?.completo), forSave(d?.outros));
      }
      toast.success(dirtyRoles.length === 1 ? `Permissões de "${dirtyRoles[0].name}" guardadas.` : `${dirtyRoles.length} funções guardadas.`);
      await onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível guardar as permissões.');
    } finally { setSaving(false); }
  };

  const confirmDelete = async () => {
    if (!role) return;
    setDeleting(true);
    try {
      await deleteRole(role.name);
      toast.success('Função eliminada.');
      setDelOpen(false);
      setSelected(null);
      await onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível eliminar a função.');
    } finally { setDeleting(false); }
  };

  if (loading) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center"><Loader2 className="h-4 w-4 animate-spin" /> A carregar…</div>;
  }

  if (porMigrar.length > 0) {
    return (
      <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 space-y-1.5">
        <h3 className="text-sm font-semibold flex items-center gap-1.5"><TriangleAlert className="h-4 w-4" /> Falta aplicar a migração das permissões</h3>
        <p className="text-sm">
          {porMigrar.length === 1 ? 'O perfil' : 'Os perfis'} <strong>{porMigrar.map(r => r.name).join(', ')}</strong> ainda seguem o modelo antigo.
          Aplica a migração <code>20261123120000_permissoes_simples.sql</code> no Supabase (converte-os mantendo o acesso de cada conta) e recarrega esta página.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border bg-card p-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={selected ?? ''} onValueChange={setSelected}>
            <SelectTrigger className="h-10 flex-1 min-w-[12rem] text-base font-semibold" aria-label="Perfil">
              <SelectValue placeholder="Escolhe um perfil" />
            </SelectTrigger>
            <SelectContent>
              {editableRoles.map(r => (
                <SelectItem key={r.name} value={r.name}>{r.name}{isDirty(r.name) ? ' •' : ''} ({users.filter(u => u.perfil === r.name).length})</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}><Plus className="h-3.5 w-3.5" /> Novo perfil</Button>
        </div>
        {role && (
          <>
            <p className="text-xs text-muted-foreground">
              {members.length === 0 ? 'Nenhum utilizador com este perfil.' : `${members.length} ${members.length === 1 ? 'utilizador' : 'utilizadores'}: ${members.slice(0, 5).map(u => u.nome || u.email).join(', ')}${members.length > 5 ? ` e mais ${members.length - 5}` : ''}`}
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              <Select value="" onValueChange={copyFrom}>
                <SelectTrigger className="h-8 w-[150px] text-xs gap-1" aria-label="Copiar de"><SelectValue placeholder="Copiar de…" /></SelectTrigger>
                <SelectContent>{editableRoles.filter(r => r.name !== role.name).map(r => <SelectItem key={r.name} value={r.name}>{r.name}</SelectItem>)}</SelectContent>
              </Select>
              <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={() => setRenameOpen(true)} disabled={isDirty(role.name)}
                title={isDirty(role.name) ? 'Guarda ou descarta as alterações antes de renomear' : undefined}><Pencil className="h-3.5 w-3.5" /> Renomear</Button>
              <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-destructive" onClick={() => setDelOpen(true)} disabled={members.length > 0}
                title={members.length > 0 ? 'Muda primeiro o perfil destas contas' : undefined}><Trash2 className="h-3.5 w-3.5" /> Eliminar</Button>
            </div>
          </>
        )}
      </div>

      {role && draft && (
        <PerfilEditor
          draft={draft} capabilities={capabilities}
          onNivel={setNivel} onOnde={setOnde}
        />
      )}

      {dirtyRoles.length > 0 && (
        <div className="sticky bottom-3 z-40 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/50 bg-card/95 backdrop-blur px-3 py-2 shadow-lg">
          <span className="text-sm">
            <strong>{dirtyRoles.length}</strong> {dirtyRoles.length === 1 ? 'perfil com alterações' : 'perfis com alterações'} por guardar
            <span className="text-muted-foreground"> ({dirtyRoles.map(r => r.name).join(', ')})</span>
          </span>
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="sm" className="gap-1.5" onClick={discardAll}><Undo2 className="h-3.5 w-3.5" /> Descartar</Button>
            <Button size="sm" className="gap-1.5" onClick={saveAll} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Guardar
            </Button>
          </div>
        </div>
      )}

      <CreateRoleDialog
        open={createOpen} onOpenChange={setCreateOpen} roles={editableRoles} allNames={roles.map(r => r.name)}
        onCreated={async name => { await onSaved(); setSelected(name); }}
      />

      <RenameRoleDialog
        role={renameOpen ? role : null} allNames={roles.map(r => r.name)} memberCount={members.length}
        onClose={() => setRenameOpen(false)}
        onRenamed={async name => { await onSaved(); setSelected(name); }}
      />

      <AlertDialog open={delOpen} onOpenChange={setDelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar o perfil "{role?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>Nenhum utilizador tem este perfil. As permissões definidas perdem-se.</AlertDialogDescription>
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

function CreateRoleDialog({ open, onOpenChange, roles, allNames, onCreated }: {
  open: boolean; onOpenChange: (v: boolean) => void; roles: AppRole[]; allNames: string[];
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
      await saveRoleSimples(n, src ? normalize(src.permissions) : {}, src ? normalize(src.permissions_outros) : {});
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
