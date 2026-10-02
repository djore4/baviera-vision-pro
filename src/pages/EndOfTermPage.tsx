import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarClock, Search, Loader2, RefreshCw, Filter as FilterIcon, MapPin,
  ListChecks, CalendarDays, ChevronRight, UserCheck, ArrowUp, ArrowDown, ArrowUpDown,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useEotScope } from '@/hooks/useEotScope';
import { usePermissions } from '@/contexts/PermissionsContext';
import { ContractDialog } from '@/components/eot/ContractDialog';
import { EmptyState, relativeLabel } from '@/components/prospecao/ui';
import {
  listEotContracts, listEotVendedores, listAgenda, listEotOwners,
  FASES, faseLabel, faseCls, actTipoLabel, isFechada, daysToEnd, eur, isOverdue, contractLocal,
  type EotContract, type AgendaItem, type EotOwner, type Fase,
} from '@/lib/eot';

type UntilKey = 'all' | '30' | '60' | '90';

const DEFAULT_LOCAL = 'Aveiro';

type SortKey = 'cliente' | 'viatura' | 'resp' | 'fim' | 'fase' | 'proxima' | 'total';
type SortState = { key: SortKey; dir: 'asc' | 'desc' } | null;

export default function EndOfTermPage() {
  const { scope, isDirector, myEmail, myNome } = useEotScope();
  const { canEdit } = usePermissions();
  const editable = canEdit('end-of-term');

  const [contracts, setContracts] = useState<EotContract[]>([]);
  const [agenda, setAgenda] = useState<AgendaItem[]>([]);
  const [vendedores, setVendedores] = useState<string[]>([]);
  const [owners, setOwners] = useState<EotOwner[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [vendedor, setVendedor] = useState<string>('all');
  const [fase, setFase] = useState<string>('all');
  const [until, setUntil] = useState<UntilKey>('all');
  const [hideClosed, setHideClosed] = useState(true);
  const [ownerFilter, setOwnerFilter] = useState<string>('all'); // all | none | <email>
  const [q, setQ] = useState('');
  const [local, setLocal] = useState<string>(DEFAULT_LOCAL); // all | <local>
  const [localTouched, setLocalTouched] = useState(false);
  const [sort, setSort] = useState<SortState>(null);

  const [selected, setSelected] = useState<EotContract | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, a, v, o] = await Promise.all([
        listEotContracts(scope),
        listAgenda(scope),
        listEotVendedores(scope),
        isDirector ? listEotOwners() : Promise.resolve([] as EotOwner[]),
      ]);
      setContracts(c);
      setAgenda(a);
      setVendedores(v);
      setOwners(o);
      // Mantém o contrato aberto sincronizado após alterações.
      setSelected(prev => (prev ? c.find(x => x.contrato === prev.contrato) ?? prev : prev));
    } finally {
      setLoading(false);
    }
  }, [scope, isDirector]);

  useEffect(() => { load(); }, [load]);

  // Próxima ação aberta por contrato (a mais próxima).
  const nextByContrato = useMemo(() => {
    const m = new Map<string, AgendaItem>();
    for (const a of agenda) {
      if (!m.has(a.contrato)) m.set(a.contrato, a); // agenda já vem ordenada por due_at asc
    }
    return m;
  }, [agenda]);

  // Locais presentes nos contratos (mais contratos primeiro). O local escolhido
  // fica sempre na lista, mesmo que entretanto não tenha contratos.
  const locals = useMemo(() => {
    const count = new Map<string, number>();
    contracts.forEach(c => { const l = contractLocal(c); count.set(l, (count.get(l) ?? 0) + 1); });
    const list = [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([l]) => l);
    if (local !== 'all' && !list.includes(local)) list.unshift(local);
    return list;
  }, [contracts, local]);

  // Se o utilizador ainda não escolheu e o local por omissão não tem contratos
  // (ex.: vendedor com contratos só noutro local), mostra todos em vez de vazio.
  useEffect(() => {
    if (loading || localTouched || contracts.length === 0) return;
    if (!contracts.some(c => contractLocal(c) === DEFAULT_LOCAL)) setLocal('all');
  }, [loading, localTouched, contracts]);

  // Responsáveis do filtro: a gestão vê a lista de atribuição; o vendedor vê os
  // responsáveis presentes nos seus contratos.
  const ownerOptions = useMemo(() => {
    if (isDirector) return owners;
    const m = new Map<string, string>();
    contracts.forEach(c => { if (c.owner_email) m.set(c.owner_email, c.owner_nome || c.owner_email); });
    return [...m].map(([email, nome]) => ({ email, nome }));
  }, [isDirector, owners, contracts]);

  const inLocal = useCallback(
    (c: EotContract) => local === 'all' || contractLocal(c) === local,
    [local],
  );

  const filtered = useMemo(() => {
    const now = new Date(); now.setHours(23, 59, 59, 999);
    const limitIso = (days: number) => {
      const d = new Date(now); d.setDate(d.getDate() + days);
      return d.toISOString().slice(0, 10);
    };
    const term = q.trim().toLowerCase();
    return contracts.filter(c => {
      if (!inLocal(c)) return false;
      if (hideClosed && isFechada(c.fase)) return false;
      if (vendedor !== 'all' && c.vendedor !== vendedor) return false;
      if (fase !== 'all' && c.fase !== fase) return false;
      if (ownerFilter === 'none' && c.owner_email) return false;
      if (ownerFilter !== 'all' && ownerFilter !== 'none' && c.owner_email !== ownerFilter) return false;
      if (until !== 'all') {
        if (!c.data_fim || c.data_fim > limitIso(Number(until))) return false;
      }
      if (term) {
        const hay = `${c.cliente ?? ''} ${c.matricula ?? ''} ${c.contrato} ${c.modelo ?? ''}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [contracts, inLocal, hideClosed, vendedor, fase, until, ownerFilter, q]);

  // Ordenação por cabeçalho: 1.º clique ascendente, 2.º descendente, 3.º repõe a ordem original.
  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const value = (c: EotContract): string | number | null => {
      switch (sort.key) {
        case 'cliente': return (c.cliente ?? '').toLowerCase() || null;
        case 'viatura': return [c.marca, c.modelo].filter(Boolean).join(' ').toLowerCase() || null;
        case 'resp': return (c.owner_nome ?? c.vendedor ?? '').toLowerCase() || null;
        case 'fim': return c.data_fim;
        case 'fase': return FASES.findIndex(f => f.value === c.fase);
        case 'proxima': return nextByContrato.get(c.contrato)?.due_at ?? null;
        case 'total': return c.valor_total;
      }
    };
    const mul = sort.dir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const va = value(a), vb = value(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;            // vazios sempre no fim
      if (vb == null) return -1;
      const cmp = typeof va === 'number' && typeof vb === 'number'
        ? va - vb
        : String(va).localeCompare(String(vb), 'pt', { numeric: true });
      return cmp * mul;
    });
  }, [filtered, sort, nextByContrato]);

  const toggleSort = (key: SortKey) =>
    setSort(prev => !prev || prev.key !== key ? { key, dir: 'asc' } : prev.dir === 'asc' ? { key, dir: 'desc' } : null);

  // A agenda segue o local escolhido (pelo local do contrato).
  const agendaView = useMemo(() => {
    if (local === 'all') return agenda;
    const byContrato = new Map(contracts.map(c => [c.contrato, c]));
    return agenda.filter(a => { const c = byContrato.get(a.contrato); return c ? inLocal(c) : false; });
  }, [agenda, contracts, local, inLocal]);

  // KPIs (sobre o universo não-fechado do local escolhido, independente dos
  // restantes filtros de tabela).
  const kpis = useMemo(() => {
    const doLocal = contracts.filter(inLocal);
    const ativos = doLocal.filter(c => !isFechada(c.fase));
    const in30 = ativos.filter(c => { const d = daysToEnd(c.data_fim); return d != null && d >= 0 && d <= 30; }).length;
    const in60 = ativos.filter(c => { const d = daysToEnd(c.data_fim); return d != null && d >= 0 && d <= 60; }).length;
    const overdueFollow = agendaView.filter(a => isOverdue(a)).length;
    const fechados = doLocal.filter(c => c.fase === 'renovado' || c.fase === 'retomado').length;
    return { ativos: ativos.length, in30, in60, overdueFollow, fechados };
  }, [contracts, inLocal, agendaView]);

  const openContract = (c: EotContract) => { setSelected(c); setDialogOpen(true); };

  return (
    <div className="max-w-6xl mx-auto space-y-4 animate-fade-in">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi label="Contratos ativos" value={kpis.ativos} />
        <Kpi label="A terminar ≤ 30 dias" value={kpis.in30} tone={kpis.in30 > 0 ? 'warn' : 'default'} />
        <Kpi label="A terminar ≤ 60 dias" value={kpis.in60} />
        <Kpi label="Renovados / Retomados" value={kpis.fechados} tone="good" />
      </div>

      <Tabs defaultValue="contratos">
        <TabsList className="h-10 p-1 bg-muted/60 w-full sm:w-auto">
          <TabsTrigger value="contratos" className="flex-1 sm:flex-none gap-1.5 data-[state=active]:shadow-sm"><ListChecks className="h-4 w-4" />Contratos</TabsTrigger>
          <TabsTrigger value="agenda" className="flex-1 sm:flex-none gap-1.5 data-[state=active]:shadow-sm">
            <CalendarDays className="h-4 w-4" />Agenda
            {kpis.overdueFollow > 0 && <span className="ml-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold px-1.5 leading-tight">{kpis.overdueFollow}</span>}
          </TabsTrigger>
        </TabsList>

        {/* ── Contratos ─────────────────────────────────────────────────────── */}
        <TabsContent value="contratos" className="mt-4 space-y-3">
          {/* Filtros — empilham no telemóvel, alinham no desktop */}
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cliente, matrícula ou contrato…" className="pl-8 h-9" />
            </div>
            <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
              <Select value={local} onValueChange={(v) => { setLocal(v); setLocalTouched(true); }}>
                <SelectTrigger className="h-9 w-full sm:w-auto sm:min-w-[140px] gap-1"><MapPin className="h-3.5 w-3.5 shrink-0" /><SelectValue placeholder="Local" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os locais</SelectItem>
                  {locals.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
              {/* Vendedor (do mapa) só para a gestão; os vendedores filtram por Responsável. */}
              {isDirector && (
                <Select value={vendedor} onValueChange={setVendedor}>
                  <SelectTrigger className="h-9 w-full sm:w-auto sm:min-w-[140px] gap-1"><FilterIcon className="h-3.5 w-3.5 shrink-0" /><SelectValue placeholder="Vendedor" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os vendedores</SelectItem>
                    {vendedores.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              <Select value={ownerFilter} onValueChange={setOwnerFilter}>
                <SelectTrigger className="h-9 w-full sm:w-auto sm:min-w-[150px]"><SelectValue placeholder="Responsável" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Qualquer responsável</SelectItem>
                  {isDirector && <SelectItem value="none">Sem responsável</SelectItem>}
                  {ownerOptions.map(o => <SelectItem key={o.email} value={o.email}>{o.nome}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={fase} onValueChange={setFase}>
                <SelectTrigger className="h-9 w-full sm:w-auto sm:min-w-[120px]"><SelectValue placeholder="Fase" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as fases</SelectItem>
                  {FASES.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={until} onValueChange={(v) => setUntil(v as UntilKey)}>
                <SelectTrigger className="h-9 w-full sm:w-auto sm:min-w-[120px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Qualquer prazo</SelectItem>
                  <SelectItem value="30">Termina ≤ 30 dias</SelectItem>
                  <SelectItem value="60">Termina ≤ 60 dias</SelectItem>
                  <SelectItem value="90">Termina ≤ 90 dias</SelectItem>
                </SelectContent>
              </Select>
              <label className="col-span-2 sm:col-auto flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none whitespace-nowrap sm:ml-1">
                <input type="checkbox" checked={hideClosed} onChange={(e) => setHideClosed(e.target.checked)} className="rounded border-border" />
                Esconder fechados
              </label>
              <button onClick={load} className="hidden sm:inline-flex items-center sm:ml-auto text-muted-foreground hover:text-foreground" title="Atualizar">
                <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
              </button>
            </div>
          </div>

          {loading ? (
            <Loader />
          ) : filtered.length === 0 ? (
            <EmptyState icon={CalendarClock} title="Sem contratos" hint={contracts.length === 0 ? 'Carregue o mapa de terminações no tab Dados.' : 'Nenhum contrato corresponde aos filtros.'} />
          ) : (
            <>
              {/* Mobile: cartões */}
              <ul className="sm:hidden space-y-2">
                {sorted.map(c => {
                  const d = daysToEnd(c.data_fim);
                  const next = nextByContrato.get(c.contrato);
                  const nextOverdue = next ? isOverdue(next) : false;
                  return (
                    <li key={c.contrato} onClick={() => openContract(c)} className="rounded-xl border border-border bg-card p-3 shadow-sm cursor-pointer active:bg-muted/40">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-medium text-sm truncate">{c.cliente || '—'}</div>
                          <div className="text-[11px] text-muted-foreground truncate">{[c.marca, c.modelo].filter(Boolean).join(' ')}{c.matricula ? ` · ${c.matricula}` : ''}</div>
                        </div>
                        <span className={cn('shrink-0 rounded-full text-[10px] font-medium px-2 py-0.5 whitespace-nowrap', faseCls(c.fase))}>{faseLabel(c.fase)}</span>
                      </div>
                      <div className="mt-2 flex items-center gap-x-3 gap-y-1 flex-wrap text-[11px]">
                        <span className="text-muted-foreground">Fim {c.data_fim ? new Date(c.data_fim).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'}</span>
                        {d != null && <span className={cn(d < 0 ? 'text-muted-foreground' : d <= 30 ? 'text-destructive font-medium' : d <= 60 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground')}>{d < 0 ? 'terminado' : `${d} dias`}</span>}
                        <span className="text-muted-foreground tabular-nums ml-auto">{eur(c.valor_total)}</span>
                      </div>
                      {(c.owner_nome || next) && (
                        <div className="mt-1.5 flex items-center gap-2 flex-wrap text-[11px]">
                          {c.owner_nome && <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2 py-0.5"><UserCheck className="h-3 w-3" />{c.owner_nome}</span>}
                          {next && <span className={cn(nextOverdue ? 'text-destructive font-medium' : 'text-muted-foreground')}>{actTipoLabel(next.tipo)} · {relativeLabel(next.due_at, false).text}</span>}
                        </div>
                      )}
                    </li>
                  );
                })}
                <li className="text-[11px] text-muted-foreground text-center pt-1">{filtered.length} de {contracts.length} contratos</li>
              </ul>

              {/* Desktop: tabela */}
              <div className="hidden sm:block rounded-xl border border-border bg-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                        <SortTh k="cliente" label="Cliente" sort={sort} onSort={toggleSort} />
                        <SortTh k="viatura" label="Viatura" sort={sort} onSort={toggleSort} />
                        <SortTh k="resp" label="Vendedor / Resp." sort={sort} onSort={toggleSort} className="hidden md:table-cell" />
                        <SortTh k="fim" label="Fim" sort={sort} onSort={toggleSort} />
                        <SortTh k="fase" label="Fase" sort={sort} onSort={toggleSort} />
                        <SortTh k="proxima" label="Próxima ação" sort={sort} onSort={toggleSort} className="hidden lg:table-cell" />
                        <SortTh k="total" label="Total" sort={sort} onSort={toggleSort} align="right" />
                        <th className="px-2 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map(c => {
                        const d = daysToEnd(c.data_fim);
                        const next = nextByContrato.get(c.contrato);
                        const nextOverdue = next ? isOverdue(next) : false;
                        return (
                          <tr key={c.contrato} onClick={() => openContract(c)} className="border-b border-border/60 last:border-0 hover:bg-muted/30 cursor-pointer">
                            <td className="px-3 py-2">
                              <div className="font-medium text-foreground truncate max-w-[220px]">{c.cliente || '—'}</div>
                            </td>
                            <td className="px-3 py-2">
                              <div className="truncate max-w-[180px]">{[c.marca, c.modelo].filter(Boolean).join(' ') || '—'}</div>
                              <div className="text-[11px] text-muted-foreground">{c.matricula || ''}</div>
                            </td>
                            <td className="px-3 py-2 hidden md:table-cell text-xs truncate max-w-[170px]">
                              <div className="text-muted-foreground truncate">{c.vendedor || '—'}</div>
                              {c.owner_nome && <div className="inline-flex items-center gap-1 text-primary mt-0.5"><UserCheck className="h-3 w-3 shrink-0" /><span className="truncate">{c.owner_nome}</span></div>}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              <div className="text-xs">{c.data_fim ? new Date(c.data_fim).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'}</div>
                              {d != null && (
                                <div className={cn('text-[11px]', d < 0 ? 'text-muted-foreground' : d <= 30 ? 'text-destructive font-medium' : d <= 60 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground')}>
                                  {d < 0 ? 'terminado' : `${d} dias`}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <span className={cn('inline-block rounded-full text-[11px] font-medium px-2 py-0.5 whitespace-nowrap', faseCls(c.fase))}>{faseLabel(c.fase)}</span>
                            </td>
                            <td className="px-3 py-2 hidden lg:table-cell">
                              {next ? (
                                <div className={cn('text-xs', nextOverdue && 'text-destructive font-medium')}>
                                  {actTipoLabel(next.tipo)} · {relativeLabel(next.due_at, false).text}
                                </div>
                              ) : <span className="text-[11px] text-muted-foreground/60">—</span>}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-xs">{eur(c.valor_total)}</td>
                            <td className="px-2 py-2 text-muted-foreground/40"><ChevronRight className="h-4 w-4" /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="px-3 py-2 text-[11px] text-muted-foreground border-t border-border/60">{filtered.length} de {contracts.length} contratos</div>
              </div>
            </>
          )}
        </TabsContent>

        {/* ── Agenda / follow-up ────────────────────────────────────────────── */}
        <TabsContent value="agenda" className="mt-4">
          {loading ? (
            <Loader />
          ) : agendaView.length === 0 ? (
            <EmptyState icon={CalendarDays} title="Nada agendado" hint="Abra um contrato e agende uma chamada, reunião ou proposta." />
          ) : (
            <ul className="space-y-2">
              {agendaView.map(a => {
                const overdue = isOverdue(a);
                const rel = relativeLabel(a.due_at, false);
                const contract = contracts.find(c => c.contrato === a.contrato);
                return (
                  <li
                    key={a.id}
                    onClick={() => contract && openContract(contract)}
                    className={cn(
                      'flex items-center gap-3 rounded-xl border bg-card px-3.5 py-2.5 shadow-sm cursor-pointer hover:bg-muted/30',
                      overdue ? 'border-destructive/30 ring-1 ring-destructive/10' : 'border-border',
                    )}
                  >
                    <span className={cn('grid place-items-center h-9 w-9 rounded-lg shrink-0', overdue ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary')}>
                      <CalendarClock className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm text-foreground truncate">{a.cliente || 'Cliente'}</span>
                        <span className="text-[11px] text-muted-foreground">· {actTipoLabel(a.tipo)}</span>
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {a.vendedor || '—'}{a.descricao ? ` · ${a.descricao}` : ''}
                      </div>
                    </div>
                    <div className={cn('text-xs font-medium whitespace-nowrap shrink-0', overdue ? 'text-destructive' : 'text-muted-foreground')}>
                      {rel.text}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </TabsContent>
      </Tabs>

      <ContractDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        contract={selected}
        canEdit={editable}
        isDirector={isDirector}
        owners={owners}
        autor={myNome}
        ownerEmail={myEmail}
        onChanged={load}
      />
    </div>
  );
}

function SortTh({ k, label, sort, onSort, className, align = 'left' }: {
  k: SortKey; label: string; sort: SortState; onSort: (k: SortKey) => void; className?: string; align?: 'left' | 'right';
}) {
  const active = sort?.key === k;
  const Icon = !active ? ArrowUpDown : sort!.dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={cn('px-3 py-2 font-medium', align === 'right' && 'text-right', className)}>
      <button type="button" onClick={() => onSort(k)}
        className={cn('inline-flex items-center gap-1 uppercase tracking-wide hover:text-foreground', active && 'text-foreground')}>
        {label}
        <Icon className={cn('h-3 w-3', !active && 'opacity-40')} />
      </button>
    </th>
  );
}

function Kpi({ label, value, tone = 'default' }: { label: string; value: number; tone?: 'default' | 'warn' | 'good' }) {
  return (
    <div className="rounded-xl border border-border bg-card px-3.5 py-3 shadow-sm">
      <div className={cn(
        'text-2xl font-bold tabular-nums leading-none',
        tone === 'warn' ? 'text-destructive' : tone === 'good' ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground',
      )}>{value}</div>
      <div className="text-[11px] text-muted-foreground mt-1 leading-tight">{label}</div>
    </div>
  );
}

function Loader() {
  return <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>;
}
