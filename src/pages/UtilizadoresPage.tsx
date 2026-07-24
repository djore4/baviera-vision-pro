import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  UserCog, UserPlus, Loader2, Trash2, KeyRound, Save, ShieldCheck, Users as UsersIcon, X, Plus,
} from 'lucide-react';
import { toast } from 'sonner';
import { usePermissions } from '@/contexts/PermissionsContext';
import {
  TABS, type AccessLevel, type AppRole, type AppUser,
  listRoles, listUsers, createUser, updateUser, deleteUser, saveRole, deleteRole,
} from '@/lib/permissions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';

/* ── Tab Utilizadores (admin) ─────────────────────────────────────────────────
 * Gestão de perfis: criar/eliminar utilizadores (com credenciais de login) e
 * definir o acesso aos vários tabs por função (consulta / edição / sem acesso).
 * ──────────────────────────────────────────────────────────────────────────── */

const ACCESS_OPTIONS: { value: AccessLevel; label: string }[] = [
  { value: 'none', label: 'Sem acesso' },
  { value: 'view', label: 'Consulta' },
  { value: 'edit', label: 'Edição' },
];

const asArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(String) : (v == null || v === '' ? [] : [String(v)]);
const joinArr = (v: unknown) => asArray(v).join(', ');
const parseArr = (s: string) => s.split(',').map(x => x.trim()).filter(Boolean);

export default function UtilizadoresPage() {
  const { reload: reloadPerms } = usePermissions();

  const [users, setUsers] = useState<AppUser[]>([]);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [us, rs] = await Promise.all([listUsers(), listRoles()]);
      setUsers(us);
      setRoles(rs);
    } catch (e) {
      toast.error('Não foi possível carregar os utilizadores.');
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const roleNames = useMemo(() => roles.map(r => r.name), [roles]);

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <UserCog className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-bold tracking-tight">Utilizadores</h1>
        <span className="text-xs text-muted-foreground">· Perfis e permissões de acesso</span>
      </div>

      <UsersSection
        users={users}
        loading={loading}
        roleNames={roleNames}
        onChanged={load}
      />

      <RolesMatrix
        roles={roles}
        loading={loading}
        onSaved={async () => { await load(); reloadPerms(); }}
      />
    </div>
  );
}

/* ── Secção: utilizadores ──────────────────────────────────────────────────── */

function UsersSection({
  users, loading, roleNames, onChanged,
}: {
  users: AppUser[]; loading: boolean; roleNames: string[]; onChanged: () => Promise<void>;
}) {
  const [showForm, setShowForm] = useState(false);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [perfil, setPerfil] = useState('');
  const [local, setLocal] = useState('');
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | number | null>(null);

  const resetForm = () => { setNome(''); setEmail(''); setPassword(''); setPerfil(''); setLocal(''); };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) { toast.error('Email e password são obrigatórios.'); return; }
    if (!perfil) { toast.error('Escolhe a função.'); return; }
    if (password.length < 6) { toast.error('A password deve ter pelo menos 6 caracteres.'); return; }
    setSaving(true);
    try {
      await createUser({ nome: nome.trim(), email: email.trim().toLowerCase(), password, perfil, local: parseArr(local) });
      toast.success('Utilizador criado.');
      resetForm();
      setShowForm(false);
      await onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível criar o utilizador.');
    } finally {
      setSaving(false);
    }
  };

  const handleRoleChange = async (u: AppUser, newRole: string) => {
    setBusyId(u.id);
    try {
      await updateUser(u.id, { perfil: newRole });
      toast.success('Função atualizada.');
      await onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível atualizar.');
    } finally {
      setBusyId(null);
    }
  };

  const handleResetPassword = async (u: AppUser) => {
    const np = window.prompt(`Nova password para ${u.email}:`);
    if (!np) return;
    if (np.length < 6) { toast.error('A password deve ter pelo menos 6 caracteres.'); return; }
    setBusyId(u.id);
    try {
      await updateUser(u.id, {}, np);
      toast.success('Password reposta.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível repor a password.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (u: AppUser) => {
    if (!window.confirm(`Eliminar ${u.nome || u.email}? Esta ação remove também o acesso de login.`)) return;
    setBusyId(u.id);
    try {
      await deleteUser(u.id);
      toast.success('Utilizador eliminado.');
      await onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível eliminar.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <UsersIcon className="h-4 w-4" /> Contas
            <span className="text-xs font-normal text-muted-foreground">({users.length})</span>
          </CardTitle>
          <Button variant="outline" size="sm" className="h-7 gap-1.5" onClick={() => setShowForm(v => !v)}>
            {showForm ? <X className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />}
            {showForm ? 'Cancelar' : 'Novo utilizador'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {showForm && (
          <form onSubmit={handleCreate} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 rounded-md border bg-muted/30 p-3">
            <div className="space-y-1.5">
              <Label htmlFor="u-nome">Nome</Label>
              <Input id="u-nome" value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome completo" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="u-email">Email</Label>
              <Input id="u-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@caetano.pt" autoComplete="off" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="u-pass">Password</Label>
              <Input id="u-pass" type="text" value={password} onChange={e => setPassword(e.target.value)} placeholder="mín. 6 caracteres" autoComplete="new-password" />
            </div>
            <div className="space-y-1.5">
              <Label>Função</Label>
              <Select value={perfil} onValueChange={setPerfil}>
                <SelectTrigger><SelectValue placeholder="Escolher função…" /></SelectTrigger>
                <SelectContent>
                  {roleNames.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="u-local">Local(is)</Label>
              <Input id="u-local" value={local} onChange={e => setLocal(e.target.value)} placeholder="Aveiro, Porto" />
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={saving} className="w-full gap-1.5">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                Criar utilizador
              </Button>
            </div>
          </form>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" /> A carregar…
          </div>
        ) : users.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">Sem utilizadores.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b">
                  <th className="py-2 pr-3 font-medium">Nome</th>
                  <th className="py-2 pr-3 font-medium">Email</th>
                  <th className="py-2 pr-3 font-medium">Função</th>
                  <th className="py-2 pr-3 font-medium">Local</th>
                  <th className="py-2 pr-3 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="border-b last:border-0">
                    <td className="py-2 pr-3 font-medium">{u.nome || '—'}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{u.email}</td>
                    <td className="py-2 pr-3">
                      <Select value={u.perfil ?? ''} onValueChange={v => handleRoleChange(u, v)} disabled={busyId === u.id}>
                        <SelectTrigger className="h-8 w-[160px]"><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>
                          {roleNames.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="py-2 pr-3 text-muted-foreground text-xs">{joinArr(u.local) || '—'}</td>
                    <td className="py-2 pr-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Repor password"
                          onClick={() => handleResetPassword(u)} disabled={busyId === u.id}>
                          <KeyRound className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" title="Eliminar"
                          onClick={() => handleDelete(u)} disabled={busyId === u.id}>
                          {busyId === u.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ── Secção: matriz de permissões por função ──────────────────────────────── */

function RolesMatrix({
  roles, loading, onSaved,
}: {
  roles: AppRole[]; loading: boolean; onSaved: () => Promise<void>;
}) {
  // Rascunho editável: { roleName: { tabKey: AccessLevel } }
  const [draft, setDraft] = useState<Record<string, Record<string, AccessLevel>>>({});
  const [saving, setSaving] = useState(false);
  const [newRole, setNewRole] = useState('');
  const [creatingRole, setCreatingRole] = useState(false);
  const [busyRole, setBusyRole] = useState<string | null>(null);

  useEffect(() => {
    const d: Record<string, Record<string, AccessLevel>> = {};
    roles.forEach(r => { d[r.name] = { ...(r.permissions ?? {}) }; });
    setDraft(d);
  }, [roles]);

  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newRole.trim();
    if (!name) return;
    if (roles.some(r => r.name.toLowerCase() === name.toLowerCase())) {
      toast.error('Já existe uma função com esse nome.'); return;
    }
    setCreatingRole(true);
    try {
      await saveRole(name, {}, false);
      toast.success(`Função "${name}" criada.`);
      setNewRole('');
      await onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível criar a função.');
    } finally {
      setCreatingRole(false);
    }
  };

  const handleDeleteRole = async (name: string) => {
    if (!window.confirm(`Eliminar a função "${name}"?`)) return;
    setBusyRole(name);
    try {
      await deleteRole(name);
      toast.success('Função eliminada.');
      await onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível eliminar a função.');
    } finally {
      setBusyRole(null);
    }
  };

  const setCell = (role: string, tab: string, value: AccessLevel) => {
    setDraft(prev => ({ ...prev, [role]: { ...prev[role], [tab]: value } }));
  };

  const dirty = useMemo(() => {
    return roles.some(r => {
      const cur = draft[r.name] ?? {};
      const orig = r.permissions ?? {};
      const keys = new Set([...Object.keys(cur), ...Object.keys(orig), ...TABS.map(t => t.key)]);
      return Array.from(keys).some(k => (cur[k] ?? 'none') !== (orig[k] ?? 'none'));
    });
  }, [draft, roles]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const editable = roles.filter(r => !r.is_admin);
      for (const r of editable) {
        await saveRole(r.name, draft[r.name] ?? {}, r.is_admin);
      }
      toast.success('Permissões guardadas.');
      await onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível guardar as permissões.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" /> Permissões por função
          </CardTitle>
          <div className="flex items-center gap-2">
            <form onSubmit={handleCreateRole} className="flex items-center gap-1">
              <Input
                value={newRole}
                onChange={e => setNewRole(e.target.value)}
                placeholder="Nova função (ex: Lavador)"
                className="h-7 w-[180px] text-xs"
              />
              <Button type="submit" size="sm" variant="outline" className="h-7 gap-1" disabled={creatingRole || !newRole.trim()}>
                {creatingRole ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Criar
              </Button>
            </form>
            <Button size="sm" className="h-7 gap-1.5" onClick={handleSave} disabled={saving || !dirty}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Guardar
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" /> A carregar…
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b">
                  <th className="py-2 pr-3 font-medium sticky left-0 bg-card">Tab</th>
                  {roles.map(r => (
                    <th key={r.name} className="py-2 px-2 font-medium whitespace-nowrap">
                      <span className="inline-flex items-center gap-1">
                        {r.name}
                        {r.is_admin
                          ? <span className="text-[10px] text-emerald-600">(total)</span>
                          : (
                            <button
                              onClick={() => handleDeleteRole(r.name)}
                              disabled={busyRole === r.name}
                              className="text-destructive/60 hover:text-destructive"
                              title="Eliminar função"
                            >
                              {busyRole === r.name ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                            </button>
                          )}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TABS.map(t => (
                  <tr key={t.key} className="border-b last:border-0">
                    <td className="py-1.5 pr-3 font-medium sticky left-0 bg-card whitespace-nowrap">
                      {t.label}
                      {t.group === 'admin' && <span className="ml-1 text-[10px] text-amber-600">admin</span>}
                    </td>
                    {roles.map(r => (
                      <td key={r.name} className="py-1.5 px-2">
                        {r.is_admin ? (
                          <span className="text-xs text-muted-foreground">Edição</span>
                        ) : (
                          <Select
                            value={(draft[r.name]?.[t.key] ?? 'none')}
                            onValueChange={v => setCell(r.name, t.key, v as AccessLevel)}
                          >
                            <SelectTrigger className="h-8 w-[130px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {ACCESS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
