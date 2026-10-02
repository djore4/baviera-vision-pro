import { useMemo, useState } from 'react';
import {
  UserPlus, Loader2, Trash2, KeyRound, Search, Copy, Check, Eye, EyeOff, Wand2,
  ArrowUp, ArrowDown, ArrowUpDown, AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { usePermissions } from '@/contexts/PermissionsContext';
import { createUser, updateUser, deleteUser, type AppUser } from '@/lib/permissions';
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

const SEM_FUNCAO = 'Sem função';
const ALL = '__all__';

/* Password legível: sem caracteres ambíguos (0/O, 1/l/I). */
function generatePassword(len = 12) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const buf = new Uint32Array(len);
  crypto.getRandomValues(buf);
  return Array.from(buf, n => alphabet[n % alphabet.length]).join('');
}

const initialsOf = (u: AppUser) => {
  const base = (u.nome || u.email || '?').trim();
  const parts = base.split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
};

type SortKey = 'nome' | 'perfil';

export function UsersPanel({
  users, loading, roleNames, onChanged,
}: {
  users: AppUser[]; loading: boolean; roleNames: string[]; onChanged: () => Promise<void>;
}) {
  const { me } = usePermissions();
  const [q, setQ] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>(ALL);
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'nome', dir: 'asc' });
  const [busyId, setBusyId] = useState<string | number | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [pwTarget, setPwTarget] = useState<AppUser | null>(null);
  const [delTarget, setDelTarget] = useState<AppUser | null>(null);

  const roleOf = (u: AppUser) => (u.perfil && u.perfil.trim()) || SEM_FUNCAO;

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    users.forEach(u => m.set(roleOf(u), (m.get(roleOf(u)) ?? 0) + 1));
    return m;
  }, [users]);

  const filterRoles = useMemo(
    () => [...counts.keys()].sort((a, b) =>
      a === SEM_FUNCAO ? 1 : b === SEM_FUNCAO ? -1 : a.localeCompare(b, 'pt', { sensitivity: 'base' })),
    [counts],
  );

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = users.filter(u => {
      if (roleFilter !== ALL && roleOf(u) !== roleFilter) return false;
      if (term && !`${u.nome ?? ''} ${u.email ?? ''}`.toLowerCase().includes(term)) return false;
      return true;
    });
    const mul = sort.dir === 'asc' ? 1 : -1;
    const nameOf = (u: AppUser) => u.nome || u.email || '';
    return list.sort((a, b) => {
      const primary = sort.key === 'nome'
        ? nameOf(a).localeCompare(nameOf(b), 'pt', { sensitivity: 'base' })
        : roleOf(a).localeCompare(roleOf(b), 'pt', { sensitivity: 'base' });
      if (primary !== 0) return primary * mul;
      return nameOf(a).localeCompare(nameOf(b), 'pt', { sensitivity: 'base' });
    });
  }, [users, q, roleFilter, sort]);

  const toggleSort = (key: SortKey) =>
    setSort(prev => prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' });

  const handleRoleChange = async (u: AppUser, newRole: string) => {
    setBusyId(u.id);
    try {
      await updateUser(u.id, { perfil: newRole });
      toast.success(`${u.nome || u.email} → ${newRole}`);
      await onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível atualizar.');
    } finally { setBusyId(null); }
  };

  const confirmDelete = async () => {
    const u = delTarget;
    if (!u) return;
    setBusyId(u.id);
    try {
      await deleteUser(u.id);
      toast.success('Utilizador eliminado.');
      setDelTarget(null);
      await onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível eliminar.');
    } finally { setBusyId(null); }
  };

  const semFuncao = counts.get(SEM_FUNCAO) ?? 0;

  return (
    <div className="space-y-3">
      {/* Barra de ferramentas */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Procurar por nome ou email…" className="pl-8 h-9" />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="h-9 sm:w-[220px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas as funções ({users.length})</SelectItem>
            {filterRoles.map(r => <SelectItem key={r} value={r}>{r} ({counts.get(r)})</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" className="h-9 gap-1.5" onClick={() => setCreateOpen(true)}>
          <UserPlus className="h-4 w-4" /> Novo utilizador
        </Button>
      </div>

      {semFuncao > 0 && roleFilter !== SEM_FUNCAO && (
        <button
          type="button" onClick={() => setRoleFilter(SEM_FUNCAO)}
          className="w-full flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-left text-xs text-amber-800 dark:text-amber-300 hover:bg-amber-500/15"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {semFuncao} {semFuncao === 1 ? 'conta sem função' : 'contas sem função'} — sem função não há acesso a nenhum tab. Ver.
        </button>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> A carregar…
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <SortTh label="Utilizador" k="nome" sort={sort} onSort={toggleSort} />
                  <SortTh label="Função" k="perfil" sort={sort} onSort={toggleSort} />
                  <th className="px-3 py-2 text-right font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 && (
                  <tr><td colSpan={3} className="py-10 text-center text-sm text-muted-foreground">Nenhum utilizador corresponde à pesquisa.</td></tr>
                )}
                {visible.map(u => {
                  const isMe = !!me?.email && u.email?.toLowerCase() === me.email.toLowerCase();
                  const noRole = roleOf(u) === SEM_FUNCAO;
                  return (
                    <tr key={u.id} className="border-b border-border/60 last:border-0 hover:bg-muted/20">
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="grid place-items-center h-8 w-8 rounded-full bg-primary/10 text-primary text-[11px] font-bold shrink-0">{initialsOf(u)}</span>
                          <div className="min-w-0">
                            <div className="font-medium truncate">
                              {u.nome || '—'}{isMe && <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">tu</span>}
                            </div>
                            <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <Select value={u.perfil ?? ''} onValueChange={v => handleRoleChange(u, v)} disabled={busyId === u.id}>
                          <SelectTrigger className={cn('h-8 w-[170px]', noRole && 'border-amber-500/60')}><SelectValue placeholder={SEM_FUNCAO} /></SelectTrigger>
                          <SelectContent>
                            {roleNames.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Repor password"
                            onClick={() => setPwTarget(u)} disabled={busyId === u.id}>
                            <KeyRound className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"
                            title={isMe ? 'Não podes eliminar a tua própria conta' : 'Eliminar'}
                            onClick={() => setDelTarget(u)} disabled={busyId === u.id || isMe}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-3 py-2 text-[11px] text-muted-foreground border-t border-border/60">{visible.length} de {users.length} contas</div>
        </div>
      )}

      <CreateUserDialog open={createOpen} onOpenChange={setCreateOpen} roleNames={roleNames} onCreated={onChanged} />
      <ResetPasswordDialog target={pwTarget} onClose={() => setPwTarget(null)} />

      <AlertDialog open={!!delTarget} onOpenChange={o => !o && setDelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar {delTarget?.nome || delTarget?.email}?</AlertDialogTitle>
            <AlertDialogDescription>
              A conta é apagada e o acesso de login é removido. Os dados que esta pessoa registou na plataforma mantêm-se. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={e => { e.preventDefault(); confirmDelete(); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {busyId === delTarget?.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SortTh({ label, k, sort, onSort }: {
  label: string; k: SortKey; sort: { key: SortKey; dir: 'asc' | 'desc' }; onSort: (k: SortKey) => void;
}) {
  const active = sort.key === k;
  const Icon = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th className="px-3 py-2 font-medium" aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => onSort(k)} className={cn('inline-flex items-center gap-1 uppercase tracking-wide hover:text-foreground', active && 'text-foreground')}>
        {label}<Icon className={cn('h-3 w-3', !active && 'opacity-40')} />
      </button>
    </th>
  );
}

/* Campo de password com mostrar/ocultar, gerar e copiar. */
function PasswordField({ value, onChange, id }: { value: string; onChange: (v: string) => void; id: string }) {
  const [show, setShow] = useState(true);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    catch { toast.error('Não foi possível copiar.'); }
  };
  return (
    <div className="flex gap-1.5">
      <Input id={id} type={show ? 'text' : 'password'} value={value} onChange={e => onChange(e.target.value)}
        placeholder="mín. 6 caracteres" autoComplete="new-password" className="font-mono" />
      <Button type="button" variant="outline" size="icon" onClick={() => setShow(s => !s)} title={show ? 'Ocultar' : 'Mostrar'}>
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </Button>
      <Button type="button" variant="outline" size="icon" onClick={() => { onChange(generatePassword()); setShow(true); }} title="Gerar password">
        <Wand2 className="h-4 w-4" />
      </Button>
      <Button type="button" variant="outline" size="icon" onClick={copy} disabled={!value} title="Copiar">
        {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
      </Button>
    </div>
  );
}

function CreateUserDialog({ open, onOpenChange, roleNames, onCreated }: {
  open: boolean; onOpenChange: (v: boolean) => void; roleNames: string[]; onCreated: () => Promise<void>;
}) {
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [perfil, setPerfil] = useState('');
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const reset = () => { setNome(''); setEmail(''); setPassword(''); setPerfil(''); setCreated(null); setCopied(false); };
  const close = (v: boolean) => { onOpenChange(v); if (!v) reset(); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) { toast.error('Email e password são obrigatórios.'); return; }
    if (!perfil) { toast.error('Escolhe a função.'); return; }
    if (password.length < 6) { toast.error('A password deve ter pelo menos 6 caracteres.'); return; }
    setSaving(true);
    try {
      const mail = email.trim().toLowerCase();
      await createUser({ nome: nome.trim(), email: mail, password, perfil });
      setCreated({ email: mail, password });
      await onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível criar o utilizador.');
    } finally { setSaving(false); }
  };

  const copyCreds = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(`Email: ${created.email}\nPassword: ${created.password}`);
      setCopied(true); setTimeout(() => setCopied(false), 1500);
    } catch { toast.error('Não foi possível copiar.'); }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{created ? 'Utilizador criado' : 'Novo utilizador'}</DialogTitle>
          <DialogDescription>
            {created ? 'Guarda estas credenciais agora: a password não volta a ser mostrada.' : 'Cria a conta de login e atribui a função.'}
          </DialogDescription>
        </DialogHeader>

        {created ? (
          <>
            <div className="rounded-md border bg-muted/30 p-3 text-sm font-mono space-y-1">
              <div><span className="text-muted-foreground">Email:</span> {created.email}</div>
              <div><span className="text-muted-foreground">Password:</span> {created.password}</div>
            </div>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button variant="outline" onClick={copyCreds} className="gap-1.5">
                {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />} Copiar credenciais
              </Button>
              <Button onClick={() => close(false)}>Concluir</Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="u-nome">Nome</Label>
              <Input id="u-nome" value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome completo" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="u-email">Email</Label>
              <Input id="u-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="nome@empresa.pt" autoComplete="off" />
            </div>
            <div className="space-y-1.5">
              <Label>Função</Label>
              <Select value={perfil} onValueChange={setPerfil}>
                <SelectTrigger><SelectValue placeholder="Escolher função…" /></SelectTrigger>
                <SelectContent>{roleNames.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="u-pass">Password</Label>
              <PasswordField id="u-pass" value={password} onChange={setPassword} />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => close(false)}>Cancelar</Button>
              <Button type="submit" disabled={saving} className="gap-1.5">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} Criar utilizador
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({ target, onClose }: { target: AppUser | null; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const close = () => { onClose(); setPassword(''); setDone(false); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!target) return;
    if (password.length < 6) { toast.error('A password deve ter pelo menos 6 caracteres.'); return; }
    setSaving(true);
    try {
      await updateUser(target.id, {}, password);
      setDone(true);
      toast.success('Password reposta.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível repor a password.');
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={!!target} onOpenChange={o => !o && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Repor password</DialogTitle>
          <DialogDescription>{target?.nome || target?.email}{target?.nome ? ` · ${target.email}` : ''}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="r-pass">Nova password</Label>
            <PasswordField id="r-pass" value={password} onChange={v => { setPassword(v); setDone(false); }} />
            {done && <p className="text-xs text-emerald-600">Reposta. Copia a password e envia-a à pessoa.</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={close}>{done ? 'Fechar' : 'Cancelar'}</Button>
            {!done && (
              <Button type="submit" disabled={saving || !password} className="gap-1.5">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />} Repor
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
