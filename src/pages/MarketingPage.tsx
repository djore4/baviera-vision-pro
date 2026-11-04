import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CalendarClock, ImageIcon, MapPin, Plus, Settings2, Sparkles, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  COR_SEM_CATEGORIA, agendaComHoje, contagemDias, estadoDe, formatarIntervalo, hojeIso, ordenar, proximoEvento,
  resumoAgenda, resumoConvidados, textoRelativo, type Categoria, type Convidado, type EstadoConvidado, type TomContagem, type MarketingEvento, type Orcamento,
} from '@/lib/marketing';
import { listCategorias, listEstadosConvidados, listEventos, listOrcamentos } from '@/lib/marketing-data';
import { usePermissions } from '@/contexts/PermissionsContext';
import { CategoriasDialog } from '@/components/marketing/CategoriasDialog';
import { EventoDetalhe } from '@/components/marketing/EventoDetalhe';
import { EventoDialog } from '@/components/marketing/EventoDialog';
import { useUrlFicheiro } from '@/components/marketing/useUrlFicheiro';
import { cn } from '@/lib/utils';

/* ── Tab Marketing (Transversal) ──────────────────────────────────────────────
 * Linha do tempo dos eventos de marketing. Por agora só o administrador a vê
 * (TabDef.adminOnly). Visual alinhado com a plataforma (cores do tema, cartões,
 * tipografia) e dinâmico: o traço central "enche" até hoje, os cartões entram
 * ao fazer scroll, o marcador "Hoje" pulsa e os filtros reordenam a linha.
 * Respeita `prefers-reduced-motion`.
 * ──────────────────────────────────────────────────────────────────────────── */

type Filtro = 'todos' | string; // 'todos' ou o id da categoria

/* Mostra o elemento quando entra no ecrã (uma vez). Sem IntersectionObserver
 * (testes, browsers antigos) fica logo visível. */
function useEntrada<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [visivel, setVisivel] = useState(() => typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    const el = ref.current;
    if (visivel || !el) return;
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) { setVisivel(true); io.disconnect(); }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.1 });
    io.observe(el);
    return () => io.disconnect();
  }, [visivel]);
  return [ref, visivel] as const;
}

const TOM_CONTAGEM: Record<TomContagem, string> = {
  urgente: 'bg-destructive/10 text-destructive',
  breve: 'bg-warning/15 text-warning',
  normal: 'bg-primary/10 text-primary',
  agora: 'bg-success/15 text-success',
  passado: 'bg-muted text-muted-foreground',
};

/* O número grande de cada cartão: quantos dias faltam (ou há quantos dias foi). */
function ContagemBloco({ ev, hoje }: { ev: MarketingEvento; hoje: string }) {
  const c = contagemDias(ev, hoje);
  return (
    <div
      data-testid="contagem"
      aria-label={textoRelativo(ev, hoje)}
      className={cn('flex w-[5.25rem] shrink-0 flex-col items-center justify-center rounded-lg px-1 py-2 text-center leading-none', TOM_CONTAGEM[c.tom])}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wide opacity-80">{c.topo}</span>
      <span className={cn('my-1 font-bold tabular-nums', c.valor.length > 3 ? 'text-base' : 'text-3xl')}>{c.valor}</span>
      {c.rotulo && <span className="text-[10px] font-medium opacity-80">{c.rotulo}</span>}
    </div>
  );
}

function CartaoEvento({ ev, categoria, lado, hoje, convidados, todosOsConvidados, aoAbrir, marcador }: {
  ev: MarketingEvento;
  categoria: Categoria | null;
  lado: 'esq' | 'dir';
  hoje: string;
  convidados: EstadoConvidado[];
  /** Falso para quem só vê os seus convidados (o texto diz "meus"). */
  todosOsConvidados: boolean;
  aoAbrir: () => void;
  marcador: (el: HTMLElement | null) => void;
}) {
  const [ref, visivel] = useEntrada<HTMLLIElement>();
  const hsl = categoria?.cor ?? COR_SEM_CATEGORIA;
  const estado = estadoDe(ev, hoje);
  const cor = `hsl(${hsl})`;
  const capa = useUrlFicheiro(ev.imagem_path);
  const resumo = resumoConvidados(convidados.map(estado => ({ estado })));

  return (
    <li
      ref={ref}
      data-testid="evento"
      data-estado={estado}
      className={cn(
        'relative pl-12 md:w-1/2 md:pl-0',
        lado === 'esq' ? 'md:pr-10' : 'md:ml-auto md:pl-10',
        'transition-all duration-700 ease-out motion-reduce:transition-none',
        visivel ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0 motion-reduce:translate-y-0 motion-reduce:opacity-100',
      )}
    >
      {/* Marcador sobre o traço */}
      <span
        ref={marcador}
        aria-hidden
        className={cn(
          'absolute left-4 top-6 z-10 flex h-4 w-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 bg-card transition-transform duration-500',
          lado === 'esq' ? 'md:left-auto md:right-0 md:translate-x-1/2' : 'md:left-0',
          visivel ? 'scale-100' : 'scale-0 motion-reduce:scale-100',
        )}
        style={{ borderColor: cor }}
      >
        <span
          className={cn('h-1.5 w-1.5 rounded-full', estado === 'a-decorrer' && 'animate-ping motion-reduce:animate-none')}
          style={{ background: estado === 'passado' ? 'hsl(var(--muted-foreground))' : cor }}
        />
      </span>

      <article
        role="button"
        tabIndex={0}
        aria-label={`Abrir ${ev.titulo}`}
        onClick={aoAbrir}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); aoAbrir(); } }}
        className={cn(
          'group cursor-pointer overflow-hidden rounded-lg border bg-card shadow-sm transition-all duration-300',
          'hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:hover:translate-y-0',
          estado === 'passado' && 'opacity-70 hover:opacity-100',
          estado === 'a-decorrer' && 'ring-1',
          lado === 'esq' && 'md:text-right',
        )}
        style={{ borderTop: `3px solid ${cor}`, ...(estado === 'a-decorrer' ? { ['--tw-ring-color' as string]: cor } : {}) }}
      >
        {capa && (
          <div className="h-32 w-full overflow-hidden bg-muted">
            <img src={capa} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:transition-none" />
          </div>
        )}
        <div className={cn('flex items-start gap-3 p-4', lado === 'esq' && 'md:flex-row-reverse')}>
          <ContagemBloco ev={ev} hoje={hoje} />
          <div className="min-w-0 flex-1">
            <div className={cn('flex flex-wrap items-center gap-2', lado === 'esq' && 'md:justify-end')}>
              {categoria && (
                <span className="rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ background: `hsl(${hsl} / 0.12)`, color: cor }}>
                  {categoria.nome}
                </span>
              )}
              <span className="text-xs font-medium tabular-nums text-muted-foreground">{formatarIntervalo(ev)}{ev.hora ? ` · ${ev.hora}` : ''}</span>
            </div>
            <h3 className="mt-2 text-base font-semibold leading-snug">{ev.titulo}</h3>
            {ev.descricao && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{ev.descricao}</p>}
            <div className={cn('mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground', lado === 'esq' && 'md:justify-end')}>
              <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{ev.local}</span>
              {resumo.total > 0 && (
                <span className="inline-flex items-center gap-1 tabular-nums">
                  <Users className="h-3 w-3" />
                  {todosOsConvidados ? `${resumo.confirmados}/${resumo.total} confirmados` : `${resumo.total} ${resumo.total === 1 ? 'convidado meu' : 'convidados meus'}`}
                </span>
              )}
            </div>
          </div>
        </div>
      </article>
    </li>
  );
}

export default function MarketingPage() {
  const { canEdit: podeEditar, effectiveEmail, me } = usePermissions();
  const canEdit = podeEditar('marketing');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const hoje = useMemo(() => hojeIso(), []);

  const [eventos, setEventos] = useState<MarketingEvento[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [orcamentos, setOrcamentos] = useState<Record<string, Orcamento>>({});
  const [estadosConv, setEstadosConv] = useState<Record<string, EstadoConvidado[]>>({});
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [aberto, setAberto] = useState<string | null>(null);          // detalhe
  const [form, setForm] = useState<{ evento: MarketingEvento | null } | null>(null); // criar/editar
  const [gerirCategorias, setGerirCategorias] = useState(false);

  useEffect(() => {
    let vivo = true;
    Promise.all([listEventos(), listCategorias(), listEstadosConvidados()])
      .then(([evs, cats, convs]) => {
        if (!vivo) return;
        setEventos(evs); setCategorias(cats);
        const m: Record<string, EstadoConvidado[]> = {};
        for (const c of convs) (m[c.evento_id] ??= []).push(c.estado);
        setEstadosConv(m);
      })
      .catch(e => { if (vivo) setErro(e instanceof Error ? e.message : 'Não foi possível carregar o Marketing.'); })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, []);

  // O orçamento só existe para quem edita (a base de dados não o devolve aos outros).
  useEffect(() => {
    if (!canEdit) { setOrcamentos({}); return; }
    let vivo = true;
    listOrcamentos().then(o => { if (vivo) setOrcamentos(o); });
    return () => { vivo = false; };
  }, [canEdit]);

  const catPorId = useMemo(() => new Map(categorias.map(c => [c.id, c])), [categorias]);
  const todos = useMemo(() => ordenar(eventos), [eventos]);
  const visiveis = useMemo(() => (filtro === 'todos' ? todos : todos.filter(e => e.categoria_id === filtro)), [todos, filtro]);
  const grupos = useMemo(() => agendaComHoje(visiveis, hoje), [visiveis, hoje]);
  const proximo = useMemo(() => proximoEvento(eventos, hoje), [eventos, hoje]);
  const contagem = useMemo(() => {
    const c: Record<string, number> = { todos: todos.length };
    for (const e of todos) if (e.categoria_id) c[e.categoria_id] = (c[e.categoria_id] ?? 0) + 1;
    return c;
  }, [todos]);
  const agenda = useMemo(() => resumoAgenda(eventos, hoje), [eventos, hoje]);
  const eventoAberto = useMemo(() => eventos.find(e => e.id === aberto) ?? null, [eventos, aberto]);

  const gravado = (ev: MarketingEvento, orc: Orcamento) => {
    setOrcamentos(m => ({ ...m, [ev.id]: orc }));
    setEventos(l => (l.some(x => x.id === ev.id) ? l.map(x => (x.id === ev.id ? ev : x)) : [...l, ev]));
    toast.success('Evento guardado.');
  };
  const convidadosAtualizados = useCallback((id: string, lista: Convidado[]) => {
    setEstadosConv(m => ({ ...m, [id]: lista.map(c => c.estado) }));
  }, []);
  const categoriasAlteradas = (lista: Categoria[]) => {
    setCategorias(lista);
    if (filtro !== 'todos' && !lista.some(c => c.id === filtro)) setFiltro('todos');
  };

  /* ── Traço "preenchido" até hoje ──────────────────────────────────────────
   * "Hoje" é um item da própria linha: o traço enche até ao centro desse item. */
  const caixaRef = useRef<HTMLDivElement | null>(null);
  const hojeRef = useRef<HTMLElement | null>(null);
  const marcadores = useRef<Map<string, HTMLElement>>(new Map());
  const [alturaFill, setAlturaFill] = useState(0);
  const [pronto, setPronto] = useState(false);

  const medir = useCallback(() => {
    const caixa = caixaRef.current;
    const alvo = hojeRef.current;
    if (!caixa || !alvo) { setAlturaFill(0); return; }
    const r = alvo.getBoundingClientRect();
    setAlturaFill(Math.max(0, r.top + r.height / 2 - caixa.getBoundingClientRect().top));
  }, []);

  useLayoutEffect(() => { medir(); }, [medir]);
  useEffect(() => {
    // Só depois da primeira medição: o traço anima de 0 até à altura certa.
    const t = setTimeout(() => setPronto(true), 80);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    const caixa = caixaRef.current;
    if (!caixa) return;
    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(() => medir()); ro.observe(caixa); }
    window.addEventListener('resize', medir);
    return () => { ro?.disconnect(); window.removeEventListener('resize', medir); };
  }, [medir, visiveis]);

  const irParaProximo = () => {
    const alvo = proximo ? marcadores.current.get(proximo.id) : null;
    alvo?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  };

  let indice = -1; // para alternar esquerda/direita só nos cartões (não nos cabeçalhos de mês)

  return (
    <div className="mx-auto max-w-5xl animate-fade-in space-y-6">
      {/* Cabeçalho */}
      <header className="relative overflow-hidden rounded-lg border bg-card p-5 shadow-sm">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full opacity-[0.08] blur-2xl"
          style={{ background: 'hsl(var(--primary))' }}
        />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold">
              <Sparkles className="h-5 w-5 text-primary" /> Marketing
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">Linha do tempo dos eventos e campanhas.</p>
            {canEdit && (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => setForm({ evento: null })}><Plus className="mr-1.5 h-4 w-4" /> Novo evento</Button>
                <Button size="sm" variant="outline" onClick={() => setGerirCategorias(true)}><Settings2 className="mr-1.5 h-4 w-4" /> Categorias</Button>
              </div>
            )}
          </div>
          {proximo && (
            <button
              type="button"
              onClick={irParaProximo}
              className="group flex items-center gap-3 rounded-lg border bg-background px-4 py-2.5 text-left transition-colors hover:border-primary/50"
            >
              <CalendarClock className="h-5 w-5 shrink-0 text-primary transition-transform group-hover:scale-110" />
              <span className="min-w-0">
                <span className="block text-[11px] uppercase tracking-wide text-muted-foreground">Próximo</span>
                <span className="block truncate text-sm font-medium">{proximo.titulo}</span>
                <span className="block text-xs text-muted-foreground">{formatarIntervalo(proximo)} · {textoRelativo(proximo, hoje)}</span>
              </span>
            </button>
          )}
        </div>

        {/* Filtros por categoria */}
        <div className="relative mt-4 flex flex-wrap gap-2" role="group" aria-label="Filtrar por categoria">
          {([{ id: 'todos', nome: 'Todos', cor: null as string | null }, ...categorias.map(c => ({ id: c.id, nome: c.nome, cor: c.cor }))]).map(c => {
            const ativo = filtro === c.id;
            const cor = c.cor ? `hsl(${c.cor})` : 'hsl(var(--primary))';
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={ativo}
                onClick={() => setFiltro(c.id)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all duration-200',
                  ativo ? 'text-white shadow-sm' : 'bg-background text-muted-foreground hover:text-foreground',
                )}
                style={ativo ? { background: cor, borderColor: cor } : undefined}
              >
                {c.nome}
                <span className={cn('tabular-nums', ativo ? 'opacity-80' : 'opacity-60')}>{contagem[c.id] ?? 0}</span>
              </button>
            );
          })}
        </div>
      </header>

      {/* Números da agenda */}
      {!carregando && !erro && eventos.length > 0 && (
        <div data-testid="resumo-agenda" className="grid grid-cols-3 gap-3">
          {([
            ['Por acontecer', agenda.porAcontecer, 'text-primary'],
            ['Nos próximos 30 dias', agenda.proximos30, 'text-warning'],
            ['Já realizados', agenda.realizados, 'text-muted-foreground'],
          ] as const).map(([rotulo, n, cor]) => (
            <div key={rotulo} className="rounded-lg border bg-card px-4 py-3 shadow-sm">
              <div className={cn('text-2xl font-semibold tabular-nums', cor)}>{n}</div>
              <div className="text-xs text-muted-foreground">{rotulo}</div>
            </div>
          ))}
        </div>
      )}

      {/* Linha do tempo */}
      {carregando ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">A carregar…</p>
      ) : erro ? (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-6 text-center text-sm text-destructive">{erro}</p>
      ) : visiveis.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <ImageIcon className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {eventos.length === 0 ? (canEdit ? 'Ainda não há eventos. Cria o primeiro para começar a linha do tempo.' : 'Ainda não há eventos.') : 'Sem eventos nesta categoria.'}
          </p>
          {eventos.length === 0 && canEdit && <Button className="mt-3" size="sm" onClick={() => setForm({ evento: null })}><Plus className="mr-1.5 h-4 w-4" /> Novo evento</Button>}
        </div>
      ) : (
        <div ref={caixaRef} className="relative pb-4">
          {/* Traço base + traço preenchido até hoje (fora da lista: o space-y da lista não os desloca) */}
          <div aria-hidden className="absolute bottom-0 left-4 top-0 w-0.5 -translate-x-1/2 rounded-full bg-border md:left-1/2" />
          <div
            aria-hidden
            data-testid="traco-preenchido"
            className="absolute left-4 top-0 w-0.5 -translate-x-1/2 rounded-full md:left-1/2 motion-reduce:transition-none"
            style={{
              height: pronto ? alturaFill : 0,
              transition: 'height 1.4s cubic-bezier(0.22, 1, 0.36, 1)',
              background: 'linear-gradient(to bottom, hsl(var(--primary) / 0.25), hsl(var(--primary)))',
            }}
          />

          <ol className="relative space-y-6" aria-label="Linha do tempo de marketing">
            {grupos.map(g => (
              <li key={g.key} className="list-none space-y-6" aria-label={g.label}>
                <div className="sticky top-2 z-30 flex pl-12 md:justify-center md:pl-0">
                  <span className="rounded-full border bg-card/90 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground shadow-sm backdrop-blur">
                    {g.label}
                  </span>
                </div>
                <ol className="space-y-6">
                  {g.itens.map(item => {
                    if (item.tipo === 'hoje') {
                      return (
                        <li key="hoje" className="flex pl-12 md:justify-center md:pl-0">
                          <span
                            ref={el => { hojeRef.current = el; }}
                            data-testid="marcador-hoje"
                            className="relative z-20 inline-flex items-center gap-2 rounded-full bg-primary px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary-foreground shadow-md"
                          >
                            <span className="relative flex h-2 w-2">
                              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/70 motion-reduce:animate-none" />
                              <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
                            </span>
                            Hoje · {formatarIntervalo({ inicio: hoje })}
                          </span>
                        </li>
                      );
                    }
                    const ev = item.evento;
                    indice += 1;
                    return (
                      <CartaoEvento
                        key={ev.id}
                        ev={ev}
                        categoria={ev.categoria_id ? catPorId.get(ev.categoria_id) ?? null : null}
                        convidados={estadosConv[ev.id] ?? []}
                        todosOsConvidados={canEdit}
                        aoAbrir={() => setAberto(ev.id)}
                        lado={indice % 2 === 0 ? 'esq' : 'dir'}
                        hoje={hoje}
                        marcador={el => { if (el) marcadores.current.set(ev.id, el); else marcadores.current.delete(ev.id); }}
                      />
                    );
                  })}
                </ol>
              </li>
            ))}
          </ol>
        </div>
      )}
    
      <EventoDetalhe
        evento={eventoAberto}
        categoria={eventoAberto?.categoria_id ? catPorId.get(eventoAberto.categoria_id) ?? null : null}
        canEdit={canEdit}
        orcamento={eventoAberto ? orcamentos[eventoAberto.id] ?? null : null}
        meuEmail={effectiveEmail}
        meuNome={me?.nome ?? null}
        hoje={hoje}
        onClose={() => setAberto(null)}
        onEdit={ev => setForm({ evento: ev })}
        onDeleted={id => { setEventos(l => l.filter(e => e.id !== id)); toast.success('Evento apagado.'); }}
        onConvidados={convidadosAtualizados}
      />
      <EventoDialog
        open={!!form}
        onOpenChange={o => { if (!o) setForm(null); }}
        evento={form?.evento ?? null}
        categorias={categorias}
        orcamento={form?.evento ? orcamentos[form.evento.id] ?? null : null}
        onSaved={gravado}
        onCategoriaCriada={c => setCategorias(l => [...l, c])}
        onGerirCategorias={() => setGerirCategorias(true)}
      />
      <CategoriasDialog open={gerirCategorias} onOpenChange={setGerirCategorias} categorias={categorias} onChange={categoriasAlteradas} />
    </div>
  );
}
