import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Pencil, Plus, Save, Trash2, TriangleAlert, Undo2, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { locaisDoGrupo } from '@/lib/locations';
import { SEM_LOCAL, type AccessLevel, type AppRole, type AppUser, type Matriz } from '@/lib/permissions';
import { MatrizPerfil } from '@/components/users/MatrizPerfil';
import { definir, copiarLocal, iguais, limpa } from '@/lib/matriz';
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
import { saveRoleMatriz, deleteRole, renameRole } from '@/lib/permissions';
import { usePermissions } from '@/contexts/PermissionsContext';

const LOCAIS = [...locaisDoGrupo(), SEM_LOCAL];
const nomeLocal = (l: string) => (l === SEM_LOCAL ? 'Sem local' : l);

export function RolesPanel({
  roles, users, loading, onSaved,
}: {
  roles: AppRole[]; users: AppUser[]; loading: boolean; onSaved: () => Promise<void>;
}) {
  // Perfis de administrador têm acesso total e nada editável: ficam de fora.
  const { capabilities } = usePermissions();
  const editableRoles = useMemo(() => roles.filter(r => !r.is_admin), [roles]);
  // Perfis que ainda seguem o modelo antigo (migração 20261124100000 por aplicar): não se editam aqui.
  const porMigrar = useMemo(() => editableRoles.filter(r => !r.modelo_matriz), [editableRoles]);

  const [drafts, setDrafts] = useState<Record<string, Matriz>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [finas, setFinas] = useState(false);
  const [soComContas, setSoComContas] = useState(false);
  const [copiarDe, setCopiarDe] = useState('');
  const [copiarPara, setCopiarPara] = useState('');
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
      const d: Record<string, Matriz> = {};
      roles.forEach(r => {
        const old = antes.find(x => x.name === r.name);
        const sujo = !!prev[r.name] && !!old && !iguais(prev[r.name], old.permissions_matriz);
        d[r.name] = sujo ? prev[r.name] : limpa(r.permissions_matriz);
      });
      return d;
    });
  }, [roles]);

  useEffect(() => {
    if (!selected || !editableRoles.some(r => r.name === selected)) setSelected(editableRoles[0]?.name ?? null);
  }, [editableRoles, selected]);

  const savedOf = (name: string): Matriz => limpa(roles.find(x => x.name === name)?.permissions_matriz);
  const isDirty = (name: string) => !iguais(drafts[name], savedOf(name));
  const dirtyRoles = editableRoles.filter(r => isDirty(r.name));

  const role = editableRoles.find(r => r.name === selected) ?? null;
  const matriz = role ? drafts[role.name] ?? {} : {};
  const members = role ? users.filter(u => u.perfil === role.name) : [];

  const mudar = (f: (m: Matriz) => Matriz) => { if (role) setDrafts(prev => ({ ...prev, [role.name]: f(prev[role.name] ?? {}) })); };
  const onCells = (locais: string[], equipas: string[], tabs: string[], valor: AccessLevel) => mudar(m => definir(m, locais, equipas, tabs, valor));

  const copiarColuna = () => {
    if (!copiarDe || !copiarPara || copiarDe === copiarPara) return;
    mudar(m => copiarLocal(m, copiarDe, copiarPara));
    toast.success(`${nomeLocal(copiarDe)} copiado para ${nomeLocal(copiarPara)} (por guardar).`);
  };

  const copyFrom = (source: string) => {
    if (!role) return;
    setDrafts(prev => ({ ...prev, [role.name]: JSON.parse(JSON.stringify(limpa(prev[source]))) }));
    toast.success(`Permissões de "${source}" copiadas (por guardar).`);
  };

  const discardAll = () => setDrafts(prev => ({ ...prev, ...Object.fromEntries(dirtyRoles.map(r => [r.name, savedOf(r.name)])) }));

  const saveAll = async () => {
    setSaving(true);
    try {
      for (const r of dirtyRoles) await saveRoleMatriz(r.name, drafts[r.name] ?? {});
      toast.success(dirtyRoles.length === 1 ? `Permissões de "${dirtyRoles[0].name}" guardadas.` : `${dirtyRoles.length} perfis guardados.`);
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
      toast.success('Perfil eliminado.');
      setDelOpen(false);
      setSelected(null);
      await onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível eliminar o perfil.');
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
          Aplica a migração <code>20261124100000_permissoes_matriz.sql</code> no Supabase (converte-os mantendo exatamente o acesso de cada conta) e recarrega esta página.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={selected ?? ''} onValueChange={setSelected}>
          <SelectTrigger className="h-9 w-[16rem] font-semibold" aria-label="Perfil"><SelectValue placeholder="Escolhe um perfil" /></SelectTrigger>
          <SelectContent>
            {editableRoles.map(r => <SelectItem key={r.name} value={r.name}>{r.name}{isDirty(r.name) ? ' •' : ''} ({users.filter(u => u.perfil === r.name).length})</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => setCreateOpen(true)}><Plus className="h-3.5 w-3.5" /> Novo perfil</Button>
        {role && (
          <>
            <Select value="" onValueChange={copyFrom}>
              <SelectTrigger className="h-9 w-[10.5rem] text-xs" aria-label="Copiar de"><SelectValue placeholder="Copiar perfil de…" /></SelectTrigger>
              <SelectContent>{editableRoles.filter(r => r.name !== role.name).map(r => <SelectItem key={r.name} value={r.name}>{r.name}</SelectItem>)}</SelectContent>
            </Select>
            <Button variant="ghost" size="sm" className="h-9 gap-1.5" onClick={() => setRenameOpen(true)} disabled={isDirty(role.name)}
              title={isDirty(role.name) ? 'Guarda ou descarta as alterações antes de renomear' : undefined}><Pencil className="h-3.5 w-3.5" /> Renomear</Button>
            <Button variant="ghost" size="sm" className="h-9 gap-1.5 text-destructive" onClick={() => setDelOpen(true)} disabled={members.length > 0}
              title={members.length > 0 ? 'Muda primeiro o perfil destas contas' : undefined}><Trash2 className="h-3.5 w-3.5" /> Eliminar</Button>
          </>
        )}
      </div>

      {role && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs text-muted-foreground">
            <span>
              <strong className="text-foreground">{role.name}</strong>: cada local tem as suas equipas. <strong>V</strong> = consulta, <strong>E</strong> = edição, <strong>—</strong> = sem acesso.
              Clica numa célula para mudar; clica no nome do tab para aplicar a toda a linha. O número por baixo é quantas contas deste perfil estão nessa célula.
            </span>
            <span className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-1.5 cursor-pointer select-none"><input type="checkbox" checked={soComContas} onChange={e => setSoComContas(e.target.checked)} /> Só colunas com contas</label>
              <label className="flex items-center gap-1.5 cursor-pointer select-none"><input type="checkbox" checked={finas} onChange={e => setFinas(e.target.checked)} /> Permissões finas</label>
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">Copiar local</span>
            <Select value={copiarDe} onValueChange={setCopiarDe}>
              <SelectTrigger className="h-8 w-[7.5rem] text-xs" aria-label="Copiar do local"><SelectValue placeholder="de…" /></SelectTrigger>
              <SelectContent>{LOCAIS.map(l => <SelectItem key={l} value={l}>{nomeLocal(l)}</SelectItem>)}</SelectContent>
            </Select>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
            <Select value={copiarPara} onValueChange={setCopiarPara}>
              <SelectTrigger className="h-8 w-[7.5rem] text-xs" aria-label="Copiar para o local"><SelectValue placeholder="para…" /></SelectTrigger>
              <SelectContent>{LOCAIS.filter(l => l !== copiarDe).map(l => <SelectItem key={l} value={l}>{nomeLocal(l)}</SelectItem>)}</SelectContent>
            </Select>
            <Button type="button" size="sm" variant="outline" className="h-8 px-2 text-xs" disabled={!copiarDe || !copiarPara || copiarDe === copiarPara} onClick={copiarColuna}>Copiar</Button>
          </div>
          <MatrizPerfil perfil={role.name} matriz={matriz} users={users} finas={finas} capabilities={capabilities} onCells={onCells} soComContas={soComContas} />
        </>
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
      await saveRoleMatriz(n, src ? limpa(src.permissions_matriz) : {});
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
