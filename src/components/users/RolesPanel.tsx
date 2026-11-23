import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Pencil, Plus, Save, ShieldCheck, TriangleAlert, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { PERMISSION_TABS, SUB_PERMISSIONS, LOCAL_ACESSO_COMPLETO, type AccessLevel, type AppRole, type AppUser } from '@/lib/permissions';
import { PermissionsMatrix, type Coluna } from '@/components/users/PermissionsMatrix';
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
import { cn } from '@/lib/utils';
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
  // As permissões por ação (ex.: 'lavagem:iniciar') só se mostram quando a base de dados já as suporta.
  const { capabilities } = usePermissions();
  const editableRoles = useMemo(() => roles.filter(r => !r.is_admin), [roles]);
  const adminRoles = useMemo(() => roles.filter(r => r.is_admin), [roles]);
  // Perfis que ainda seguem o modelo antigo (migração 20261123120000 por aplicar): não se editam aqui.
  const porMigrar = useMemo(() => editableRoles.filter(r => !r.modelo_simples), [editableRoles]);

  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [delTarget, setDelTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [perfisOcultos, setPerfisOcultos] = useState<string[]>([]);
  const [soDiferencas, setSoDiferencas] = useState(false);

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

  const savedOf = (name: string): Draft => { const r = roles.find(x => x.name === name); return r ? draftOf(r) : { completo: {}, outros: {} }; };
  const isDirty = (name: string) => !sameDraft(drafts[name], savedOf(name));
  const dirtyRoles = editableRoles.filter(r => isDirty(r.name));

  const getCell = (perfil: string, col: Coluna, key: string): AccessLevel => level(drafts[perfil]?.[col], key);

  const setCells = (perfil: string, cols: Coluna[], keys: string[], value: AccessLevel) => {
    setDrafts(prev => {
      const cur = prev[perfil] ?? { completo: {}, outros: {} };
      const next: Draft = { completo: { ...cur.completo }, outros: { ...cur.outros } };
      cols.forEach(c => keys.forEach(k => { next[c][k] = value; }));
      return { ...prev, [perfil]: next };
    });
  };

  const copyFrom = (target: string, source: string) => {
    setDrafts(prev => {
      const src = prev[source]; const cur = prev[target];
      if (!src || !cur) return prev;
      return { ...prev, [target]: { completo: { ...hiddenKeys(cur.completo), ...normalize(src.completo) }, outros: { ...hiddenKeys(cur.outros), ...normalize(src.outros) } } };
    });
    toast.success(`Permissões de "${source}" copiadas para "${target}" (por guardar).`);
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
              Cada perfil tem duas colunas: <strong>{LOCAL_ACESSO_COMPLETO}</strong> (e contas sem local) e <strong>Outros locais</strong> (Maia, Porto, Gaia, Feira).
              Quem opera em vários locais fica com o nível mais alto. Clica numa célula para percorrer sem acesso → consulta → edição.
              Os números 👤 mostram quantas contas cada coluna afeta (passa o rato para ver quem).
              O contorno <span className="rounded px-1 outline outline-2 outline-amber-500">âmbar</span> marca os tabs em que "Outros locais" difere de {LOCAL_ACESSO_COMPLETO}.
            </p>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}><Plus className="h-3.5 w-3.5" /> Novo perfil</Button>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
          <div className="flex flex-wrap items-center gap-1"><span className="text-muted-foreground mr-1">Perfis</span>
            {editableRoles.map(r => <button key={r.name} type="button" aria-pressed={!perfisOcultos.includes(r.name)}
              onClick={() => setPerfisOcultos(l => l.includes(r.name) ? l.filter(x => x !== r.name) : [...l, r.name])} className={chip(!perfisOcultos.includes(r.name))}>{r.name}</button>)}
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
        users={users} allPerfis={editableRoles.map(r => r.name)} capabilities={capabilities} soDiferencas={soDiferencas}
        getCell={getCell} setCells={setCells}
        onRename={setRenameTarget} onDelete={setDelTarget} onCopyFrom={copyFrom}
      />

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
        open={createOpen} onOpenChange={setCreateOpen} roles={editableRoles} allNames={roles.map(r => r.name)}
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
