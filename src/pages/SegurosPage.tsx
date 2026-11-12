import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Archive, ArchiveRestore, Loader2, Pencil, Plus, RefreshCw, Search, ShieldCheck, Trash2 } from 'lucide-react';
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
  emptyForm, estadoDef, estadoSeguro, filtrar, fmtDia, fmtEuro, formFromSeguro, hojeIso, kpis, listParque,
  listSeguros, listVendidas, motivoLabel, normMatricula, parqueSemSeguro, reativarSeguro, updateSeguro, validarForm,
  type Area, type Cobertura, type EstadoSeguro, type MotivoArquivo, type Seguro, type SeguroFormValues,
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
  const [q, setQ] = useState('');
  const [area, setArea] = useState<Area | 'all'>('all');
  const [cobertura, setCobertura] = useState<Cobertura | 'all'>('all');
  const [estado, setEstado] = useState<EstadoSeguro | 'all'>('all');
  const [verParque, setVerParque] = useState(false);

  const [formOpen, setFormOpen] = useState<{ id: string | null; initial: SeguroFormValues } | null>(null);
  const [aArquivar, setAArquivar] = useState<{ s: Seguro; motivo: MotivoArquivo } | null>(null);
  const [aApagar, setAApagar] = useState<Seguro | null>(null);

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
    },
  });

  /* ── Render ─────────────────────────────────────────────────────────────── */

  const temAlertas = avisos.expirados.length + avisos.vendidosAtivos.length + avisos.sobrepostos.length > 0;

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
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="Ativos" value={resumo.ativos} />
        <Kpi label="A expirar (≤30 dias)" value={resumo.aExpirar} tone={resumo.aExpirar ? 'warn' : undefined} />
        <Kpi label="Expirados por arquivar" value={resumo.expirados} tone={resumo.expirados ? 'bad' : undefined} />
        <Kpi label="Vendidas com seguro" value={resumo.vendidosAtivos} tone={resumo.vendidosAtivos ? 'bad' : undefined} />
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
              render={s => `${s.matricula} · terminou há ${-diasParaFim(s, hoje)} d`} onOpen={s => editable && setFormOpen({ id: s.id, initial: formFromSeguro(s) })} />
          )}
          {avisos.vendidosAtivos.length > 0 && (
            <AlertaLinha titulo="Viatura já vendida com seguro por arquivar — cancelar para cortar o custo" seguros={avisos.vendidosAtivos}
              render={s => `${s.matricula} · ${fmtEuro(s.premio)}`}
              onOpen={s => editable && setAArquivar({ s, motivo: 'viatura_vendida' })} />
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
                const vendida = !s.arquivado && vendidasSet.has(s.matricula_norm);
                return (
                  <tr key={s.id} data-testid="seguro" className="border-t align-top">
                    <td className="px-3 py-2">
                      <div className="font-mono font-medium">{s.matricula}</div>
                      <div className="text-xs text-muted-foreground">{s.viatura}</div>
                      {vendida && <Badge variant="destructive" className="mt-1">Viatura vendida</Badge>}
                    </td>
                    <td className="px-3 py-2">{areaLabel(s.area)}</td>
                    <td className="px-3 py-2">
                      <div>{s.solicitante}</div>
                      {s.cliente && <div className="text-xs text-muted-foreground">Cliente: {s.cliente}</div>}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{fmtDia(s.data_pedido)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {fmtDia(s.inicio)} → {fmtDia(s.fim)}
                      {!s.arquivado && est !== 'futuro' && (
                        <div className="text-xs text-muted-foreground">
                          {diasParaFim(s, hoje) >= 0 ? `faltam ${diasParaFim(s, hoje)} d` : `terminou há ${-diasParaFim(s, hoje)} d`}
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
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" aria-label={`Editar ${s.matricula}`}
                            onClick={() => setFormOpen({ id: s.id, initial: formFromSeguro(s) })}><Pencil className="h-4 w-4" /></Button>
                          {s.arquivado
                            ? <Button size="icon" variant="ghost" aria-label={`Reativar ${s.matricula}`} disabled={saving} onClick={() => void reativar(s)}><ArchiveRestore className="h-4 w-4" /></Button>
                            : <Button size="icon" variant="ghost" aria-label={`Arquivar ${s.matricula}`}
                                onClick={() => setAArquivar({ s, motivo: vendida ? 'viatura_vendida' : 'terminado' })}><Archive className="h-4 w-4" /></Button>}
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

      {/* Parque sem seguro */}
      {parque.length > 0 && (
        <div className="rounded-lg border p-3 text-sm">
          <button type="button" className="flex w-full items-center justify-between text-left font-medium" onClick={() => setVerParque(v => !v)} aria-expanded={verParque}>
            <span>Viaturas do parque sem seguro registado ({semSeguro.length})</span>
            <span className="text-xs text-muted-foreground">{verParque ? 'Esconder' : 'Ver'}</span>
          </button>
          {verParque && (
            <ul className="mt-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-3" data-testid="parque-sem-seguro">
              {semSeguro.map(v => (
                <li key={v.chassis} className="flex items-center justify-between gap-2 rounded border px-2 py-1">
                  <span><span className="font-mono">{v.matricula}</span> <span className="text-xs text-muted-foreground">{[v.marca, v.modelo].filter(Boolean).join(' ')}</span></span>
                  {editable && <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => novo(v.matricula ?? '', v)}>Registar</Button>}
                </li>
              ))}
              {semSeguro.length === 0 && <li className="text-muted-foreground">Todas as viaturas do parque com matrícula têm seguro.</li>}
            </ul>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Só considera o parque de demonstradores (tab Demos); nem toda a viatura parada precisa de seguro individual — usa como lista de verificação.
          </p>
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
  const sobrepoe = mNorm !== '' && v.inicio && v.fim
    && outros.some(s => s.matricula_norm === mNorm && s.inicio <= v.fim && s.fim >= v.inicio);

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
          <Campo id="seg-cli" label="A serviço de (cliente)"><Input id="seg-cli" value={v.cliente} onChange={e => set('cliente', e.target.value)} placeholder="Opcional" /></Campo>
          <Campo id="seg-ped" label="Data do pedido"><Input id="seg-ped" type="date" value={v.data_pedido} onChange={e => set('data_pedido', e.target.value)} /></Campo>
          <Campo id="seg-ini" label="Início *"><Input id="seg-ini" type="date" value={v.inicio} onChange={e => set('inicio', e.target.value)} /></Campo>
          <Campo id="seg-fim" label="Fim *"><Input id="seg-fim" type="date" value={v.fim} onChange={e => set('fim', e.target.value)} /></Campo>
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
