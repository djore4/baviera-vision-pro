import { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Save, Trash2, ShieldCheck, Undo2, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { AREAS, PERMISSION_TABS, SUB_PERMISSIONS, type AccessLevel, type AppRole, type AppUser } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
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
import { saveRole, deleteRole } from '@/lib/permissions';
import { usePermissions } from '@/contexts/PermissionsContext';

type Perms = Record<string, AccessLevel>;

const LEVELS: { value: AccessLevel; label: string; on: string }[] = [
  { value: 'none', label: 'Sem acesso', on: 'data-[state=on]:bg-muted data-[state=on]:text-foreground' },
  { value: 'view', label: 'Consulta', on: 'data-[state=on]:bg-sky-100 data-[state=on]:text-sky-800 dark:data-[state=on]:bg-sky-500/20 dark:data-[state=on]:text-sky-200' },
  { value: 'edit', label: 'Edição', on: 'data-[state=on]:bg-emerald-100 data-[state=on]:text-emerald-800 dark:data-[state=on]:bg-emerald-500/20 dark:data-[state=on]:text-emerald-200' },
];

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

export function RolesPanel({
  roles, users, loading, onSaved,
}: {
  roles: AppRole[]; users: AppUser[]; loading: boolean; onSaved: () => Promise<void>;
}) {
  // Funções de administrador têm acesso total e nada editável: ficam de fora.
  // As permissões por ação (ex.: 'lavagem:iniciar') só se mostram quando a base de
  // dados já as suporta: antes disso a interface usa as regras antigas por nome de
  // função, e guardar uma chave nova numa função não faria o que o utilizador espera.
  const { capabilities } = usePermissions();
  const editableRoles = useMemo(() => roles.filter(r => !r.is_admin), [roles]);
  const adminRoles = useMemo(() => roles.filter(r => r.is_admin), [roles]);

  const [drafts, setDrafts] = useState<Record<string, Perms>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Repõe os rascunhos quando os dados guardados mudam.
  useEffect(() => {
    const d: Record<string, Perms> = {};
    roles.forEach(r => { d[r.name] = { ...(r.permissions ?? {}) }; });
    setDrafts(d);
  }, [roles]);

  useEffect(() => {
    if (!selected || !editableRoles.some(r => r.name === selected)) setSelected(editableRoles[0]?.name ?? null);
  }, [editableRoles, selected]);

  const userCount = useMemo(() => {
    const m = new Map<string, AppUser[]>();
    users.forEach(u => { if (u.perfil) (m.get(u.perfil) ?? m.set(u.perfil, []).get(u.perfil)!).push(u); });
    return m;
  }, [users]);

  const savedOf = (name: string) => roles.find(r => r.name === name)?.permissions ?? {};
  const isDirty = (name: string) => !samePerms(drafts[name], savedOf(name));
  const dirtyRoles = editableRoles.filter(r => isDirty(r.name));

  const role = editableRoles.find(r => r.name === selected) ?? null;
  const draft = (role && drafts[role.name]) || {};
  const members = (role && userCount.get(role.name)) || [];

  const setLevel = (tabKeys: string[], value: AccessLevel) => {
    if (!role) return;
    setDrafts(prev => {
      const next = { ...(prev[role.name] ?? {}) };
      tabKeys.forEach(k => { next[k] = value; });
      return { ...prev, [role.name]: next };
    });
  };

  const discard = () => {
    if (!role) return;
    setDrafts(prev => ({ ...prev, [role.name]: { ...savedOf(role.name) } }));
  };

  const copyFrom = (source: string) => {
    if (!role) return;
    setDrafts(prev => ({ ...prev, [role.name]: { ...hiddenKeys(prev[role.name]), ...normalize(prev[source]) } }));
    toast.success(`Permissões de "${source}" copiadas (por guardar).`);
  };

  const saveAll = async () => {
    setSaving(true);
    try {
      for (const r of dirtyRoles) await saveRole(r.name, forSave(drafts[r.name]), false);
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

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-[220px_1fr] items-start">
        {/* Lista de funções */}
        <div className="rounded-xl border border-border bg-card p-2 space-y-1 md:sticky md:top-2">
          {editableRoles.map(r => {
            const n = userCount.get(r.name)?.length ?? 0;
            const active = r.name === selected;
            return (
              <button
                key={r.name} type="button" onClick={() => setSelected(r.name)}
                className={cn('w-full flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors',
                  active ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}
              >
                <span className="truncate font-medium">{r.name}</span>
                <span className="flex items-center gap-1.5 shrink-0">
                  {isDirty(r.name) && <span className={cn('h-2 w-2 rounded-full', active ? 'bg-primary-foreground' : 'bg-amber-500')} title="Alterações por guardar" />}
                  <span className={cn('text-[11px] tabular-nums', active ? 'text-primary-foreground/80' : 'text-muted-foreground')}>{n}</span>
                </span>
              </button>
            );
          })}
          <Button variant="outline" size="sm" className="w-full gap-1.5 mt-1" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Nova função
          </Button>
          {adminRoles.length > 0 && (
            <p className="px-2 pt-2 text-[11px] text-muted-foreground leading-snug">
              <ShieldCheck className="h-3 w-3 inline mr-1" />
              {adminRoles.map(r => r.name).join(', ')}: acesso total, não editável.
            </p>
          )}
        </div>

        {/* Detalhe da função */}
        {!role ? (
          <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">Cria ou escolhe uma função.</div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-xl border border-border bg-card p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-base font-bold leading-tight truncate">{role.name}</h3>
                  <p className="text-xs text-muted-foreground">
                    {members.length === 0 ? 'Nenhum utilizador com esta função.' : (
                      <>
                        {members.length} {members.length === 1 ? 'utilizador' : 'utilizadores'}:{' '}
                        {members.slice(0, 5).map(u => u.nome || u.email).join(', ')}{members.length > 5 ? ` e mais ${members.length - 5}` : ''}
                      </>
                    )}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Select value="" onValueChange={copyFrom}>
                    <SelectTrigger className="h-8 w-[170px] text-xs gap-1"><Copy className="h-3.5 w-3.5 shrink-0" /><SelectValue placeholder="Copiar de…" /></SelectTrigger>
                    <SelectContent>
                      {editableRoles.filter(r => r.name !== role.name).map(r => <SelectItem key={r.name} value={r.name}>{r.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost" size="icon" className="h-8 w-8 text-destructive"
                    onClick={() => setDelOpen(true)} disabled={members.length > 0}
                    title={members.length > 0 ? 'Muda primeiro a função destes utilizadores' : 'Eliminar função'}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            {AREAS.map(area => {
              const tabs = PERMISSION_TABS.filter(t => t.area === area.key);
              if (tabs.length === 0) return null;
              const withAccess = tabs.filter(t => level(draft, t.key) !== 'none').length;
              const keys = tabs.map(t => t.key);
              return (
                <div key={area.key} className="rounded-xl border border-border bg-card overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-2 bg-muted/40 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <h4 className={cn('text-xs font-bold uppercase tracking-wide', area.style === 'admin' ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground')}>{area.label}</h4>
                      <span className="text-[11px] text-muted-foreground tabular-nums">{withAccess}/{tabs.length} com acesso</span>
                    </div>
                    <div className="flex items-center gap-1 text-[11px]">
                      <span className="text-muted-foreground mr-0.5">Todos:</span>
                      {LEVELS.map(l => (
                        <button key={l.value} type="button" onClick={() => setLevel(keys, l.value)}
                          className="rounded border border-border bg-background px-1.5 py-0.5 hover:bg-accent">{l.label}</button>
                      ))}
                    </div>
                  </div>
                  <ul className="divide-y divide-border/60">
                    {tabs.map(t => (
                      <li key={t.key} className="px-3 py-1.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-sm font-medium">{t.label}</span>
                          <ToggleGroup
                            type="single" size="sm" variant="outline" value={level(draft, t.key)}
                            onValueChange={v => v && setLevel([t.key], v as AccessLevel)}
                            className="gap-0"
                          >
                            {LEVELS.map(l => (
                              <ToggleGroupItem key={l.value} value={l.value} className={cn('h-7 px-2.5 text-xs rounded-none first:rounded-l-md last:rounded-r-md -ml-px first:ml-0', l.on)}>
                                {l.label}
                              </ToggleGroupItem>
                            ))}
                          </ToggleGroup>
                        </div>
                        {/* Permissões finas do tab (ex.: Lavagem): ações atribuídas por função. */}
                        {capabilities.lavagemGranular && SUB_PERMISSIONS.filter(sp => sp.parent === t.key).map(sp => (
                          <div key={sp.key} className="mt-1 ml-3 flex flex-wrap items-center justify-between gap-2 border-l-2 border-border pl-3">
                            <span className="text-xs text-muted-foreground" title={sp.hint}>{sp.label}</span>
                            <ToggleGroup
                              type="single" size="sm" variant="outline"
                              value={level(draft, sp.key) === 'none' ? 'none' : 'edit'}
                              onValueChange={v => v && setLevel([sp.key], v as AccessLevel)}
                              className="gap-0"
                            >
                              <ToggleGroupItem value="none" className={cn('h-6 px-2 text-[11px] rounded-none first:rounded-l-md last:rounded-r-md', LEVELS[0].on)}>Não</ToggleGroupItem>
                              <ToggleGroupItem value="edit" className={cn('h-6 px-2 text-[11px] rounded-none first:rounded-l-md last:rounded-r-md -ml-px', LEVELS[2].on)}>Sim</ToggleGroupItem>
                            </ToggleGroup>
                          </div>
                        ))}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Barra de guardar (fixa em baixo quando há alterações) */}
      {dirtyRoles.length > 0 && (
        <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/50 bg-card/95 backdrop-blur px-3 py-2 shadow-lg">
          <span className="text-sm">
            <strong>{dirtyRoles.length}</strong> {dirtyRoles.length === 1 ? 'função com alterações' : 'funções com alterações'} por guardar
            <span className="text-muted-foreground"> ({dirtyRoles.map(r => r.name).join(', ')})</span>
          </span>
          <div className="flex items-center gap-1.5">
            {role && isDirty(role.name) && (
              <Button variant="ghost" size="sm" className="gap-1.5" onClick={discard}><Undo2 className="h-3.5 w-3.5" /> Descartar {role.name}</Button>
            )}
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

      <AlertDialog open={delOpen} onOpenChange={setDelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar a função "{role?.name}"?</AlertDialogTitle>
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
      const base = from === NONE ? {} : normalize(roles.find(r => r.name === from)?.permissions);
      await saveRole(n, base, false);
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
