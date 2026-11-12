import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Archive, ArchiveRestore, Ban, History, Loader2, Pencil, Plus, RefreshCw, Search, ShieldCheck, ShieldPlus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { usePermissions } from '@/contexts/PermissionsContext';
import {
  AREAS_SEGURO, COBERTURAS, ESTADOS_SEGURO, MOTIVOS_ARQUIVO,
  alertas, areaLabel, arquivarSeguro, coberturaLabel, createSeguro, custoPorArea, deleteSeguro, diasParaFim,
  copiarTexto, dadosEmFalta, emptyForm, historicoLabel, listHistoricoSeguro, marcarCancelamentoPedido, mensagemCancelamento,
  upgradeDanosProprios, validarUpgrade, estadoDef, estadoSeguro, filtrar, fmtDia, fmtEuro, formFromSeguro, hojeIso, kpis, listParque,
  listSeguros, listVendidas, motivoLabel, normMatricula, parqueSemMatricula, parqueSemSeguro, textoVenda, vendaDe, ORIGENS_PARQUE, reativarSeguro, updateSeguro, validarForm,
  type Area, type Cobertura, type HistoricoSeguro, type UpgradeValues, type EstadoSeguro, type MotivoArquivo, type Seguro, type SeguroFormValues,
  type ViaturaParque, type ViaturaVendida,
} from '@/lib/seguros';

/* ── Tab Seguros (Transversal) ────────────────────────────────────────────────
 * Controlo dos seguros das viaturas a serviço de alguém ou de um cliente, em
 * qualquer área (BMW VN, BMW VU, Motorrad, Após-venda). Garante que não se circula
 * sem seguro (expirados por arquivar) nem se paga seguro de viaturas já vendidas
 * (cruzamento por matrícula com o arquivo de vendidas) e dá o custo (prémios) por área.
 * 'view' consulta; 'edit' regista, altera e arquiva; só o administrador apaga.
 * ──────────────────────────────────────────────────────────────────────────── */

type Separador = 'ativos' | 'arquivados';

export default function SegurosPage() {
  const { canEdit, isAdmin } = usePermissions();
  const editable = canEdit('seguros');

  const [list, setList] = useState<Seguro[]>([]);
  const [parque, setParque] = useState<ViaturaParque[]>([]);
  const [vendidas, setVendidas] = useState<ViaturaVendida[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [separador, setSeparador] = useState<Separador>('ativos');
  // A notificação "cancelar seguro" abre o tab já filtrado pela matrícula (/seguros?mat=…).
  const [q, setQ] = useState(() => { try { return new URLSearchParams(window.location.search).get('mat') ?? ''; } catch { return ''; } });
  const [area, setArea] = useState<Area | 'all'>('all');
  const [cobertura, setCobertura] = useState<Cobertura | 'all'>('all');
  const [estado, setEstado] = useState<EstadoSeguro | 'all'>('all');

  const [formOpen, setFormOpen] = useState<{ id: string | null; initial: SeguroFormValues } | null>(null);
  const [aArquivar, setAArquivar] = useState<{ s: Seguro; motivo: MotivoArquivo } | null>(null);
  const [aApagar, setAApagar] = useState<Seguro | null>(null);
  const [aCancelar, setACancelar] = useState<Seguro | null>(null);
  const [aUpgrade, setAUpgrade] = useState<Seguro | null>(null);
  const [verHistorico, setVerHistorico] = useState<Seguro | null>(null);

  const hoje = hojeIso();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, p, v] = await Promise.all([listSeguros(), listParque(), listVendidas()]);
      setList(s); setParque(p); setVendidas(v); setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Erro ao carregar os seguros.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const resumo = useMemo(() => kpis(list, vendidas, hoje), [list, vendidas, hoje]);
  const avisos = useMemo(() => alertas(list, vendidas, hoje), [list, vendidas, hoje]);
  const custo = useMemo(() => custoPorArea(list, hoje), [list, hoje]);
  const semSeguro = useMemo(() => parqueSemSeguro(parque, list, hoje), [parque, list, hoje]);
  const semMatricula = useMemo(() => parqueSemMatricula(parque), [parque]);
  const vendidasSet = useMemo(() => new Set(vendidas.map(v => normMatricula(v.matricula))), [vendidas]);

  const visiveis = useMemo(
    () => filtrar(list, { separador, area, cobertura, estado: separador === 'ativos' ? estado : 'all', q }, hoje),
    [list, separador, area, cobertura, estado, q, hoje],
  );
  const nArquivados = useMemo(() => list.filter(s => s.arquivado).length, [list]);

  const replace = (upd: Seguro) => setList(l => l.map(s => (s.id === upd.id ? upd : s)));

  const submitForm = async (v: SeguroFormValues) => {
    if (!formOpen) return;
    setSaving(true);
    try {
      if (formOpen.id) { replace(await updateSeguro(formOpen.id, v)); toast.success('Seguro guardado.'); }
      else { const c = await createSeguro(v); setList(l => [c, ...l]); toast.success('Seguro registado.'); }
      setFormOpen(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível guardar.');
    } finally {
      setSaving(false);
    }
  };

  const confirmarArquivo = async () => {
    if (!aArquivar) return;
    setSaving(true);
    try {
      replace(await arquivarSeguro(aArquivar.s.id, aArquivar.motivo));
      toast.success('Seguro arquivado.');
      setAArquivar(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível arquivar.');
    } finally {
      setSaving(false);
    }
  };

  const reativar = async (s: Seguro) => {
    setSaving(true);
    try { replace(await reativarSeguro(s.id)); toast.success('Seguro reativado.'); }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Não foi possível reativar.'); }
    finally { setSaving(false); }
  };

  const apagar = async () => {
    if (!aApagar) return;
    setSaving(true);
    try {
      await deleteSeguro(aApagar.id);
      setList(l => l.filter(s => s.id !== aApagar.id));
      toast.success('Seguro apagado.');
      setAApagar(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível apagar.');
    } finally {
      setSaving(false);
    }
  };

  const novo = (matricula?: string, p?: ViaturaParque) => setFormOpen({
    id: null,
    initial: {
      ...emptyForm(hoje),
      matricula: matricula ?? '',
      chassis: p?.chassis ?? '',
      viatura: p ? [p.marca, p.modelo, p.versao].filter(Boolean).join(' ') : '',
      area: p?.area ?? 'bmw_vn',
    },
  });

  /* ── Render ─────────────────────────────────────────────────────────────── */

  const temAlertas = avisos.expirados.length + avisos.vendidosAtivos.length + avisos.sobrepostos.length
    + semSeguro.length + resumo.dadosEmFalta > 0;

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold"><ShieldCheck className="h-5 w-5 text-primary" /> Seguros</h1>
          <p className="text-sm text-muted-foreground">Seguros das viaturas a serviço de colaboradores e clientes, em todas as áreas.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} aria-label="Atualizar">
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </Button>
          {editable && <Button size="sm" onClick={() => novo()}><Plus className="mr-1 h-4 w-4" /> Novo seguro</Button>}
        </div>
      </div>

      {loadError && <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{loadError}</div>}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
        <Kpi label="Ativos" value={resumo.ativos} />
        <Kpi label="Parque sem seguro" value={semSeguro.length} tone={semSeguro.length ? 'bad' : undefined} />
        <Kpi label="A expirar (≤30 dias)" value={resumo.aExpirar} tone={resumo.aExpirar ? 'warn' : undefined} />
        <Kpi label="Expirados por arquivar" value={resumo.expirados} tone={resumo.expirados ? 'bad' : undefined} />
        <Kpi label="Dar baixa (vendidas)" value={resumo.vendidosAtivos} tone={resumo.vendidosAtivos ? 'bad' : undefined} />
        <Kpi label="Danos próprios incompletos" value={resumo.dadosEmFalta} tone={resumo.dadosEmFalta ? 'warn' : undefined} />
        <Kpi label="Prémios ativos" value={fmtEuro(resumo.premioAtivo)} hint={resumo.capitalAtivo ? `Capital seguro ${fmtEuro(resumo.capitalAtivo)}` : undefined} />
      </div>

      {/* Alertas de controlo */}
      {temAlertas && (
        <div className="space-y-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm dark:border-red-500/40 dark:bg-red-500/10" data-testid="alertas">
          <p className="flex items-center gap-1.5 font-semibold text-red-700 dark:text-red-300">
            <AlertTriangle className="h-4 w-4" /> Requer ação
          </p>
          {avisos.expirados.length > 0 && (
            <AlertaLinha titulo="Seguro terminado e por arquivar — a viatura pode estar a circular sem seguro" seguros={avisos.expirados}
              render={s => `${s.matricula} · terminou há ${-(diasParaFim(s, hoje) ?? 0)} d`} onOpen={s => editable && setFormOpen({ id: s.id, initial: formFromSeguro(s) })} />
          )}
          {avisos.vendidosAtivos.length > 0 && (
            <AlertaLinha titulo="DAR BAIXA: viatura vendida com seguro por cancelar" seguros={avisos.vendidosAtivos}
              render={s => { const v = vendaDe(s, vendidas); return `${s.matricula} · ${v ? textoVenda(v) : 'vendida'}`; }}
              onOpen={s => editable && setAArquivar({ s, motivo: 'viatura_vendida' })} />
          )}
          {resumo.dadosEmFalta > 0 && (
            <p><strong>{resumo.dadosEmFalta}</strong> seguro{resumo.dadosEmFalta === 1 ? '' : 's'} de danos próprios sem todos os dados obrigatórios (valor seguro, início, fim e responsável pela informação) — completar.</p>
          )}
          {avisos.sobrepostos.map(g => (
            <p key={g.matricula}>
              <strong>{g.matricula}</strong> tem {g.seguros.length} seguros sobrepostos no tempo — custo duplicado.
            </p>
          ))}
        </div>
      )}

      {/* Custo por área */}
      {custo.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs" data-testid="custo-area">
          {custo.map(c => (
            <span key={c.area} className="rounded-md border bg-card px-2.5 py-1">
              <strong>{areaLabel(c.area)}</strong> · {c.seguros} seguro{c.seguros === 1 ? '' : 's'} · {fmtEuro(c.premio)}
            </span>
          ))}
        </div>
      )}

      {/* Separadores e filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={separador} onValueChange={v => setSeparador(v as Separador)}>
          <TabsList>
            <TabsTrigger value="ativos">Ativos ({list.length - nArquivados})</TabsTrigger>
            <TabsTrigger value="arquivados">Arquivados ({nArquivados})</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Matrícula, viatura, pedido por, cliente, apólice…" className="pl-8" aria-label="Pesquisar" />
        </div>
        <FiltroSelect label="Área" value={area} onChange={v => setArea(v as Area | 'all')} options={AREAS_SEGURO} />
        <FiltroSelect label="Cobertura" value={cobertura} onChange={v => setCobertura(v as Cobertura | 'all')} options={COBERTURAS} />
        {separador === 'ativos' && (
          <FiltroSelect label="Estado" value={estado} onChange={v => setEstado(v as EstadoSeguro | 'all')}
            options={ESTADOS_SEGURO.filter(e => e.value !== 'arquivado')} />
        )}
      </div>

      {/* Tabela */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> A carregar…</div>
      ) : visiveis.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
          {list.length === 0 ? 'Ainda não há seguros registados.' : 'Nenhum seguro corresponde aos filtros.'}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[60rem] text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Matrícula / viatura</th>
                <th className="px-3 py-2">Área</th>
                <th className="px-3 py-2">Pedido por</th>
                <th className="px-3 py-2">Pedido em</th>
                <th className="px-3 py-2">Período</th>
                <th className="px-3 py-2">Cobertura</th>
                <th className="px-3 py-2 text-right">Valor seguro</th>
                <th className="px-3 py-2 text-right">Prémio</th>
                <th className="px-3 py-2">{separador === 'ativos' ? 'Estado' : 'Arquivo'}</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {visiveis.map(s => {
                const est = estadoSeguro(s, hoje);
                const def = estadoDef(est);
                const venda = s.arquivado ? null : vendaDe(s, vendidas);
                const vendida = !!venda;
                const falta = dadosEmFalta(s);
                return (
                  <tr key={s.id} data-testid="seguro" className={cn('border-t align-top', vendida && 'bg-red-50 dark:bg-red-500/10')}>
                    <td className="px-3 py-2">
                      <div className="font-mono font-medium">{s.matricula}</div>
                      <div className="text-xs text-muted-foreground">{s.viatura}</div>
                      {venda && <Badge variant="destructive" className="mt-1 whitespace-normal">DAR BAIXA · {textoVenda(venda)}</Badge>}
                      {s.cancelamento_pedido_em && !s.arquivado && <Badge variant="outline" className="mt-1 whitespace-normal">Cancelamento pedido em {fmtDia(s.cancelamento_pedido_em)}</Badge>}
                      {s.dp_desde && s.cobertura === 'danos_proprios' && <div className="mt-1 text-xs text-muted-foreground">Danos próprios desde {fmtDia(s.dp_desde)}</div>}
                      {falta.length > 0 && <Badge variant="outline" className="mt-1 whitespace-normal border-amber-500 text-amber-700 dark:text-amber-300">Em falta: {falta.join(', ')}</Badge>}
                    </td>
                    <td className="px-3 py-2">{areaLabel(s.area)}</td>
                    <td className="px-3 py-2">
                      <div>{s.solicitante}</div>
                      {s.cliente && <div className="text-xs text-muted-foreground">Cliente: {s.cliente}</div>}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{fmtDia(s.data_pedido)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {fmtDia(s.inicio)} → {s.fim ? fmtDia(s.fim) : 'sem termo'}
                      {!s.arquivado && est !== 'futuro' && s.fim && (
                        <div className="text-xs text-muted-foreground">
                          {(diasParaFim(s, hoje) ?? 0) >= 0 ? `faltam ${diasParaFim(s, hoje)} d` : `terminou há ${-(diasParaFim(s, hoje) ?? 0)} d`}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {coberturaLabel(s.cobertura)}
                      {s.seguradora && <div className="text-xs text-muted-foreground">{s.seguradora}{s.apolice ? ` · ${s.apolice}` : ''}</div>}
                    </td>
                    <td className="px-3 py-2 text-right">{s.cobertura === 'danos_proprios' ? fmtEuro(s.capital_seguro) : '—'}</td>
                    <td className="px-3 py-2 text-right">{fmtEuro(s.premio)}</td>
                    <td className="px-3 py-2">
                      {separador === 'ativos'
                        ? <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', def.cls)}>{def.label}</span>
                        : <><div>{motivoLabel(s.motivo_arquivo)}</div><div className="text-xs text-muted-foreground">{fmtDia(s.arquivado_em)}</div></>}
                    </td>
                    <td className="px-3 py-2">
                      {editable && (
                        <div className="flex flex-wrap justify-end gap-1">
                          {!s.arquivado && <Button size="sm" variant="outline" aria-label={`Cancelar seguro ${s.matricula}`} onClick={() => setACancelar(s)}><Ban className="mr-1 h-3.5 w-3.5" />Cancelar seguro</Button>}
                          {!s.arquivado && s.cobertura === 'terceiros' && <Button size="sm" variant="outline" aria-label={`Upgrade para danos próprios ${s.matricula}`} onClick={() => setAUpgrade(s)}><ShieldPlus className="mr-1 h-3.5 w-3.5" />Danos próprios</Button>}
                          <Button size="icon" variant="ghost" aria-label={`Histórico ${s.matricula}`} onClick={() => setVerHistorico(s)}><History className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" aria-label={`Editar ${s.matricula}`}
                            onClick={() => setFormOpen({ id: s.id, initial: formFromSeguro(s) })}><Pencil className="h-4 w-4" /></Button>
                          {s.arquivado
                            ? <Button size="icon" variant="ghost" aria-label={`Reativar ${s.matricula}`} disabled={saving} onClick={() => void reativar(s)}><ArchiveRestore className="h-4 w-4" /></Button>
                            : <Button size={vendida ? 'sm' : 'icon'} variant={vendida ? 'destructive' : 'ghost'} aria-label={`Arquivar ${s.matricula}`}
                                onClick={() => setAArquivar({ s, motivo: vendida ? 'viatura_vendida' : 'terminado' })}>
                                {vendida ? 'Dar baixa' : <Archive className="h-4 w-4" />}</Button>}
                          {isAdmin && <Button size="icon" variant="ghost" aria-label={`Apagar ${s.matricula}`} onClick={() => setAApagar(s)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Parque que tem de estar segurado: Demos VN e Stock VU — sempre à vista */}
      {(semSeguro.length > 0 || semMatricula.length > 0) && (
        <div className="rounded-lg border border-red-300 p-3 text-sm dark:border-red-500/40" data-testid="parque-sem-seguro">
          <p className="mb-2 font-semibold">
            Viaturas sem seguro ({semSeguro.length}) <span className="font-normal text-muted-foreground">— Demos VN e Stock VU</span>
          </p>
          <ul className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
            {semSeguro.map(v => (
              <li key={v.ref} className="flex items-center justify-between gap-2 rounded border px-2 py-1">
                <span>
                  <span className="font-mono">{v.matricula}</span>{' '}
                  <span className="text-xs text-muted-foreground">{[v.marca, v.modelo].filter(Boolean).join(' ')}</span>{' '}
                  <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">{ORIGENS_PARQUE[v.origem]}</Badge>
                </span>
                {editable && <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => novo(v.matricula ?? '', v)}>Registar</Button>}
              </li>
            ))}
          </ul>
          {semMatricula.length > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              Ainda sem matrícula (não se podem segurar): {semMatricula.map(v => `${v.modelo ?? '—'} (${ORIGENS_PARQUE[v.origem]})`).join(' · ')}
            </p>
          )}
        </div>
      )}

      {/* Formulário */}
      {formOpen && (
        <SeguroForm
          key={formOpen.id ?? 'novo'} initial={formOpen.initial} editing={!!formOpen.id} saving={saving}
          parque={parque} vendidasSet={vendidasSet} outros={list.filter(s => s.id !== formOpen.id && !s.arquivado)}
          onSubmit={submitForm} onClose={() => setFormOpen(null)}
        />
      )}

      {/* Arquivar */}
      <Dialog open={!!aArquivar} onOpenChange={o => !o && setAArquivar(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Arquivar seguro {aArquivar?.s.matricula}</DialogTitle>
            <DialogDescription>Deixa de contar como ativo e passa para os arquivados. Podes reativá-lo depois.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="seg-motivo">Motivo</Label>
            <Select value={aArquivar?.motivo} onValueChange={v => setAArquivar(a => a && { ...a, motivo: v as MotivoArquivo })}>
              <SelectTrigger id="seg-motivo"><SelectValue /></SelectTrigger>
              <SelectContent>{MOTIVOS_ARQUIVO.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAArquivar(null)}>Cancelar</Button>
            <Button onClick={() => void confirmarArquivo()} disabled={saving}>Arquivar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {aCancelar && (
        <CancelarSeguroDialog s={aCancelar} venda={vendaDe(aCancelar, vendidas)} onClose={() => setACancelar(null)}
          onCopiado={upd => { replace(upd); }} />
      )}
      {aUpgrade && (
        <UpgradeDialog s={aUpgrade} onClose={() => setAUpgrade(null)}
          onDone={upd => { replace(upd); setAUpgrade(null); toast.success('Upgrade para danos próprios registado.'); }} />
      )}
      {verHistorico && <HistoricoDialog s={verHistorico} onClose={() => setVerHistorico(null)} />}

      {/* Apagar (admin) */}
      <Dialog open={!!aApagar} onOpenChange={o => !o && setAApagar(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apagar seguro {aApagar?.matricula}?</DialogTitle>
            <DialogDescription>Remove o registo de vez. Para guardar o histórico, arquiva em vez de apagar.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAApagar(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => void apagar()} disabled={saving}>Apagar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── Componentes auxiliares ──────────────────────────────────────────────────── */

function Kpi({ label, value, hint, tone }: { label: string; value: number | string; hint?: string; tone?: 'warn' | 'bad' }) {
  return (
    <div className={cn('rounded-lg border bg-card p-3',
      tone === 'bad' && 'border-red-300 bg-red-50 dark:border-red-500/40 dark:bg-red-500/10',
      tone === 'warn' && 'border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10')}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

function AlertaLinha({ titulo, seguros, render, onOpen }: {
  titulo: string; seguros: Seguro[]; render: (s: Seguro) => string; onOpen: (s: Seguro) => void;
}) {
  return (
    <div>
      <p className="font-medium">{titulo} ({seguros.length})</p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {seguros.map(s => (
          <button key={s.id} type="button" onClick={() => onOpen(s)}
            className="rounded border border-red-300 bg-background px-2 py-0.5 text-xs hover:bg-red-100 dark:border-red-500/40">
            {render(s)}
          </button>
        ))}
      </div>
    </div>
  );
}

function FiltroSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-[9.5rem]" aria-label={label}><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{label}: todos</SelectItem>
        {options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function SeguroForm({ initial, editing, saving, parque, vendidasSet, outros, onSubmit, onClose }: {
  initial: SeguroFormValues; editing: boolean; saving: boolean; parque: ViaturaParque[];
  vendidasSet: Set<string>; outros: Seguro[];
  onSubmit: (v: SeguroFormValues) => void; onClose: () => void;
}) {
  const [v, setV] = useState<SeguroFormValues>(initial);
  const set = <K extends keyof SeguroFormValues>(k: K, val: SeguroFormValues[K]) => setV(p => ({ ...p, [k]: val }));
  const erro = validarForm(v);
  const mNorm = normMatricula(v.matricula);

  const escolherMatricula = (m: string) => {
    const p = parque.find(x => normMatricula(x.matricula) === normMatricula(m));
    setV(prev => ({
      ...prev, matricula: m,
      chassis: prev.chassis || p?.chassis || '',
      viatura: prev.viatura || (p ? [p.marca, p.modelo, p.versao].filter(Boolean).join(' ') : ''),
    }));
  };

  const vendida = mNorm !== '' && vendidasSet.has(mNorm);
  const sobrepoe = mNorm !== '' && v.inicio
    && outros.some(s => s.matricula_norm === mNorm && s.inicio <= (v.fim || '9999-12-31') && (!s.fim || s.fim >= v.inicio));

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? 'Editar seguro' : 'Novo seguro'}</DialogTitle>
          <DialogDescription>Um registo por matrícula e período de cobertura.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={e => { e.preventDefault(); if (!erro && !saving) onSubmit(v); }}>
          <Campo id="seg-mat" label="Matrícula *">
            <Input id="seg-mat" list="seg-parque" value={v.matricula} onChange={e => escolherMatricula(e.target.value)} placeholder="00-AA-00" autoFocus />
            <datalist id="seg-parque">{parque.filter(p => p.matricula).map(p => <option key={p.chassis} value={p.matricula!}>{p.modelo}</option>)}</datalist>
          </Campo>
          <Campo id="seg-via" label="Viatura *"><Input id="seg-via" value={v.viatura} onChange={e => set('viatura', e.target.value)} placeholder="BMW iX1 xDrive30" /></Campo>

          {vendida && <Aviso>Esta matrícula consta das viaturas vendidas — não deve ter seguro novo.</Aviso>}
          {sobrepoe && <Aviso>Já existe outro seguro por arquivar desta matrícula a sobrepor-se a este período (custo duplicado).</Aviso>}

          <Campo id="seg-area" label="Área *">
            <Select value={v.area} onValueChange={a => set('area', a as Area)}>
              <SelectTrigger id="seg-area"><SelectValue /></SelectTrigger>
              <SelectContent>{AREAS_SEGURO.map(a => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}</SelectContent>
            </Select>
          </Campo>
          <Campo id="seg-sol" label="Quem pede *"><Input id="seg-sol" value={v.solicitante} onChange={e => set('solicitante', e.target.value)} /></Campo>
          <Campo id="seg-resp" label={`Responsável pela informação${v.cobertura === 'danos_proprios' ? ' *' : ''}`}>
            <Input id="seg-resp" value={v.responsavel_info} onChange={e => set('responsavel_info', e.target.value)} placeholder="Quem prestou os dados do seguro" />
          </Campo>
          <Campo id="seg-cli" label="A serviço de (cliente)"><Input id="seg-cli" value={v.cliente} onChange={e => set('cliente', e.target.value)} placeholder="Opcional" /></Campo>
          <Campo id="seg-ped" label="Data do pedido"><Input id="seg-ped" type="date" value={v.data_pedido} onChange={e => set('data_pedido', e.target.value)} /></Campo>
          <Campo id="seg-ini" label="Início *"><Input id="seg-ini" type="date" value={v.inicio} onChange={e => set('inicio', e.target.value)} /></Campo>
          <Campo id="seg-fim" label={v.cobertura === 'danos_proprios' ? 'Fim *' : 'Fim (vazio = sem termo)'}><Input id="seg-fim" type="date" value={v.fim} onChange={e => set('fim', e.target.value)} /></Campo>
          <Campo id="seg-cob" label="Cobertura *">
            <Select value={v.cobertura} onValueChange={c => set('cobertura', c as Cobertura)}>
              <SelectTrigger id="seg-cob"><SelectValue /></SelectTrigger>
              <SelectContent>{COBERTURAS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
            </Select>
          </Campo>
          {v.cobertura === 'danos_proprios' && (
            <Campo id="seg-cap" label="Valor seguro (€) *"><Input id="seg-cap" inputMode="decimal" value={v.capital_seguro} onChange={e => set('capital_seguro', e.target.value)} placeholder="35000" /></Campo>
          )}
          <Campo id="seg-pre" label="Prémio (€)"><Input id="seg-pre" inputMode="decimal" value={v.premio} onChange={e => set('premio', e.target.value)} placeholder="Custo do seguro" /></Campo>
          <Campo id="seg-seg" label="Seguradora"><Input id="seg-seg" value={v.seguradora} onChange={e => set('seguradora', e.target.value)} /></Campo>
          <Campo id="seg-apo" label="Apólice"><Input id="seg-apo" value={v.apolice} onChange={e => set('apolice', e.target.value)} /></Campo>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="seg-obs">Observações</Label>
            <Textarea id="seg-obs" rows={2} value={v.obs} onChange={e => set('obs', e.target.value)} />
          </div>
          {erro && <p className="text-xs text-muted-foreground sm:col-span-2">{erro}</p>}
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={!!erro || saving}>{saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Guardar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const Campo = ({ id, label, children }: { id: string; label: string; children: React.ReactNode }) => (
  <div className="space-y-1.5"><Label htmlFor={id}>{label}</Label>{children}</div>
);

const Aviso = ({ children }: { children: React.ReactNode }) => (
  <p className="flex items-start gap-1.5 rounded-md bg-amber-100 px-3 py-2 text-xs text-amber-900 sm:col-span-2 dark:bg-amber-500/20 dark:text-amber-200">
    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {children}
  </p>
);

function CancelarSeguroDialog({ s, venda, onClose, onCopiado }: {
  s: Seguro; venda: ViaturaVendida | null; onClose: () => void; onCopiado: (s: Seguro) => void;
}) {
  const [efeito, setEfeito] = useState(hojeIso());
  const [motivo, setMotivo] = useState(venda ? `Viatura vendida (${textoVenda(venda)})` : 'Cancelamento a pedido');
  const [busy, setBusy] = useState(false);
  const texto = mensagemCancelamento(s, { efeito, motivo });

  const copiar = async () => {
    setBusy(true);
    const ok = await copiarTexto(texto);
    if (!ok) { toast.error('Não foi possível copiar. Seleciona o texto e copia manualmente.'); setBusy(false); return; }
    toast.success('Mensagem copiada. Cola-a no Outlook.');
    try { onCopiado(await marcarCancelamentoPedido(s.id)); }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Não foi possível registar o pedido.'); }
    setBusy(false);
    onClose();
  };

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Cancelar seguro {s.matricula}</DialogTitle>
          <DialogDescription>Copia a mensagem e cola-a no email à seguradora. Depois de confirmado o cancelamento, arquiva o seguro (Dar baixa).</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo id="can-efeito" label="Efeito a partir de"><Input id="can-efeito" type="date" value={efeito} onChange={e => setEfeito(e.target.value)} /></Campo>
          <Campo id="can-motivo" label="Motivo"><Input id="can-motivo" value={motivo} onChange={e => setMotivo(e.target.value)} /></Campo>
        </div>
        <Textarea readOnly rows={12} value={texto} aria-label="Mensagem de cancelamento" className="font-mono text-xs" />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Fechar</Button>
          <Button onClick={() => void copiar()} disabled={busy || !efeito}>Copiar mensagem</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UpgradeDialog({ s, onClose, onDone }: { s: Seguro; onClose: () => void; onDone: (s: Seguro) => void }) {
  const [v, setV] = useState<UpgradeValues>({ capital_seguro: '', dp_desde: hojeIso(), fim: s.fim ?? '', responsavel_info: s.responsavel_info ?? '' });
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof UpgradeValues>(k: K, val: UpgradeValues[K]) => setV(p => ({ ...p, [k]: val }));
  const erro = validarUpgrade(v, s);

  const guardar = async () => {
    if (erro) return;
    setBusy(true);
    try { onDone(await upgradeDanosProprios(s.id, v)); }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Não foi possível guardar.'); setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Danos próprios — {s.matricula}</DialogTitle>
          <DialogDescription>Passa o seguro de contra terceiros a danos próprios. A alteração fica registada no histórico.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={e => { e.preventDefault(); void guardar(); }}>
          <Campo id="up-cap" label="Valor seguro (€) *"><Input id="up-cap" inputMode="decimal" value={v.capital_seguro} onChange={e => set('capital_seguro', e.target.value)} autoFocus /></Campo>
          <Campo id="up-desde" label="Início dos danos próprios *"><Input id="up-desde" type="date" value={v.dp_desde} onChange={e => set('dp_desde', e.target.value)} /></Campo>
          <Campo id="up-fim" label="Fim *"><Input id="up-fim" type="date" value={v.fim} onChange={e => set('fim', e.target.value)} /></Campo>
          <Campo id="up-resp" label="Responsável pela informação *"><Input id="up-resp" value={v.responsavel_info} onChange={e => set('responsavel_info', e.target.value)} /></Campo>
          {erro && <p className="text-xs text-muted-foreground sm:col-span-2">{erro}</p>}
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={!!erro || busy}>{busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Fazer upgrade</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function HistoricoDialog({ s, onClose }: { s: Seguro; onClose: () => void }) {
  const [list, setList] = useState<HistoricoSeguro[] | null>(null);
  useEffect(() => { void listHistoricoSeguro(s.id).then(setList); }, [s.id]);
  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Histórico — {s.matricula}</DialogTitle><DialogDescription>Alterações de cobertura, pedidos de cancelamento e arquivo.</DialogDescription></DialogHeader>
        {list === null ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : list.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Sem alterações registadas.</p>
        ) : (
          <ul className="space-y-2 text-sm" data-testid="historico">
            {list.map(h => (
              <li key={h.id} className="rounded border px-3 py-2">
                <div className="font-medium">{historicoLabel(h)}</div>
                {h.detalhe && <div className="text-xs text-muted-foreground">{h.detalhe}</div>}
                <div className="text-xs text-muted-foreground">{fmtDia(h.created_at.slice(0, 10))}{h.autor ? ` · ${h.autor}` : ''}</div>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
