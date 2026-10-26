import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Building2, Loader2, Plus, RefreshCw, Search, Send, AlertTriangle, Clock, ListChecks, MapPinned } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { client } from '@/clients';
import { usePermissions } from '@/contexts/PermissionsContext';
import { PlantaViewer, type PlantaPin } from '@/components/instalacoes/PlantaViewer';
import { OcorrenciaForm } from '@/components/instalacoes/OcorrenciaForm';
import { OcorrenciaDetail } from '@/components/instalacoes/OcorrenciaDetail';
import {
  CATEGORIAS, ESTADOS, PRIORIDADES, createOcorrencia, deleteOcorrencia, diasDesde, emptyForm, estadoDef, filtrar, fmtDia,
  interlocutoresUsados, isAtiva, kpis, listOcorrencias, prioridadeDef, updateOcorrencia, zonasUsadas,
  type Categoria, type Estado, type Ocorrencia, type OcorrenciaFiltro, type OcorrenciaFormValues, type Prioridade,
} from '@/lib/instalacoes';

/* ── Tab Instalações (Transversal) ────────────────────────────────────────────
 * Ocorrências registadas diretamente sobre a planta de cada piso: um clique no
 * local do problema abre o registo (intervenção necessária, data, interlocutor a
 * quem foi reportada, observações). A lista, os contadores e os estados permitem
 * gerir as instalações a partir daqui. 'view' consulta; 'edit' regista e altera.
 * ──────────────────────────────────────────────────────────────────────────── */

type Quick = 'urgentes' | 'por_reportar' | null;
type PanelMode = 'view' | 'edit' | 'new' | null;

const assetUrl = (src: string) => `${import.meta.env.BASE_URL}${src.replace(/^\//, '')}`;

export default function InstalacoesPage() {
  const { canEdit } = usePermissions();
  const editable = canEdit('instalacoes');
  const plantas = useMemo(() => client.plantas ?? [], []);
  const pisoLabel = useCallback((id: string) => plantas.find(p => p.id === id)?.label ?? id, [plantas]);

  const [list, setList] = useState<Ocorrencia[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [pisoId, setPisoId] = useState<string>(plantas[0]?.id ?? '');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panel, setPanel] = useState<PanelMode>(null);
  const [placing, setPlacing] = useState<null | 'new' | 'move'>(null);
  const [draft, setDraft] = useState<{ x: number; y: number; piso: string } | null>(null);
  const [focus, setFocus] = useState<{ x: number; y: number; n: number } | null>(null);
  const [saving, setSaving] = useState(false);

  // Filtros da lista (e dos marcadores)
  const [q, setQ] = useState('');
  const [estado, setEstado] = useState<OcorrenciaFiltro['estado']>('ativas');
  const [prioridade, setPrioridade] = useState<Prioridade | 'all'>('all');
  const [categoria, setCategoria] = useState<Categoria | 'all'>('all');
  const [todosPisos, setTodosPisos] = useState(false);
  const [quick, setQuick] = useState<Quick>(null);

  const panelRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setList(await listOcorrencias());
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Erro ao carregar as ocorrências.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const selected = useMemo(() => list.find(o => o.id === selectedId) ?? null, [list, selectedId]);
  const resumo = useMemo(() => kpis(list), [list]);

  const apply = useCallback((piso: string): Ocorrencia[] => {
    let r = filtrar(list, { piso, estado: quick ? 'ativas' : estado, prioridade, categoria, q });
    if (quick === 'urgentes') r = r.filter(o => o.prioridade === 'urgente');
    if (quick === 'por_reportar') r = r.filter(o => !o.interlocutor);
    return r;
  }, [list, estado, prioridade, categoria, q, quick]);

  const visiveis = useMemo(() => apply(todosPisos ? 'all' : pisoId), [apply, todosPisos, pisoId]);

  const pins: PlantaPin[] = useMemo(() => {
    const base = apply(pisoId);
    // A ocorrência aberta no painel mantém o marcador mesmo que o filtro a esconda.
    const withSel = selected && selected.piso === pisoId && !base.some(o => o.id === selected.id) ? [...base, selected] : base;
    return withSel.map(o => ({
      id: o.id, x: o.x, y: o.y,
      color: prioridadeDef(o.prioridade).pin,
      label: `${o.titulo} — ${prioridadeDef(o.prioridade).label} · ${estadoDef(o.estado).label}`,
      dim: !isAtiva(o),
    }));
  }, [apply, pisoId, selected]);

  const ativasPorPiso = useMemo(() => {
    const n: Record<string, number> = {};
    for (const o of list) if (isAtiva(o)) n[o.piso] = (n[o.piso] ?? 0) + 1;
    return n;
  }, [list]);

  const revealPanel = () => {
    // Em ecrãs pequenos o painel fica abaixo da planta.
    setTimeout(() => panelRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' }), 0);
  };

  /* ── Ações ──────────────────────────────────────────────────────────────── */

  const startNew = () => {
    // Sem scroll: a pessoa vai clicar na planta a seguir (o painel só se revela depois).
    setSelectedId(null); setDraft(null); setPanel('new'); setPlacing('new');
  };

  const cancelNew = () => { setPlacing(null); setDraft(null); setPanel(null); };

  const select = (o: Ocorrencia | null) => {
    setPlacing(null); setDraft(null);
    if (!o) { setSelectedId(null); setPanel(null); return; }
    setSelectedId(o.id); setPanel('view');
    if (o.piso !== pisoId) setPisoId(o.piso);
    setFocus({ x: o.x, y: o.y, n: Date.now() });
    revealPanel();
  };

  const onPlace = async (x: number, y: number) => {
    if (placing === 'new') {
      setDraft({ x, y, piso: pisoId });
      revealPanel();
    } else if (placing === 'move' && selected) {
      setSaving(true);
      try {
        const upd = await updateOcorrencia(selected.id, { x, y, piso: pisoId });
        setList(l => l.map(o => (o.id === upd.id ? upd : o)));
        toast.success('Local atualizado.');
        setPlacing(null);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Não foi possível mudar o local.');
      } finally {
        setSaving(false);
      }
    }
  };

  const submitNew = async (v: OcorrenciaFormValues) => {
    if (!draft) return;
    setSaving(true);
    try {
      const created = await createOcorrencia({
        piso: draft.piso, x: draft.x, y: draft.y,
        titulo: v.titulo, intervencao: v.intervencao, zona: v.zona,
        categoria: v.categoria, prioridade: v.prioridade,
        data_ocorrencia: v.data_ocorrencia,
        interlocutor: v.interlocutor, data_reporte: v.data_reporte || null, obs: v.obs,
      });
      setList(l => [created, ...l]);
      toast.success('Ocorrência registada.');
      setPlacing(null); setDraft(null);
      setSelectedId(created.id); setPanel('view');
      setFocus({ x: created.x, y: created.y, n: Date.now() });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível registar a ocorrência.');
    } finally {
      setSaving(false);
    }
  };

  const submitEdit = async (v: OcorrenciaFormValues) => {
    if (!selected) return;
    setSaving(true);
    try {
      const upd = await updateOcorrencia(selected.id, {
        titulo: v.titulo, intervencao: v.intervencao, zona: v.zona,
        categoria: v.categoria, prioridade: v.prioridade, data_ocorrencia: v.data_ocorrencia,
        interlocutor: v.interlocutor, data_reporte: v.interlocutor.trim() ? (v.data_reporte || null) : null,
        obs: v.obs,
      });
      setList(l => l.map(o => (o.id === upd.id ? upd : o)));
      toast.success('Ocorrência guardada.');
      setPanel('view');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível guardar.');
    } finally {
      setSaving(false);
    }
  };

  const changeEstado = async (e: Estado) => {
    if (!selected) return;
    setSaving(true);
    try {
      const upd = await updateOcorrencia(selected.id, { estado: e });
      setList(l => l.map(o => (o.id === upd.id ? upd : o)));
      toast.success(`Estado: ${estadoDef(e).label}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível mudar o estado.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await deleteOcorrencia(selected.id);
      setList(l => l.filter(o => o.id !== selected.id));
      toast.success('Ocorrência apagada.');
      setSelectedId(null); setPanel(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível apagar.');
    } finally {
      setSaving(false);
    }
  };

  const formFromSelected = (o: Ocorrencia): OcorrenciaFormValues => ({
    titulo: o.titulo, intervencao: o.intervencao, zona: o.zona ?? '', categoria: o.categoria,
    prioridade: o.prioridade, data_ocorrencia: o.data_ocorrencia, interlocutor: o.interlocutor ?? '',
    data_reporte: o.data_reporte ?? '', obs: o.obs ?? '',
  });

  /* ── Render ─────────────────────────────────────────────────────────────── */

  if (plantas.length === 0) {
    return (
      <div className="mx-auto max-w-xl p-8 text-center text-sm text-muted-foreground">
        <Building2 className="mx-auto mb-3 h-8 w-8" />
        Esta instalação ainda não tem plantas configuradas.
      </div>
    );
  }

  const planta = plantas.find(p => p.id === pisoId) ?? plantas[0];
  const kpiCard = (key: string, icon: React.ReactNode, label: string, value: string | number, tone: string, onClick?: () => void, active?: boolean) => (
    <button
      key={key} type="button" onClick={onClick} disabled={!onClick}
      aria-pressed={onClick ? !!active : undefined}
      className={cn(
        'flex items-center gap-3 rounded-lg border bg-card p-3 text-left transition-colors',
        onClick && 'hover:bg-muted/50', active && 'border-primary ring-1 ring-primary',
      )}
    >
      <span className={cn('flex h-9 w-9 items-center justify-center rounded-md', tone)}>{icon}</span>
      <span>
        <span className="block text-xl font-bold leading-none">{value}</span>
        <span className="mt-1 block text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
      </span>
    </button>
  );

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-bold tracking-tight">Instalações</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="icon" onClick={() => void load()} disabled={loading} aria-label="Atualizar">
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </Button>
          {editable && (
            <Button type="button" onClick={startNew} disabled={placing === 'new'}>
              <Plus className="mr-1.5 h-4 w-4" /> Registar ocorrência
            </Button>
          )}
        </div>
      </div>

      {loadError && (
        <div role="alert" className="flex items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {loadError}
          <Button type="button" size="sm" variant="outline" onClick={() => void load()}>Tentar de novo</Button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpiCard('ativas', <ListChecks className="h-4 w-4" />, 'Por resolver', resumo.ativas, 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300',
          () => { setQuick(null); setEstado('ativas'); }, quick === null && estado === 'ativas')}
        {kpiCard('urgentes', <AlertTriangle className="h-4 w-4" />, 'Urgentes', resumo.urgentes, 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300',
          () => setQuick(quick === 'urgentes' ? null : 'urgentes'), quick === 'urgentes')}
        {kpiCard('reportar', <Send className="h-4 w-4" />, 'Por reportar', resumo.porReportar, 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
          () => setQuick(quick === 'por_reportar' ? null : 'por_reportar'), quick === 'por_reportar')}
        {kpiCard('antiga', <Clock className="h-4 w-4" />, 'Mais antiga (dias)', resumo.maisAntiga ?? '—', 'bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300')}
      </div>

      {/* Planta */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Piso">
          {plantas.map(p => (
            <button
              key={p.id} type="button" role="tab" aria-selected={p.id === pisoId}
              onClick={() => setPisoId(p.id)}
              className={cn(
                'flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
                p.id === pisoId ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-muted',
              )}
            >
              {p.label}
              {(ativasPorPiso[p.id] ?? 0) > 0 && (
                <span className={cn('rounded-full px-1.5 text-[11px]', p.id === pisoId ? 'bg-primary-foreground/25' : 'bg-muted text-muted-foreground')}>
                  {ativasPorPiso[p.id]}
                </span>
              )}
            </button>
          ))}
        </div>

        <PlantaViewer
          src={assetUrl(planta.src)}
          alt={`Planta — ${planta.label}`}
          pins={pins}
          selectedId={selectedId}
          draft={draft && draft.piso === pisoId ? { x: draft.x, y: draft.y } : null}
          placing={editable ? placing : null}
          focus={focus}
          onPlace={onPlace}
          onSelect={id => select(id ? list.find(o => o.id === id) ?? null : null)}
          onCancelPlacing={() => { if (placing === 'new') cancelNew(); else setPlacing(null); }}
        />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          <span>Prioridade:</span>
          {PRIORIDADES.map(p => (
            <span key={p.value} className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: p.pin }} /> {p.label}
            </span>
          ))}
          <span className="opacity-60">· marcadores esbatidos = resolvidas/canceladas</span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Lista */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[160px] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Pesquisar…" className="pl-8" aria-label="Pesquisar ocorrências" />
            </div>
            <Select value={estado} onValueChange={v => { setQuick(null); setEstado(v as OcorrenciaFiltro['estado']); }}>
              <SelectTrigger className="w-[130px]" aria-label="Estado"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ativas">Por resolver</SelectItem>
                <SelectItem value="all">Todas</SelectItem>
                {ESTADOS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={prioridade} onValueChange={v => setPrioridade(v as Prioridade | 'all')}>
              <SelectTrigger className="w-[130px]" aria-label="Prioridade"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Prioridade</SelectItem>
                {PRIORIDADES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={categoria} onValueChange={v => setCategoria(v as Categoria | 'all')}>
              <SelectTrigger className="w-[150px]" aria-label="Categoria"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Categoria</SelectItem>
                {CATEGORIAS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="todos-pisos" checked={todosPisos} onCheckedChange={setTodosPisos} />
            <Label htmlFor="todos-pisos" className="text-xs text-muted-foreground">Mostrar todos os pisos</Label>
            {quick && (
              <button type="button" onClick={() => setQuick(null)} className="ml-auto text-xs text-primary underline-offset-2 hover:underline">
                Limpar filtro ({quick === 'urgentes' ? 'urgentes' : 'por reportar'})
              </button>
            )}
          </div>

          {loading && list.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> A carregar…
            </div>
          ) : visiveis.length === 0 ? (
            <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
              <MapPinned className="mx-auto mb-2 h-6 w-6" />
              {list.length === 0 ? 'Ainda não há ocorrências registadas.' : 'Nenhuma ocorrência com estes filtros.'}
            </div>
          ) : (
            <ul className="space-y-2" data-testid="lista-ocorrencias">
              {visiveis.map(o => {
                const pri = prioridadeDef(o.prioridade);
                const est = estadoDef(o.estado);
                const dias = diasDesde(o.data_ocorrencia);
                return (
                  <li key={o.id}>
                    <button
                      type="button" onClick={() => select(o)} aria-current={o.id === selectedId}
                      className={cn(
                        'w-full rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted/50',
                        o.id === selectedId && 'border-primary ring-1 ring-primary',
                        !isAtiva(o) && 'opacity-70',
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <span className="mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: pri.pin }} title={pri.label} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <span className="truncate text-sm font-medium">{o.titulo}</span>
                            <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium', est.cls)}>{est.label}</span>
                          </div>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">{o.intervencao}</p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                            <span>{pisoLabel(o.piso)}{o.zona ? ` · ${o.zona}` : ''}</span>
                            <span>{fmtDia(o.data_ocorrencia)}{isAtiva(o) && dias > 0 ? ` (há ${dias} d)` : ''}</span>
                            {o.interlocutor
                              ? <span>→ {o.interlocutor}</span>
                              : isAtiva(o) && <span className="font-medium text-amber-600 dark:text-amber-400">por reportar</span>}
                          </div>
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Painel: detalhe / registo / edição */}
        <div ref={panelRef} className="lg:sticky lg:top-4 lg:self-start">
          <div className="rounded-lg border bg-card p-4">
            {panel === 'new' && (
              draft ? (
                <>
                  <h2 className="mb-3 text-sm font-semibold">Nova ocorrência</h2>
                  <OcorrenciaForm
                    key="new" mode="new" initial={emptyForm()} saving={saving}
                    pisoLabel={pisoLabel(draft.piso)}
                    interlocutores={interlocutoresUsados(list)} zonas={zonasUsadas(list, draft.piso)}
                    onSubmit={submitNew} onCancel={cancelNew}
                  />
                </>
              ) : (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  <MapPinned className="mx-auto mb-2 h-6 w-6 text-primary" />
                  <p className="font-medium text-foreground">Clica na planta, no local do problema</p>
                  <p className="mt-1 text-xs">Podes ampliar e arrastar a planta antes de marcar. O formulário abre a seguir.</p>
                  <Button type="button" variant="ghost" size="sm" className="mt-3" onClick={cancelNew}>Cancelar</Button>
                </div>
              )
            )}

            {panel === 'view' && selected && (
              <OcorrenciaDetail
                o={selected} pisoLabel={pisoLabel(selected.piso)} canEdit={editable} busy={saving}
                historyKey={selected.updated_at}
                onEstado={changeEstado}
                onEdit={() => setPanel('edit')}
                onDelete={remove}
                onClose={() => select(null)}
              />
            )}

            {panel === 'edit' && selected && (
              <>
                <h2 className="mb-3 text-sm font-semibold">Editar ocorrência</h2>
                <OcorrenciaForm
                  key={`${selected.id}-${selected.updated_at}`} mode="edit" initial={formFromSelected(selected)} saving={saving}
                  pisoLabel={pisoLabel(selected.piso)}
                  interlocutores={interlocutoresUsados(list)} zonas={zonasUsadas(list, selected.piso)}
                  onSubmit={submitEdit} onCancel={() => setPanel('view')}
                  onMove={() => { setPanel('view'); setPlacing('move'); }}
                />
              </>
            )}

            {panel === null && (
              <div className="py-8 text-center text-sm text-muted-foreground">
                <MapPinned className="mx-auto mb-2 h-6 w-6" />
                Seleciona uma ocorrência na planta ou na lista
                {editable ? ', ou regista uma nova.' : '.'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
