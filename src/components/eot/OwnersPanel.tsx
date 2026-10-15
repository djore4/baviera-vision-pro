import { useEffect, useMemo, useState } from 'react';
import { Loader2, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { listUsers, type AppUser } from '@/lib/permissions';
import {
  saveEotOwner, deleteEotOwner, addEotVendedorMap, removeEotVendedorMap, normVendedor, contractLocal,
  type EotContract, type EotOwner, type EotVendedorMapRow,
} from '@/lib/eot';

/* Gestão dos responsáveis do End-of-Term e da tabela de conversão dos nomes do Excel.
 * Quem gere tudo (administrador, end-of-term:todos) mexe em qualquer local; o chefe de
 * equipa local só nos responsáveis dos seus locais (a base de dados impõe o mesmo). */

interface Props {
  contracts: EotContract[];
  owners: EotOwner[];
  ownerMap: EotVendedorMapRow[];
  /** null = sem restrição (gere todos os locais); senão, só estes locais. */
  limitLocais: string[] | null;
  onChanged: () => void;
}

const ownerName = (o: EotOwner) => o.nome;
const initialsFrom = (nome: string | null, email: string) => {
  const parts = (nome || email.split('@')[0]).split(/[\s.]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
};

export function OwnersPanel({ contracts, owners, ownerMap, limitLocais, onChanged }: Props) {
  const [dialog, setDialog] = useState<{ mode: 'new' } | { mode: 'edit'; owner: EotOwner } | null>(null);
  const [removing, setRemoving] = useState<EotOwner | null>(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [onlyUnmapped, setOnlyUnmapped] = useState(true);

  // Locais conhecidos: os dos contratos e os dos responsáveis.
  const knownLocais = useMemo(() => {
    const set = new Set<string>();
    contracts.forEach(c => { const l = contractLocal(c); if (l !== '—') set.add(l); });
    owners.forEach(o => o.locais?.forEach(l => set.add(l)));
    const all = [...set].sort((a, b) => a.localeCompare(b, 'pt'));
    return limitLocais ? all.filter(l => limitLocais.includes(l)) : all;
  }, [contracts, owners, limitLocais]);

  const canTouch = (o: EotOwner) => !limitLocais || (o.locais ?? []).some(l => limitLocais.includes(l));
  const manageable = useMemo(() => owners.filter(canTouch), [owners, limitLocais]); // eslint-disable-line react-hooks/exhaustive-deps

  const assignedCount = useMemo(() => {
    const m = new Map<string, number>();
    contracts.forEach(c => { if (c.owner_email) m.set(c.owner_email, (m.get(c.owner_email) ?? 0) + 1); });
    return m;
  }, [contracts]);

  // Nomes do Excel (VENDEDOR) distintos pela chave normalizada.
  const names = useMemo(() => {
    const by = new Map<string, { key: string; exemplo: string; total: number; semResp: number; locais: Set<string> }>();
    contracts.forEach(c => {
      const key = normVendedor(c.vendedor);
      if (!key) return;
      const row = by.get(key) ?? { key, exemplo: c.vendedor!, total: 0, semResp: 0, locais: new Set<string>() };
      row.total++;
      if (!c.owner_email) row.semResp++;
      row.locais.add(contractLocal(c));
      by.set(key, row);
    });
    return [...by.values()];
  }, [contracts]);

  const mappedTo = (key: string) => ownerMap.filter(m => m.raw_norm === key);
  const visibleNames = useMemo(() => {
    const term = q.trim().toLowerCase();
    return names
      .filter(n => !onlyUnmapped || mappedTo(n.key).length === 0)
      .filter(n => !term || n.exemplo.toLowerCase().includes(term))
      .sort((a, b) => b.semResp - a.semResp || b.total - a.total || a.exemplo.localeCompare(b.exemplo, 'pt'));
  }, [names, ownerMap, onlyUnmapped, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const unmappedCount = names.filter(n => mappedTo(n.key).length === 0).length;

  const run = async (fn: () => Promise<void>, ok?: string) => {
    setBusy(true);
    try { await fn(); if (ok) toast.success(ok); onChanged(); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  const linkName = (n: { exemplo: string }, email: string) =>
    run(() => addEotVendedorMap(n.exemplo, email), 'Mapeamento guardado.');
  const unlink = (m: EotVendedorMapRow) =>
    run(() => removeEotVendedorMap(m.raw_norm, m.owner_email), 'Mapeamento removido.');

  return (
    <div className="space-y-8">
      {/* ── Responsáveis ───────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold">Responsáveis</h2>
            <p className="text-xs text-muted-foreground max-w-xl">
              Quem pode receber contratos. Têm de ter login (tab Utilizadores) e acesso ao End-of-Term.
              O local é onde a pessoa trabalha e serve para sugerir responsáveis nos contratos dessa concessão.
            </p>
          </div>
          <Button size="sm" onClick={() => setDialog({ mode: 'new' })}><Plus className="h-4 w-4 mr-1" />Adicionar responsável</Button>
        </div>

        <div className="rounded-lg border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Iniciais</th>
                <th className="px-3 py-2 text-left font-medium">Responsável</th>
                <th className="px-3 py-2 text-left font-medium">Local</th>
                <th className="px-3 py-2 text-right font-medium">Contratos</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {owners.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">Ainda não há responsáveis.</td></tr>
              )}
              {owners.map(o => (
                <tr key={o.email} className="border-t border-border">
                  <td className="px-3 py-2 font-mono font-semibold">{o.iniciais}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{o.nome.replace(/^.+? · /, '')}</div>
                    <div className="text-xs text-muted-foreground">{o.email}</div>
                  </td>
                  <td className="px-3 py-2">
                    {(o.locais ?? []).length === 0
                      ? <span className="text-xs text-muted-foreground">—</span>
                      : <div className="flex flex-wrap gap-1">{o.locais!.map(l => <Chip key={l}>{l}</Chip>)}</div>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{assignedCount.get(o.email) ?? 0}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {canTouch(o) && (
                      <>
                        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Editar ${o.iniciais}`} onClick={() => setDialog({ mode: 'edit', owner: o })}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" aria-label={`Remover ${o.iniciais}`} onClick={() => setRemoving(o)}><Trash2 className="h-4 w-4" /></Button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Nomes do Excel ─────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Nomes do vendedor no Excel</h2>
          <p className="text-xs text-muted-foreground max-w-xl">
            Liga cada nome tal como vem no ficheiro (coluna Vendedor) ao responsável certo. O contrato passa a sugerir
            esse responsável ao atribuir; a atribuição continua manual. Um nome pode ter mais de um responsável (homónimos).
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
            <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Procurar nome…" className="pl-8 w-56" />
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={onlyUnmapped} onChange={e => setOnlyUnmapped(e.target.checked)} />
            Só por mapear <span className="text-muted-foreground">({unmappedCount})</span>
          </label>
        </div>

        <div className="rounded-lg border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Nome no Excel</th>
                <th className="px-3 py-2 text-left font-medium">Local</th>
                <th className="px-3 py-2 text-right font-medium">Contratos</th>
                <th className="px-3 py-2 text-right font-medium">Sem resp.</th>
                <th className="px-3 py-2 text-left font-medium">Responsável</th>
              </tr>
            </thead>
            <tbody>
              {visibleNames.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                  {names.length === 0 ? 'Ainda não há contratos com nome de vendedor.' : 'Nenhum nome por mapear.'}
                </td></tr>
              )}
              {visibleNames.map(n => {
                const links = mappedTo(n.key);
                const free = manageable.filter(o => !links.some(m => m.owner_email === o.email));
                return (
                  <tr key={n.key} className="border-t border-border align-top">
                    <td className="px-3 py-2 font-medium">{n.exemplo}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{[...n.locais].join(', ')}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{n.total}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{n.semResp || '—'}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {links.map(m => {
                          const o = owners.find(x => x.email === m.owner_email);
                          const mine = !o || canTouch(o);
                          return (
                            <Chip key={m.owner_email} strong>
                              {o?.iniciais ?? m.owner_email}
                              {mine && (
                                <button type="button" disabled={busy} aria-label={`Remover ${o?.iniciais ?? m.owner_email} de ${n.exemplo}`}
                                  onClick={() => unlink(m)} className="ml-1 opacity-60 hover:opacity-100"><X className="h-3 w-3" /></button>
                              )}
                            </Chip>
                          );
                        })}
                        {free.length > 0 && (
                          <Select value="" onValueChange={v => linkName(n, v)} disabled={busy}>
                            <SelectTrigger className="h-7 w-44 text-xs"><SelectValue placeholder={links.length ? '+ outro…' : 'Associar a…'} /></SelectTrigger>
                            <SelectContent>
                              {free.map(o => <SelectItem key={o.email} value={o.email}>{ownerName(o)}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {dialog && (
        <OwnerDialog
          key={dialog.mode === 'edit' ? dialog.owner.email : 'new'}
          state={dialog} owners={owners} knownLocais={knownLocais} limitLocais={limitLocais}
          onClose={() => setDialog(null)}
          onSaved={() => { setDialog(null); onChanged(); }}
        />
      )}

      <AlertDialog open={!!removing} onOpenChange={v => { if (!v) setRemoving(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover {removing?.iniciais}?</AlertDialogTitle>
            <AlertDialogDescription>
              {removing?.nome}. Deixa de aparecer na lista de atribuição e perde os mapeamentos de nomes do Excel.
              Os contratos já atribuídos mantêm o responsável.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { const o = removing!; setRemoving(null); run(() => deleteEotOwner(o.email), 'Responsável removido.'); }}>
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Chip({ children, strong }: { children: React.ReactNode; strong?: boolean }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${strong ? 'bg-primary/10 text-primary font-semibold' : 'bg-muted text-foreground'}`}>
      {children}
    </span>
  );
}

function OwnerDialog({ state, owners, knownLocais, limitLocais, onClose, onSaved }: {
  state: { mode: 'new' } | { mode: 'edit'; owner: EotOwner };
  owners: EotOwner[];
  knownLocais: string[];
  limitLocais: string[] | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const edit = state.mode === 'edit' ? state.owner : null;
  const [users, setUsers] = useState<AppUser[] | null>(null);
  const [email, setEmail] = useState(edit?.email ?? '');
  const [iniciais, setIniciais] = useState(edit?.iniciais ?? '');
  const [locais, setLocais] = useState<string[]>(edit?.locais ?? (limitLocais?.length === 1 ? limitLocais : []));
  const [extra, setExtra] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (edit) return;
    let alive = true;
    listUsers().then(u => { if (alive) setUsers(u); });
    return () => { alive = false; };
  }, [edit]);

  const candidates = useMemo(() => {
    const taken = new Set(owners.map(o => o.email));
    return (users ?? []).filter(u => u.email && !taken.has(u.email.toLowerCase()))
      .sort((a, b) => (a.nome || a.email || '').localeCompare(b.nome || b.email || '', 'pt'));
  }, [users, owners]);

  const options = useMemo(() => [...new Set([...knownLocais, ...locais])], [knownLocais, locais]);
  const toggle = (l: string) => setLocais(p => p.includes(l) ? p.filter(x => x !== l) : [...p, l]);
  const addExtra = () => {
    const l = extra.trim();
    if (!l) return;
    if (limitLocais && !limitLocais.includes(l)) { toast.error('Só pode usar os seus locais.'); return; }
    setLocais(p => p.includes(l) ? p : [...p, l]);
    setExtra('');
  };

  const pick = (v: string) => {
    setEmail(v);
    const u = candidates.find(x => x.email === v);
    if (u && !iniciais) setIniciais(initialsFrom(u.nome, v));
  };

  const save = async () => {
    setSaving(true);
    try {
      await saveEotOwner({ email, iniciais, locais });
      toast.success(edit ? 'Responsável atualizado.' : 'Responsável adicionado.');
      onSaved();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{edit ? `Editar ${edit.iniciais}` : 'Adicionar responsável'}</DialogTitle>
          <DialogDescription>
            {edit ? edit.email : 'Escolha um utilizador existente. Se a pessoa ainda não tem login, peça a um administrador para a criar no tab Utilizadores.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!edit && (
            <div className="space-y-1.5">
              <Label>Utilizador</Label>
              {users === null ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />A carregar…</div>
              ) : (
                <Select value={email} onValueChange={pick}>
                  <SelectTrigger><SelectValue placeholder={candidates.length ? 'Escolher utilizador…' : 'Todos os utilizadores já são responsáveis'} /></SelectTrigger>
                  <SelectContent>
                    {candidates.map(u => <SelectItem key={u.email!} value={u.email!}>{u.nome ? `${u.nome} · ${u.email}` : u.email}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="eot-iniciais">Iniciais</Label>
            <Input id="eot-iniciais" value={iniciais} maxLength={4} className="w-24 uppercase"
              onChange={e => setIniciais(e.target.value.toUpperCase())} />
          </div>

          <div className="space-y-1.5">
            <Label>Local onde trabalha</Label>
            <div className="flex flex-wrap gap-1.5">
              {options.length === 0 && <span className="text-xs text-muted-foreground">Sem locais conhecidos — escreva um abaixo.</span>}
              {options.map(l => (
                <button key={l} type="button" onClick={() => toggle(l)} aria-pressed={locais.includes(l)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${locais.includes(l) ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-accent'}`}>
                  {l}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Input value={extra} onChange={e => setExtra(e.target.value)} placeholder="Outro local…"
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addExtra(); } }} />
              <Button type="button" variant="outline" onClick={addExtra}>Juntar</Button>
            </div>
            <p className="text-[11px] text-muted-foreground">Use o mesmo nome do local nos contratos (ex.: Aveiro, Viseu).</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving || !email || !iniciais.trim() || (!!limitLocais && locais.length === 0)}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
