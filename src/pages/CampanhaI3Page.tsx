import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, CalendarCheck, Clock, Download, Inbox, Loader2, Megaphone, PhoneCall, RefreshCw, Search,
  Shuffle, Trophy, Upload, UserCheck, UserX,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { usePermissions } from '@/contexts/PermissionsContext';
import { ImportDialog } from '@/components/campanha-i3/ImportDialog';
import { DistribuirDialog } from '@/components/campanha-i3/DistribuirDialog';
import { LeadSheet } from '@/components/campanha-i3/LeadSheet';
import {
  ESTADOS, TAB_KEY, assignLeads, deleteLeads, diasDesde, estadoDef, exportLeads, filtrar, fmtDia, hojeIso, isAtrasada, isParada,
  kpis, listLeads, listVendedores, polosUsados, resumoPorVendedor, telHref,
  type Lead, type LeadFiltro, type Vendedor,
} from '@/lib/campanha-i3';

/* ── Tab Campanha i3 (Vendas VN) ──────────────────────────────────────────────
 * Oportunidades de contacto de uma campanha. O administrador importa a tabela (as
 * vezes que forem precisas ao longo do dia), delega cada oportunidade num vendedor — uma a
 * uma, em lote ou repartindo por igual — e vê como está cada vendedor. O vendedor vê só as
 * suas e regista o acompanhamento: estado, ponto de situação, observações, próximo contacto.
 * A visibilidade imposta é a da base de dados (RLS); a interface só a espelha.
 * ──────────────────────────────────────────────────────────────────────────── */

type Preset = 'porDelegar' | 'porContactar' | 'emCurso' | 'agendados' | 'ganhos' | 'atrasadas' | 'paradas';

const PRESETS: Record<Preset, Pick<LeadFiltro, 'estado' | 'quick'> & { owner?: string }> = {
  porDelegar:   { estado: 'ativas', quick: null, owner: 'none' },
  porContactar: { estado: 'novo', quick: null },
  emCurso:      { estado: 'ativas', quick: null },
  agendados:    { estado: 'agendado', quick: null },
  ganhos:       { estado: 'ganho', quick: null },
  atrasadas:    { estado: 'ativas', quick: 'atrasadas' },
  paradas:      { estado: 'ativas', quick: 'paradas' },
};

export default function CampanhaI3Page() {
  const { isAdmin, canEdit, effectiveEmail } = usePermissions();
  const editable = canEdit(TAB_KEY);

  const [all, setAll] = useState<Lead[]>([]);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [filtro, setFiltro] = useState<LeadFiltro>({ estado: 'ativas', owner: 'all', polo: 'all', quick: null, q: '' });
  const patch = (p: Partial<LeadFiltro>) => setFiltro(f => ({ ...f, ...p }));

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [showDistribuir, setShowDistribuir] = useState(false);
  const [showResumo, setShowResumo] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setAll(await listLeads());
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Erro ao carregar as oportunidades.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!isAdmin) return;
    listVendedores().then(setVendedores).catch(() => setVendedores([]));
  }, [isAdmin]);

  // Em "ver como" a base de dados continua a responder ao administrador: a interface
  // mostra só o que seria do utilizador simulado.
  const leads = useMemo(
    () => (isAdmin || !effectiveEmail ? all : all.filter(l => l.owner_email === effectiveEmail.toLowerCase())),
    [all, isAdmin, effectiveEmail]);

  const resumo = useMemo(() => kpis(leads), [leads]);
  const porVendedor = useMemo(() => resumoPorVendedor(leads), [leads]);
  const polos = useMemo(() => polosUsados(leads), [leads]);
  const visiveis = useMemo(() => filtrar(leads, filtro), [leads, filtro]);
  const open = useMemo(() => leads.find(l => l.id === openId) ?? null, [leads, openId]);
  const hoje = hojeIso();

  // Nome do responsável: os vendedores conhecidos primeiro, senão o que ficou na oportunidade.
  const ownerOptions = useMemo(() => {
    const m = new Map(vendedores.map(v => [v.email, v.nome]));
    for (const l of leads) if (l.owner_email && !m.has(l.owner_email)) m.set(l.owner_email, l.owner_nome ?? l.owner_email);
    return [...m.entries()].map(([email, nome]) => ({ email, nome })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));
  }, [vendedores, leads]);

  const upsertLocal = (updated: Lead[]) => {
    const m = new Map(updated.map(l => [l.id, l]));
    setAll(list => list.map(l => m.get(l.id) ?? l));
  };

  const isPreset = (p: Preset) => {
    const d = PRESETS[p];
    return (filtro.estado ?? 'ativas') === d.estado && (filtro.quick ?? null) === d.quick
      && (filtro.owner ?? 'all') === (d.owner ?? 'all') && !filtro.q && (filtro.polo ?? 'all') === 'all';
  };
  const applyPreset = (p: Preset) => {
    const d = PRESETS[p];
    setFiltro(f => ({ ...f, estado: d.estado, quick: d.quick ?? null, owner: d.owner ?? 'all' }));
    setSelected(new Set());
  };

  /* ── Ações ──────────────────────────────────────────────────────────────── */

  const delegar = async (ids: string[], v: Vendedor | null) => {
    setBusy(true);
    try {
      upsertLocal(await assignLeads(ids, v));
      toast.success(v ? `${ids.length} delegada${ids.length > 1 ? 's' : ''} a ${v.nome}.` : 'Delegação retirada.');
      setSelected(new Set());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível delegar.');
    } finally {
      setBusy(false);
    }
  };

  const apagar = async (ids: string[]) => {
    setBusy(true);
    try {
      await deleteLeads(ids);
      const gone = new Set(ids);
      setAll(list => list.filter(l => !gone.has(l.id)));
      setSelected(new Set());
      setOpenId(null);
      toast.success(ids.length === 1 ? 'Oportunidade apagada.' : `${ids.length} oportunidades apagadas.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível apagar.');
    } finally {
      setBusy(false);
    }
  };

  const toggleSel = (id: string, on: boolean) =>
    setSelected(s => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });
  const allSelected = visiveis.length > 0 && visiveis.every(l => selected.has(l.id));
  const toggleAll = (on: boolean) => setSelected(on ? new Set(visiveis.map(l => l.id)) : new Set());

  /* ── Render ─────────────────────────────────────────────────────────────── */

  const kpiCard = (p: Preset, icon: React.ReactNode, label: string, value: number, tone: string) => (
    <button
      key={p} type="button" onClick={() => applyPreset(p)} aria-pressed={isPreset(p)}
      className={cn('flex items-center gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted/50', isPreset(p) && 'border-primary ring-1 ring-primary')}
    >
      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-md', tone)}>{icon}</span>
      <span>
        <span className="block text-xl font-bold leading-none">{value}</span>
        <span className="mt-1 block text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
      </span>
    </button>
  );

  const vendedorDe = (email: string): Vendedor => ({ email, nome: ownerOptions.find(o => o.email === email)?.nome ?? email });

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Megaphone className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-bold tracking-tight">Campanha i3</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="icon" onClick={() => void load()} disabled={loading} aria-label="Atualizar">
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </Button>
          {leads.length > 0 && (
            <Button type="button" variant="outline" onClick={() => exportLeads(visiveis)}>
              <Download className="mr-1.5 h-4 w-4" /> Exportar
            </Button>
          )}
          {isAdmin && (
            <>
              <Button type="button" variant="outline" onClick={() => setShowDistribuir(true)} disabled={resumo.porDelegar === 0}>
                <Shuffle className="mr-1.5 h-4 w-4" /> Distribuir
              </Button>
              <Button type="button" onClick={() => setShowImport(true)}>
                <Upload className="mr-1.5 h-4 w-4" /> Importar
              </Button>
            </>
          )}
        </div>
      </div>

      {loadError && (
        <div role="alert" className="flex items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {loadError}
          <Button type="button" size="sm" variant="outline" onClick={() => void load()}>Tentar de novo</Button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        {isAdmin && kpiCard('porDelegar', <UserX className="h-4 w-4" />, 'Por delegar', resumo.porDelegar, 'bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300')}
        {kpiCard('porContactar', <PhoneCall className="h-4 w-4" />, 'Por contactar', resumo.porContactar, 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300')}
        {kpiCard('emCurso', <Inbox className="h-4 w-4" />, 'Em curso', resumo.emCurso, 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300')}
        {kpiCard('agendados', <CalendarCheck className="h-4 w-4" />, 'Agendados', resumo.agendados, 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300')}
        {kpiCard('ganhos', <Trophy className="h-4 w-4" />, 'Ganhos', resumo.ganhos, 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300')}
        {kpiCard('atrasadas', <AlertTriangle className="h-4 w-4" />, 'Atrasadas', resumo.atrasadas, 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300')}
        {kpiCard('paradas', <Clock className="h-4 w-4" />, 'Sem acompanhamento', resumo.paradas, 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300')}
      </div>

      {isAdmin && porVendedor.length > 0 && (
        <div className="rounded-lg border bg-card">
          <button type="button" onClick={() => setShowResumo(s => !s)} aria-expanded={showResumo}
            className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium">
            <span className="flex items-center gap-2"><UserCheck className="h-4 w-4" /> Por vendedor</span>
            <span className="text-xs text-muted-foreground">{showResumo ? 'Esconder' : 'Mostrar'}</span>
          </button>
          {showResumo && (
            <div className="overflow-x-auto border-t">
              <table className="w-full text-sm" data-testid="resumo-vendedores">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-1.5">Vendedor</th>
                    <th className="px-2 py-1.5 text-right">Delegadas</th>
                    <th className="px-2 py-1.5 text-right">Por contactar</th>
                    <th className="px-2 py-1.5 text-right">Em curso</th>
                    <th className="px-2 py-1.5 text-right">Agendados</th>
                    <th className="px-2 py-1.5 text-right">Ganhos</th>
                    <th className="px-2 py-1.5 text-right">Atrasadas</th>
                    <th className="px-3 py-1.5 text-right">Paradas</th>
                  </tr>
                </thead>
                <tbody>
                  {porVendedor.map(r => (
                    <tr key={r.email} className="cursor-pointer border-t hover:bg-muted/50" onClick={() => patch({ owner: r.email, estado: 'ativas', quick: null })}>
                      <td className="px-3 py-1.5 font-medium">{r.nome}</td>
                      <td className="px-2 py-1.5 text-right">{r.delegadas}</td>
                      <td className="px-2 py-1.5 text-right">{r.porContactar}</td>
                      <td className="px-2 py-1.5 text-right">{r.emCurso}</td>
                      <td className="px-2 py-1.5 text-right">{r.agendados}</td>
                      <td className="px-2 py-1.5 text-right">{r.ganhos}</td>
                      <td className={cn('px-2 py-1.5 text-right', r.atrasadas > 0 && 'font-semibold text-red-600')}>{r.atrasadas}</td>
                      <td className={cn('px-3 py-1.5 text-right', r.paradas > 0 && 'font-semibold text-orange-600')}>{r.paradas}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={filtro.q ?? ''} onChange={e => patch({ q: e.target.value })} placeholder="Pesquisar nome, email, telefone…" className="pl-8" aria-label="Pesquisar" />
        </div>
        <Select value={filtro.quick ? 'ativas' : (filtro.estado ?? 'ativas')} onValueChange={v => patch({ estado: v as LeadFiltro['estado'], quick: null })}>
          <SelectTrigger className="w-[140px]" aria-label="Estado"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ativas">Em curso</SelectItem>
            <SelectItem value="all">Todas</SelectItem>
            {ESTADOS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        {isAdmin && (
          <Select value={filtro.owner ?? 'all'} onValueChange={v => patch({ owner: v })}>
            <SelectTrigger className="w-[170px]" aria-label="Responsável"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os vendedores</SelectItem>
              <SelectItem value="none">Por delegar</SelectItem>
              {ownerOptions.map(o => <SelectItem key={o.email} value={o.email}>{o.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {polos.length > 1 && (
          <Select value={filtro.polo ?? 'all'} onValueChange={v => patch({ polo: v })}>
            <SelectTrigger className="w-[160px]" aria-label="Polo"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os polos</SelectItem>
              {polos.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Button type="button" variant={filtro.quick === 'novas_hoje' ? 'default' : 'outline'} size="sm"
          onClick={() => patch({ quick: filtro.quick === 'novas_hoje' ? null : 'novas_hoje', estado: 'all' })}>
          Importadas hoje
        </Button>
      </div>

      {isAdmin && selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 text-sm" data-testid="barra-lote">
          <span className="font-medium">{selected.size} selecionada{selected.size > 1 ? 's' : ''}</span>
          <Select value="" onValueChange={email => void delegar([...selected], vendedorDe(email))} disabled={busy}>
            <SelectTrigger className="w-[190px]" aria-label="Delegar a"><SelectValue placeholder="Delegar a…" /></SelectTrigger>
            <SelectContent>{ownerOptions.map(o => <SelectItem key={o.email} value={o.email}>{o.nome}</SelectItem>)}</SelectContent>
          </Select>
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void delegar([...selected], null)}>Retirar delegação</Button>
          <Button type="button" size="sm" variant="ghost" className="text-destructive hover:text-destructive" disabled={busy} onClick={() => setConfirmBulkDelete(true)}>Apagar</Button>
          <Button type="button" size="sm" variant="ghost" className="ml-auto" onClick={() => setSelected(new Set())}>Limpar</Button>
        </div>
      )}

      {loading && all.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> A carregar…
        </div>
      ) : visiveis.length === 0 ? (
        <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
          <Megaphone className="mx-auto mb-2 h-6 w-6" />
          {leads.length === 0
            ? (isAdmin ? 'Ainda não há oportunidades. Importa a primeira tabela.' : 'Ainda não tens oportunidades delegadas.')
            : 'Nenhuma oportunidade com estes filtros.'}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm" data-testid="lista-leads">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                {isAdmin && <th className="w-8 px-3 py-2"><Checkbox checked={allSelected} onCheckedChange={c => toggleAll(c === true)} aria-label="Selecionar todas" /></th>}
                <th className="px-3 py-2">Nome</th>
                <th className="px-3 py-2">Contacto</th>
                <th className="hidden px-3 py-2 md:table-cell">Polo</th>
                <th className="hidden px-3 py-2 lg:table-cell">Contactou em</th>
                {isAdmin && <th className="px-3 py-2">Responsável</th>}
                <th className="px-3 py-2">Estado</th>
                <th className="hidden px-3 py-2 xl:table-cell">Ponto de situação</th>
                <th className="px-3 py-2">Próx. contacto</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map(l => {
                const est = estadoDef(l.estado);
                const atrasada = isAtrasada(l, hoje);
                const parada = isParada(l);
                const tel = telHref(l.contacto);
                return (
                  <tr key={l.id} onClick={() => setOpenId(l.id)} className={cn('cursor-pointer border-t hover:bg-muted/50', selected.has(l.id) && 'bg-primary/5')}>
                    {isAdmin && (
                      <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                        <Checkbox checked={selected.has(l.id)} onCheckedChange={c => toggleSel(l.id, c === true)} aria-label={`Selecionar ${l.nome}`} />
                      </td>
                    )}
                    <td className="px-3 py-2">
                      <span className="block font-medium">{l.nome}</span>
                      {l.email && <span className="block max-w-[220px] truncate text-xs text-muted-foreground">{l.email}</span>}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                      {l.contacto ? (tel ? <a href={tel} className="text-primary hover:underline">{l.contacto}</a> : l.contacto) : '—'}
                    </td>
                    <td className="hidden px-3 py-2 md:table-cell">{l.polo ?? '—'}</td>
                    <td className="hidden px-3 py-2 whitespace-nowrap lg:table-cell">{fmtDia(l.data_contacto)}</td>
                    {isAdmin && (
                      <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                        <Select value={l.owner_email ?? 'none'} disabled={busy}
                          onValueChange={v => void delegar([l.id], v === 'none' ? null : vendedorDe(v))}>
                          <SelectTrigger className="h-8 w-[150px] text-xs" aria-label={`Responsável de ${l.nome}`}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">— Por delegar —</SelectItem>
                            {ownerOptions.map(o => <SelectItem key={o.email} value={o.email}>{o.nome}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>
                    )}
                    <td className="px-3 py-2">
                      <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', est.cls)}>{est.label}</span>
                      {parada && <span className="ml-1 text-[11px] font-medium text-orange-600" title="Sem acompanhamento há dias">●</span>}
                    </td>
                    <td className="hidden max-w-[260px] truncate px-3 py-2 text-xs text-muted-foreground xl:table-cell">{l.ponto_situacao ?? '—'}</td>
                    <td className={cn('px-3 py-2 whitespace-nowrap text-xs', atrasada && 'font-semibold text-red-600')}>
                      {l.proximo_contacto ? fmtDia(l.proximo_contacto) : '—'}
                      {atrasada && ` (há ${diasDesde(l.proximo_contacto as string)} d)`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">{visiveis.length} de {leads.length} oportunidades.</p>

      <LeadSheet
        lead={open} canEdit={editable} isAdmin={isAdmin}
        onClose={() => setOpenId(null)}
        onSaved={l => upsertLocal([l])}
        onDelete={l => void apagar([l.id])}
      />

      {isAdmin && (
        <>
          <ImportDialog
            open={showImport} existentes={all} onClose={() => setShowImport(false)}
            onImported={(novas, dup) => {
              setAll(list => [...novas, ...list]);
              setShowImport(false);
              toast.success(`${novas.length} oportunidade${novas.length === 1 ? '' : 's'} importada${novas.length === 1 ? '' : 's'}${dup > 0 ? ` · ${dup} já existia${dup === 1 ? '' : 'm'}` : ''}.`);
            }}
          />
          <DistribuirDialog
            open={showDistribuir} leads={all} vendedores={vendedores} onClose={() => setShowDistribuir(false)}
            onDone={upd => { upsertLocal(upd); setShowDistribuir(false); }}
          />
          <AlertDialog open={confirmBulkDelete} onOpenChange={setConfirmBulkDelete}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Apagar {selected.size} oportunidades?</AlertDialogTitle>
                <AlertDialogDescription>Deixam de existir, com o respetivo histórico. Se a lista for importada outra vez, voltam a entrar como novas.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => void apagar([...selected])}>Apagar</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </div>
  );
}
