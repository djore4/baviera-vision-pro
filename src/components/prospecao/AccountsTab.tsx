import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Loader2, AlertTriangle, ArrowUpDown } from 'lucide-react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  FASES, faseLabel, faseCls,
  listAccounts, listTasks,
  type Account, type Fase, type Scope,
} from '@/lib/prospec';
import { AccountDialog } from './AccountDialog';

interface Props {
  scope: Scope;
  isDirector: boolean;
  myEmail: string | null;
  myNome: string | null;
}

type SortKey = 'score' | 'nome' | 'fase';

export function AccountsTab({ scope, isDirector, myEmail, myNome }: Props) {
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [overdueIds, setOverdueIds] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selected, setSelected] = useState<Account | null>(null);

  const [q, setQ] = useState('');
  const [fFase, setFFase] = useState<Fase | 'all'>('all');
  const [fOwner, setFOwner] = useState<string>('all');
  const [fLate, setFLate] = useState<'all' | 'late' | 'ontime'>('all');
  const [sort, setSort] = useState<SortKey>('score');

  const load = useCallback(async () => {
    try {
      const [acc, openTasks] = await Promise.all([
        listAccounts(scope),
        listTasks(scope, { types: ['next_action', 'todo'], done: false }),
      ]);
      setAccounts(acc);
      const now = Date.now();
      const late = new Set<string>();
      for (const t of openTasks) {
        if (t.account_id && t.due_at && new Date(t.due_at).getTime() < now) late.add(t.account_id);
      }
      setOverdueIds(late);
    } catch (e) {
      toast.error((e as Error).message);
      setAccounts([]);
    }
  }, [scope]);
  useEffect(() => { load(); }, [load]);

  const owners = useMemo(() => {
    const s = new Map<string, string>();
    (accounts ?? []).forEach(a => { if (a.owner_email) s.set(a.owner_email, a.owner_nome ?? a.owner_email); });
    return [...s.entries()];
  }, [accounts]);

  const rows = useMemo(() => {
    let r = accounts ?? [];
    if (q.trim()) {
      const t = q.trim().toLowerCase();
      r = r.filter(a => a.nome.toLowerCase().includes(t) || (a.setor ?? '').toLowerCase().includes(t));
    }
    if (fFase !== 'all') r = r.filter(a => a.fase === fFase);
    if (fOwner !== 'all') r = r.filter(a => a.owner_email === fOwner);
    if (fLate === 'late') r = r.filter(a => overdueIds.has(a.id));
    if (fLate === 'ontime') r = r.filter(a => !overdueIds.has(a.id));
    const arr = [...r];
    arr.sort((a, b) => {
      if (sort === 'nome') return a.nome.localeCompare(b.nome);
      if (sort === 'fase') return FASES.findIndex(f => f.value === a.fase) - FASES.findIndex(f => f.value === b.fase);
      return (b.score ?? 0) - (a.score ?? 0);
    });
    return arr;
  }, [accounts, q, fFase, fOwner, fLate, sort, overdueIds]);

  const openNew = () => { setSelected(null); setDialogOpen(true); };
  const openEdit = (a: Account) => { setSelected(a); setDialogOpen(true); };

  if (accounts === null) {
    return <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" />A carregar…</div>;
  }

  return (
    <div className="space-y-3">
      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Procurar empresa/setor…" className="w-full sm:w-48" />
        <Select value={fFase} onValueChange={v => setFFase(v as Fase | 'all')}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Fase" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as fases</SelectItem>
            {FASES.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
          </SelectContent>
        </Select>
        {isDirector && owners.length > 0 && (
          <Select value={fOwner} onValueChange={setFOwner}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Vendedor" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os vendedores</SelectItem>
              {owners.map(([email, nome]) => <SelectItem key={email} value={email}>{nome}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Select value={fLate} onValueChange={v => setFLate(v as 'all' | 'late' | 'ontime')}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os estados</SelectItem>
            <SelectItem value="late">Só atrasados</SelectItem>
            <SelectItem value="ontime">Sem atraso</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={v => setSort(v as SortKey)}>
          <SelectTrigger className="w-36"><ArrowUpDown className="h-3.5 w-3.5 mr-1" /><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="score">Score</SelectItem>
            <SelectItem value="nome">Nome</SelectItem>
            <SelectItem value="fase">Fase</SelectItem>
          </SelectContent>
        </Select>
        <Button className="ml-auto" onClick={openNew}><Plus className="h-4 w-4 mr-1" />Nova conta</Button>
      </div>

      {/* Tabela */}
      <div className="overflow-x-auto rounded border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left font-medium px-3 py-2">Empresa</th>
              <th className="text-left font-medium px-3 py-2 hidden sm:table-cell">Setor</th>
              <th className="text-center font-medium px-3 py-2">Score</th>
              <th className="text-left font-medium px-3 py-2">Fase</th>
              <th className="text-left font-medium px-3 py-2">Responsável</th>
              <th className="text-center font-medium px-3 py-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">Sem contas.</td></tr>
            )}
            {rows.map(a => (
              <tr key={a.id} onClick={() => openEdit(a)} className="border-t border-border hover:bg-muted/40 cursor-pointer">
                <td className="px-3 py-2 font-medium">{a.nome}</td>
                <td className="px-3 py-2 text-muted-foreground hidden sm:table-cell">{a.setor ?? '—'}</td>
                <td className="px-3 py-2 text-center font-semibold">{a.score?.toFixed(2) ?? '—'}</td>
                <td className="px-3 py-2">
                  <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${faseCls(a.fase)}`}>{faseLabel(a.fase)}</span>
                </td>
                <td className="px-3 py-2 text-muted-foreground">{a.owner_nome ?? a.owner_email ?? '—'}</td>
                <td className="px-3 py-2 text-center">
                  {overdueIds.has(a.id)
                    ? <span className="inline-flex items-center gap-1 text-destructive text-xs font-medium"><AlertTriangle className="h-3.5 w-3.5" />Atrasado</span>
                    : <span className="text-xs text-muted-foreground">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AccountDialog
        open={dialogOpen} onOpenChange={setDialogOpen}
        account={selected} myEmail={myEmail} myNome={myNome}
        onChanged={load}
      />
    </div>
  );
}
