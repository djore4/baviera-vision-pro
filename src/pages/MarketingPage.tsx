import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CalendarClock, MapPin, Sparkles } from 'lucide-react';
import {
  CATEGORIAS, CATEGORIA_BY_KEY, MARKETING_EVENTOS,
  agruparPorMes, estadoDe, formatarIntervalo, hojeIso, ordenar, posicaoHoje, proximoEvento, textoRelativo,
  type CategoriaKey, type MarketingEvento,
} from '@/lib/marketing';
import { cn } from '@/lib/utils';

/* ── Tab Marketing (Transversal) ──────────────────────────────────────────────
 * Linha do tempo dos eventos de marketing. Por agora só o administrador a vê
 * (TabDef.adminOnly). Visual alinhado com a plataforma (cores do tema, cartões,
 * tipografia) e dinâmico: o traço central "enche" até hoje, os cartões entram
 * ao fazer scroll, o marcador "Hoje" pulsa e os filtros reordenam a linha.
 * Respeita `prefers-reduced-motion`.
 * ──────────────────────────────────────────────────────────────────────────── */

type Filtro = 'todos' | CategoriaKey;

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

function CartaoEvento({ ev, lado, hoje, marcador }: {
  ev: MarketingEvento;
  lado: 'esq' | 'dir';
  hoje: string;
  marcador: (el: HTMLElement | null) => void;
}) {
  const [ref, visivel] = useEntrada<HTMLLIElement>();
  const cat = CATEGORIA_BY_KEY[ev.categoria];
  const estado = estadoDe(ev, hoje);
  const cor = `hsl(${cat.hsl})`;

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
        className={cn(
          'group rounded-lg border bg-card p-4 shadow-sm transition-all duration-300',
          'hover:-translate-y-0.5 hover:shadow-md motion-reduce:hover:translate-y-0',
          estado === 'passado' && 'opacity-70 hover:opacity-100',
          estado === 'a-decorrer' && 'ring-1',
          lado === 'esq' && 'md:text-right',
        )}
        style={{ borderTop: `3px solid ${cor}`, ...(estado === 'a-decorrer' ? { ['--tw-ring-color' as string]: cor } : {}) }}
      >
        <div className={cn('flex flex-wrap items-center gap-2', lado === 'esq' && 'md:justify-end')}>
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-medium"
            style={{ background: `hsl(${cat.hsl} / 0.12)`, color: cor }}
          >
            {cat.label}
          </span>
          <span className="text-xs font-medium tabular-nums text-muted-foreground">{formatarIntervalo(ev)}</span>
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[11px]',
              estado === 'a-decorrer' ? 'bg-success/15 font-medium text-success' : 'bg-muted text-muted-foreground',
            )}
          >
            {textoRelativo(ev, hoje)}
          </span>
        </div>
        <h3 className="mt-2 text-base font-semibold leading-snug">{ev.titulo}</h3>
        {ev.descricao && <p className="mt-1 text-sm text-muted-foreground">{ev.descricao}</p>}
        {(ev.local || ev.exemplo) && (
          <div className={cn('mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground', lado === 'esq' && 'md:justify-end')}>
            {ev.local && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{ev.local}</span>}
            {ev.exemplo && <span className="rounded border border-dashed px-1.5 py-0.5">Exemplo</span>}
          </div>
        )}
      </article>
    </li>
  );
}

export default function MarketingPage() {
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const hoje = useMemo(() => hojeIso(), []);

  const todos = useMemo(() => ordenar(MARKETING_EVENTOS), []);
  const visiveis = useMemo(() => (filtro === 'todos' ? todos : todos.filter(e => e.categoria === filtro)), [todos, filtro]);
  const grupos = useMemo(() => agruparPorMes(visiveis), [visiveis]);
  const proximo = useMemo(() => proximoEvento(MARKETING_EVENTOS, hoje), [hoje]);
  const contagem = useMemo(() => {
    const c: Record<string, number> = { todos: todos.length };
    for (const e of todos) c[e.categoria] = (c[e.categoria] ?? 0) + 1;
    return c;
  }, [todos]);

  /* ── Traço "preenchido" até hoje ──────────────────────────────────────────
   * Mede a posição vertical de cada marcador e interpola a de "hoje" entre eles. */
  const listaRef = useRef<HTMLOListElement | null>(null);
  const marcadores = useRef<Map<string, HTMLElement>>(new Map());
  const [alturaFill, setAlturaFill] = useState(0);
  const [yHoje, setYHoje] = useState<number | null>(null);
  const [pronto, setPronto] = useState(false);

  const medir = useCallback(() => {
    const lista = listaRef.current;
    if (!lista || visiveis.length === 0) { setYHoje(null); setAlturaFill(0); return; }
    const topo = lista.getBoundingClientRect().top;
    const ys = visiveis.map(e => {
      const el = marcadores.current.get(e.id);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return r.top + r.height / 2 - topo;
    });
    if (ys.some(y => y === null)) return;
    const pos = posicaoHoje(visiveis, hoje);
    const i = Math.min(Math.floor(pos), ys.length - 1);
    const y0 = ys[i] as number;
    const y1 = (ys[Math.min(i + 1, ys.length - 1)] ?? y0) as number;
    const y = y0 + (y1 - y0) * (pos - i);
    // Antes de qualquer evento: o preenchimento fica à entrada da linha.
    setYHoje(y);
    setAlturaFill(Math.max(0, y));
  }, [visiveis, hoje]);

  useLayoutEffect(() => { medir(); }, [medir]);
  useEffect(() => {
    // Só depois da primeira medição: o traço anima de 0 até à altura certa.
    const t = setTimeout(() => setPronto(true), 80);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    const lista = listaRef.current;
    if (!lista) return;
    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(() => medir()); ro.observe(lista); }
    window.addEventListener('resize', medir);
    return () => { ro?.disconnect(); window.removeEventListener('resize', medir); };
  }, [medir]);

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
          {([{ key: 'todos' as const, label: 'Todos', hsl: 'var(--primary)' }, ...CATEGORIAS]).map(c => {
            const ativo = filtro === c.key;
            const cor = c.key === 'todos' ? 'hsl(var(--primary))' : `hsl(${c.hsl})`;
            return (
              <button
                key={c.key}
                type="button"
                aria-pressed={ativo}
                onClick={() => setFiltro(c.key)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all duration-200',
                  ativo ? 'text-white shadow-sm' : 'bg-background text-muted-foreground hover:text-foreground',
                )}
                style={ativo ? { background: cor, borderColor: cor } : undefined}
              >
                {c.label}
                <span className={cn('tabular-nums', ativo ? 'opacity-80' : 'opacity-60')}>{contagem[c.key] ?? 0}</span>
              </button>
            );
          })}
        </div>
      </header>

      {/* Linha do tempo */}
      {visiveis.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Sem eventos nesta categoria.</p>
      ) : (
        <ol ref={listaRef} className="relative space-y-6 pb-4" aria-label="Linha do tempo de marketing">
          {/* Traço base + traço preenchido até hoje */}
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
          {/* Marcador "Hoje" */}
          {yHoje !== null && (
            <div
              aria-hidden
              data-testid="marcador-hoje"
              className="pointer-events-none absolute left-4 z-20 md:left-1/2"
              style={{
                top: pronto ? yHoje : 0,
                transition: 'top 1.4s cubic-bezier(0.22, 1, 0.36, 1)',
              }}
            >
              <span className="absolute -translate-x-1/2 -translate-y-1/2">
                <span className="absolute inset-0 -m-1.5 animate-ping rounded-full bg-primary/40 motion-reduce:animate-none" />
                <span className="relative block h-3 w-3 rounded-full border-2 border-card bg-primary shadow" />
              </span>
              <span className="absolute left-3 top-0 hidden -translate-y-1/2 whitespace-nowrap md:block rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground shadow-sm">
                Hoje
              </span>
            </div>
          )}

          {grupos.map(g => (
            <li key={g.key} className="list-none space-y-6" aria-label={g.label}>
              <div className="sticky top-2 z-30 flex pl-12 md:justify-center md:pl-0">
                <span className="rounded-full border bg-card/90 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground shadow-sm backdrop-blur">
                  {g.label}
                </span>
              </div>
              <ol className="space-y-6">
                {g.eventos.map(ev => {
                  indice += 1;
                  return (
                    <CartaoEvento
                      key={ev.id}
                      ev={ev}
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
      )}
    </div>
  );
}
