import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Archive, ArchiveRestore, Ban, History, Loader2, MoreHorizontal, Pencil, Plus, RefreshCw, Search, ShieldCheck, ShieldPlus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { usePermissions } from '@/contexts/PermissionsContext';
import {
  AREAS_SEGURO, COBERTURAS, MOTIVOS_ARQUIVO,
  alertas, areaLabel, arquivarSeguro, coberturaLabel, createSeguro, custoPorArea, deleteSeguro, diasParaFim,
  copiarTexto, dadosEmFalta, emptyForm, historicoLabel, listHistoricoSeguro, marcarCancelamentoPedido, mensagemCancelamento,
  upgradeDanosProprios, validarUpgrade, estadoDef, estadoSeguro, filtrar, fmtDia, fmtEuro, formFromSeguro, hojeIso, kpis, listParque,
  listSeguros, listVendidas, motivoLabel, normMatricula, parqueSemMatricula, parqueSemSeguro, textoVenda, vendaDe, ORIGENS_PARQUE, reativarSeguro, updateSeguro, validarForm,
  type Area, type Cobertura, type HistoricoSeguro, type UpgradeValues, type MotivoArquivo, type Seguro, type SeguroFormValues,
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
type Foco = 'todos' | 'baixa' | 'sem_seguro' | 'expirados' | 'a_expirar' | 'incompletos';

const FOCO_AJUDA: Partial<Record<Foco, string>> = {
  baixa: 'Viaturas já vendidas que ainda têm seguro. 1) Cancelar seguro: copia o pedido para o Outlook. 2) Quando a seguradora confirmar, Arquivar.',
  sem_seguro: 'Viaturas do Stock VU e dos Demos VN sem nenhum seguro a cobri-las hoje.',
  expirados: 'O seguro terminou e continua por arquivar: a viatura pode estar a circular sem seguro. Atualiza as datas (renovação) ou arquiva.',
  a_expirar: 'Terminam nos próximos 30 dias: renovar ou cancelar.',
  incompletos: 'Danos próprios exigem valor seguro, início, fim e responsável pela informação. Completa os dados em falta.',
};

/* Ordem na lista: o que exige ação primeiro. */
function ordemUrgencia(s: Seguro, vendidas: ViaturaVendida[], hoje: string): number {
  if (vendaDe(s, vendidas)) return 0;
  const e = estadoSeguro(s, hoje);
  if (e === 'expirado') return 1;
  if (dadosEmFalta(s).length) return 2;
  if (e === 'a_expirar') return 3;
  return 4;
}

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
  const [foco, setFoco] = useState<Foco>('todos');

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

  const base = useMemo(
    () => filtrar(list, { separador, area, cobertura, estado: 'all', q }, hoje),
    [list, separador, area, cobertura, q, hoje],
  );
  const doFoco = useCallback((k: Foco, s: Seguro): boolean => {
    switch (k) {
      case 'baixa': return !!vendaDe(s, vendidas);
      case 'expirados': return estadoSeguro(s, hoje) === 'expirado';
      case 'a_expirar': return estadoSeguro(s, hoje) === 'a_expirar';
      case 'incompletos': return dadosEmFalta(s).length > 0;
      default: return true;
    }
  }, [vendidas, hoje]);
  const focos = useMemo(() => {
    const n = (k: Foco) => list.filter(s => !s.arquivado && doFoco(k, s)).length;
    return ([
      { key: 'todos' as const, label: 'Todos', n: list.filter(s => !s.arquivado).length, tom: undefined },
      { key: 'baixa' as const, label: 'Dar baixa', n: n('baixa'), tom: 'bad' as const },
      { key: 'sem_seguro' as const, label: 'Sem seguro', n: semSeguro.length, tom: 'bad' as const },
      { key: 'expirados' as const, label: 'Expirados', n: n('expirados'), tom: 'bad' as const },
      { key: 'a_expirar' as const, label: 'A expirar', n: n('a_expirar'), tom: 'warn' as const },
      { key: 'incompletos' as const, label: 'Dados em falta', n: n('incompletos'), tom: 'warn' as const },
    ]).filter(f => f.key === 'todos' || f.n > 0 || f.key === foco);
  }, [list, doFoco, semSeguro.length, foco]);
  const visiveis = useMemo(() => {
    const r = separador === 'ativos' ? base.filter(s => doFoco(foco, s)) : base;
    return separador === 'ativos'
      ? [...r].sort((a, b) => ordemUrgencia(a, vendidas, hoje) - ordemUrgencia(b, vendidas, hoje) || (a.fim ?? '9999').localeCompare(b.fim ?? '9999'))
      : r;
  }, [base, separador, foco, doFoco, vendidas, hoje]);
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

  return (
    <div className="mx-auto max-w-5xl space-y-3 p-3 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <h1 className="flex items-center gap-2 text-xl font-semibold"><ShieldCheck className="h-5 w-5 text-primary" /> Seguros</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} aria-label="Atualizar">
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </Button>
          {editable && <Button size="sm" onClick={() => novo()}><Plus className="mr-1 h-4 w-4" /> Novo seguro</Button>}
        </div>
      </div>

      {loadError && <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{loadError}</div>}

      {/* Resumo: só o essencial */}
      <div className="rounded-lg border bg-card px-4 py-3" data-testid="resumo">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <Stat valor={resumo.ativos} label="seguros ativos" />
          {resumo.premioAtivo > 0 && <Stat valor={fmtEuro(resumo.premioAtivo)} label="em prémios" />}
          {resumo.capitalAtivo > 0 && <Stat valor={fmtEuro(resumo.capitalAtivo)} label="capital seguro" />}
        </div>
        {custo.some(c => c.premio > 0) ? (
          <p className="mt-1 text-xs text-muted-foreground" data-testid="custo-area">
            {custo.filter(c => c.premio > 0).map(c => `${areaLabel(c.area)} ${fmtEuro(c.premio)}`).join(' · ')}
          </p>
        ) : resumo.ativos > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">Preenche o prémio de cada seguro para ver o custo por área.</p>
        )}
      </div>

      {/* O que exige ação: cada botão filtra a lista */}
      {separador === 'ativos' && (
        <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Filtrar por situação" data-testid="alertas">
          {focos.map(f => (
            <button key={f.key} type="button" onClick={() => setFoco(f.key)} aria-pressed={foco === f.key}
              className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors',
                foco === f.key ? 'border-primary bg-primary text-primary-foreground'
                  : f.tom === 'bad' ? 'border-red-500/60 text-red-600 hover:bg-red-500/10 dark:text-red-300'
                  : f.tom === 'warn' ? 'border-amber-500/60 text-amber-700 hover:bg-amber-500/10 dark:text-amber-300'
                  : 'hover:bg-muted')}>
              {f.label}<span className="font-semibold">{f.n}</span>
            </button>
          ))}
        </div>
      )}
      {separador === 'ativos' && foco !== 'todos' && FOCO_AJUDA[foco] && (
        <p className="rounded-md bg-muted/60 px-3 py-2 text-sm text-muted-foreground">{FOCO_AJUDA[foco]}</p>
      )}
      {separador === 'ativos' && foco === 'todos' && avisos.sobrepostos.length > 0 && (
        <p className="rounded-md bg-amber-100 px-3 py-2 text-sm text-amber-900 dark:bg-amber-500/15 dark:text-amber-200">
          <AlertTriangle className="mr-1 inline h-4 w-4" />
          Seguros sobrepostos (custo duplicado): {avisos.sobrepostos.map(g => g.matricula).join(', ')}
        </p>
      )}

      {/* Separadores e pesquisa */}
      <div className="space-y-2">
        <Tabs value={separador} onValueChange={v => setSeparador(v as Separador)}>
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="ativos" className="flex-1 sm:flex-none">Ativos ({list.length - nArquivados})</TabsTrigger>
            <TabsTrigger value="arquivados" className="flex-1 sm:flex-none">Arquivados ({nArquivados})</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[12rem] flex-1 basis-full sm:basis-0">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Pesquisar matrícula, viatura, apólice…" className="pl-8" aria-label="Pesquisar" />
          </div>
          <FiltroSelect label="Área" value={area} onChange={v => setArea(v as Area | 'all')} options={AREAS_SEGURO} />
          <FiltroSelect label="Cobertura" value={cobertura} onChange={v => setCobertura(v as Cobertura | 'all')} options={COBERTURAS} />
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> A carregar…</div>
      ) : separador === 'ativos' && foco === 'sem_seguro' ? (
        <div data-testid="parque-sem-seguro" className="space-y-2">
          {semSeguro.length === 0 && <Vazio texto="Todas as viaturas do parque com matrícula têm seguro." />}
          {semSeguro.filter(v => !q.trim() || `${v.matricula} ${v.marca} ${v.modelo}`.toLowerCase().includes(q.trim().toLowerCase())).map(v => (
            <div key={v.ref} className="flex items-center justify-between gap-3 rounded-lg border border-red-500/40 bg-card p-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-base font-semibold">{v.matricula}</span>
                  <Tag cls="bg-slate-500/15 text-slate-700 dark:text-slate-300">{ORIGENS_PARQUE[v.origem]}</Tag>
                </div>
                <div className="truncate text-sm text-muted-foreground">{[v.marca, v.modelo, v.versao].filter(Boolean).join(' ')}</div>
              </div>
              {editable && <Button size="sm" onClick={() => novo(v.matricula ?? '', v)}><Plus className="mr-1 h-4 w-4" />Registar seguro</Button>}
            </div>
          ))}
          {semMatricula.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Ainda sem matrícula (não se podem segurar): {semMatricula.map(v => `${v.modelo ?? '—'} (${ORIGENS_PARQUE[v.origem]})`).join(' · ')}
            </p>
          )}
        </div>
      ) : visiveis.length === 0 ? (
        <Vazio texto={list.length === 0 ? 'Ainda não há seguros registados.' : 'Nenhum seguro corresponde aos filtros.'} />
      ) : (
        <ul className="space-y-2">
          {visiveis.map(s => (
            <SeguroCard key={s.id} s={s} hoje={hoje} venda={s.arquivado ? null : vendaDe(s, vendidas)}
              editable={editable} isAdmin={isAdmin} saving={saving}
              onEditar={() => setFormOpen({ id: s.id, initial: formFromSeguro(s) })}
              onCancelar={() => setACancelar(s)} onUpgrade={() => setAUpgrade(s)} onHistorico={() => setVerHistorico(s)}
              onArquivar={motivo => setAArquivar({ s, motivo })} onReativar={() => void reativar(s)} onApagar={() => setAApagar(s)} />
          ))}
        </ul>
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

function FiltroSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-[calc(50%-0.25rem)] sm:w-[11rem]" aria-label={label}><SelectValue /></SelectTrigger>
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
        <form className="grid grid-cols-2 gap-3" onSubmit={e => { e.preventDefault(); if (!erro && !saving) onSubmit(v); }}>
          <Campo id="seg-mat" label="Matrícula *">
            <Input id="seg-mat" list="seg-parque" value={v.matricula} onChange={e => escolherMatricula(e.target.value)} placeholder="00-AA-00" autoFocus />
            <datalist id="seg-parque">{parque.filter(p => p.matricula).map(p => <option key={p.ref} value={p.matricula!}>{p.modelo}</option>)}</datalist>
          </Campo>
          <Campo id="seg-area" label="Área *">
            <Select value={v.area} onValueChange={a => set('area', a as Area)}>
              <SelectTrigger id="seg-area"><SelectValue /></SelectTrigger>
              <SelectContent>{AREAS_SEGURO.map(a => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}</SelectContent>
            </Select>
          </Campo>
          <Campo id="seg-via" label="Viatura *" wide><Input id="seg-via" value={v.viatura} onChange={e => set('viatura', e.target.value)} placeholder="BMW iX1 xDrive30" /></Campo>

          {vendida && <Aviso>Esta matrícula consta das viaturas vendidas — não deve ter seguro novo.</Aviso>}
          {sobrepoe && <Aviso>Já existe outro seguro por arquivar desta matrícula a sobrepor-se a este período (custo duplicado).</Aviso>}

          <Campo id="seg-sol" label="Quem pede *"><Input id="seg-sol" value={v.solicitante} onChange={e => set('solicitante', e.target.value)} /></Campo>
          <Campo id="seg-resp" label={`Responsável pela info.${v.cobertura === 'danos_proprios' ? ' *' : ''}`}>
            <Input id="seg-resp" value={v.responsavel_info} onChange={e => set('responsavel_info', e.target.value)} placeholder="Quem deu os dados" />
          </Campo>
          <Campo id="seg-cli" label="A serviço de (cliente)" wide><Input id="seg-cli" value={v.cliente} onChange={e => set('cliente', e.target.value)} placeholder="Opcional" /></Campo>
          <Campo id="seg-ini" label="Início *"><Input id="seg-ini" type="date" value={v.inicio} onChange={e => set('inicio', e.target.value)} /></Campo>
          <Campo id="seg-fim" label={v.cobertura === 'danos_proprios' ? 'Fim *' : 'Fim (opcional)'}><Input id="seg-fim" type="date" value={v.fim} onChange={e => set('fim', e.target.value)} /></Campo>
          <Campo id="seg-cob" label="Cobertura *">
            <Select value={v.cobertura} onValueChange={c => set('cobertura', c as Cobertura)}>
              <SelectTrigger id="seg-cob"><SelectValue /></SelectTrigger>
              <SelectContent>{COBERTURAS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
            </Select>
          </Campo>
          {v.cobertura === 'danos_proprios'
            ? <Campo id="seg-cap" label="Valor seguro (€) *"><Input id="seg-cap" inputMode="decimal" value={v.capital_seguro} onChange={e => set('capital_seguro', e.target.value)} placeholder="35000" /></Campo>
            : <Campo id="seg-pre" label="Prémio (€)"><Input id="seg-pre" inputMode="decimal" value={v.premio} onChange={e => set('premio', e.target.value)} placeholder="Custo" /></Campo>}
          {v.cobertura === 'danos_proprios' && <Campo id="seg-pre" label="Prémio (€)"><Input id="seg-pre" inputMode="decimal" value={v.premio} onChange={e => set('premio', e.target.value)} placeholder="Custo" /></Campo>}
          <Campo id="seg-seg" label="Seguradora"><Input id="seg-seg" value={v.seguradora} onChange={e => set('seguradora', e.target.value)} /></Campo>
          <Campo id="seg-apo" label="Apólice"><Input id="seg-apo" value={v.apolice} onChange={e => set('apolice', e.target.value)} /></Campo>
          <Campo id="seg-ped" label="Data do pedido"><Input id="seg-ped" type="date" value={v.data_pedido} onChange={e => set('data_pedido', e.target.value)} /></Campo>
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="seg-obs">Observações</Label>
            <Textarea id="seg-obs" rows={2} value={v.obs} onChange={e => set('obs', e.target.value)} />
          </div>
          {erro && <p className="col-span-2 text-xs text-muted-foreground">{erro}</p>}
          <DialogFooter className="sticky bottom-0 col-span-2 -mx-1 gap-2 bg-background px-1 pb-1 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={!!erro || saving}>{saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Guardar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const Campo = ({ id, label, children, wide }: { id: string; label: string; children: React.ReactNode; wide?: boolean }) => (
  <div className={cn('min-w-0 space-y-1.5', wide && 'col-span-2')}><Label htmlFor={id}>{label}</Label>{children}</div>
);

const Aviso = ({ children }: { children: React.ReactNode }) => (
  <p className="flex items-start gap-1.5 rounded-md bg-amber-100 px-3 py-2 text-xs text-amber-900 col-span-2 dark:bg-amber-500/20 dark:text-amber-200">
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl" onOpenAutoFocus={e => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Cancelar seguro {s.matricula}</DialogTitle>
          <DialogDescription>Copia a mensagem e cola-a no email à seguradora. Depois de confirmado o cancelamento, arquiva o seguro (Dar baixa).</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Campo id="can-efeito" label="Efeito a partir de"><Input id="can-efeito" type="date" value={efeito} onChange={e => setEfeito(e.target.value)} /></Campo>
          <Campo id="can-motivo" label="Motivo" wide><Input id="can-motivo" value={motivo} onChange={e => setMotivo(e.target.value)} /></Campo>
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
        <form className="grid grid-cols-2 gap-3" onSubmit={e => { e.preventDefault(); void guardar(); }}>
          <Campo id="up-cap" label="Valor seguro (€) *"><Input id="up-cap" inputMode="decimal" value={v.capital_seguro} onChange={e => set('capital_seguro', e.target.value)} autoFocus /></Campo>
          <Campo id="up-desde" label="Início dos danos próprios *"><Input id="up-desde" type="date" value={v.dp_desde} onChange={e => set('dp_desde', e.target.value)} /></Campo>
          <Campo id="up-fim" label="Fim *"><Input id="up-fim" type="date" value={v.fim} onChange={e => set('fim', e.target.value)} /></Campo>
          <Campo id="up-resp" label="Responsável pela informação *"><Input id="up-resp" value={v.responsavel_info} onChange={e => set('responsavel_info', e.target.value)} /></Campo>
          {erro && <p className="col-span-2 text-xs text-muted-foreground">{erro}</p>}
          <DialogFooter className="col-span-2">
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

/* ── Apresentação ────────────────────────────────────────────────────────────── */

const Stat = ({ valor, label }: { valor: number | string; label: string }) => (
  <span className="flex items-baseline gap-1.5"><span className="text-xl font-semibold">{valor}</span><span className="text-sm text-muted-foreground">{label}</span></span>
);

const Tag = ({ cls, children }: { cls: string; children: React.ReactNode }) => (
  <span className={cn('inline-flex items-center whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-medium', cls)}>{children}</span>
);

const Vazio = ({ texto }: { texto: string }) => (
  <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">{texto}</div>
);

function Dado({ k, children }: { k: string; children: React.ReactNode }) {
  return <div className="min-w-0"><dt className="text-xs text-muted-foreground">{k}</dt><dd className="break-words">{children}</dd></div>;
}

function SeguroCard({ s, hoje, venda, editable, isAdmin, saving, onEditar, onCancelar, onUpgrade, onHistorico, onArquivar, onReativar, onApagar }: {
  s: Seguro; hoje: string; venda: ViaturaVendida | null; editable: boolean; isAdmin: boolean; saving: boolean;
  onEditar: () => void; onCancelar: () => void; onUpgrade: () => void; onHistorico: () => void;
  onArquivar: (m: MotivoArquivo) => void; onReativar: () => void; onApagar: () => void;
}) {
  const est = estadoSeguro(s, hoje);
  const def = estadoDef(est);
  const falta = dadosEmFalta(s);
  const dias = diasParaFim(s, hoje);
  const urgente = !!venda || est === 'expirado';
  const pedido = !!s.cancelamento_pedido_em;
  const [menu, setMenu] = useState(false);
  const item = 'flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm hover:bg-muted';

  return (
    <li data-testid="seguro" className={cn('rounded-lg border bg-card p-3', urgente && 'border-red-500/60')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-mono text-base font-semibold">{s.matricula}</span>
            {!s.arquivado && (venda
              ? <Tag cls="bg-red-500/15 text-red-700 dark:text-red-300">Vendida</Tag>
              : <Tag cls={def.cls}>{def.label}</Tag>)}
            {s.arquivado && <Tag cls="bg-slate-500/15 text-slate-600 dark:text-slate-300">{motivoLabel(s.motivo_arquivo)} · {fmtDia(s.arquivado_em)}</Tag>}
          </div>
          <div className="truncate text-sm text-muted-foreground">{s.viatura} · {areaLabel(s.area)}</div>
        </div>
        {(
          <div className="flex shrink-0 items-center gap-1">
            {editable && venda && !s.arquivado && (pedido
              ? <Button size="sm" variant="destructive" aria-label={`Arquivar ${s.matricula}`} onClick={() => onArquivar('viatura_vendida')}>Baixa feita</Button>
              : <Button size="sm" variant="destructive" aria-label={`Cancelar seguro ${s.matricula}`} onClick={onCancelar}>Cancelar seguro</Button>)}
            {editable && !venda && est === 'expirado' && <Button size="sm" variant="outline" onClick={onEditar}>Atualizar datas</Button>}
            {editable && !venda && est !== 'expirado' && falta.length > 0 && <Button size="sm" variant="outline" onClick={onEditar}>Completar</Button>}
            <Popover open={menu} onOpenChange={setMenu}>
              <PopoverTrigger asChild>
                <Button size="icon" variant="ghost" aria-label={`Mais ações ${s.matricula}`}><MoreHorizontal className="h-4 w-4" /></Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-56 p-1" onClick={() => setMenu(false)}>
                {editable && !s.arquivado && <button type="button" className={item} aria-label={`Cancelar seguro ${s.matricula}`} onClick={onCancelar}><Ban className="h-4 w-4" />Cancelar seguro</button>}
                {editable && !s.arquivado && s.cobertura === 'terceiros' && <button type="button" className={item} aria-label={`Upgrade para danos próprios ${s.matricula}`} onClick={onUpgrade}><ShieldPlus className="h-4 w-4" />Passar a danos próprios</button>}
                {editable && <button type="button" className={item} aria-label={`Editar ${s.matricula}`} onClick={onEditar}><Pencil className="h-4 w-4" />Editar</button>}
                <button type="button" className={item} aria-label={`Histórico ${s.matricula}`} onClick={onHistorico}><History className="h-4 w-4" />Histórico</button>
                {editable && (s.arquivado
                  ? <button type="button" className={item} disabled={saving} aria-label={`Reativar ${s.matricula}`} onClick={onReativar}><ArchiveRestore className="h-4 w-4" />Reativar</button>
                  : <button type="button" className={item} aria-label={`Arquivar ${s.matricula}`} onClick={() => onArquivar(venda ? 'viatura_vendida' : 'terminado')}><Archive className="h-4 w-4" />Arquivar</button>)}
                {editable && isAdmin && <button type="button" className={cn(item, 'text-destructive')} aria-label={`Apagar ${s.matricula}`} onClick={onApagar}><Trash2 className="h-4 w-4" />Apagar</button>}
              </PopoverContent>
            </Popover>
          </div>
        )}
      </div>

      {venda && !s.arquivado && (
        <p className="mt-2 rounded bg-red-500/10 px-2.5 py-1.5 text-sm font-medium text-red-700 dark:text-red-300">
          Viatura vendida ({textoVenda(venda)}) — dar baixa do seguro.
          {pedido && <span className="font-normal"> Cancelamento pedido em {fmtDia(s.cancelamento_pedido_em)}; aguarda confirmação.</span>}
        </p>
      )}
      {!venda && pedido && !s.arquivado && (
        <p className="mt-2 rounded bg-muted px-2.5 py-1.5 text-sm">Cancelamento pedido em {fmtDia(s.cancelamento_pedido_em)}.</p>
      )}
      {falta.length > 0 && (
        <p className="mt-2 rounded bg-amber-500/10 px-2.5 py-1.5 text-sm text-amber-800 dark:text-amber-300">Em falta (danos próprios): {falta.join(', ')}.</p>
      )}

      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
        <Dado k="Cobertura">
          {coberturaLabel(s.cobertura)}
          {s.cobertura === 'danos_proprios' && s.capital_seguro ? <span className="block text-xs text-muted-foreground">Valor seguro {fmtEuro(s.capital_seguro)}</span> : null}
        </Dado>
        <Dado k="Período">
          {fmtDia(s.inicio)} →<br className="sm:hidden" /> {s.fim ? fmtDia(s.fim) : 'sem termo'}
          {!s.arquivado && s.fim && dias !== null && est !== 'futuro' && (
            <span className="block text-xs text-muted-foreground">{dias >= 0 ? `faltam ${dias} d` : `terminou há ${-dias} d`}</span>
          )}
        </Dado>
        {s.premio != null && <Dado k="Prémio">{fmtEuro(s.premio)}</Dado>}
        {s.solicitante !== 'Por atribuir' && <Dado k="Pedido por">{s.solicitante}{s.cliente ? ` · ${s.cliente}` : ''}</Dado>}
      </dl>
    </li>
  );
}
