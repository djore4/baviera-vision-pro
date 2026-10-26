import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Minus, Plus, Maximize2, Crosshair, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { clampView, MAX_SCALE, MIN_SCALE, type View } from '@/lib/planta-view';

/* ── Planta com zoom, arrastar e marcadores ───────────────────────────────────
 * A planta é muito larga (≈ 3,4 : 1), por isso o zoom/arrasto é o essencial:
 *   · roda do rato com Ctrl/⌘ (ou pinch no trackpad / no telemóvel), botões + e −;
 *   · arrastar para mover; um clique sem arrastar regista/seleciona.
 * As posições são frações 0–1 da imagem (não dependem da resolução). Os marcadores
 * mantêm o tamanho ao ampliar (contra-escala).
 * ──────────────────────────────────────────────────────────────────────────── */

export interface PlantaPin {
  id: string;
  x: number;
  y: number;
  color: string;
  label: string;
  /** Esbatido (resolvida/cancelada). */
  dim?: boolean;
}

interface Props {
  src: string;
  alt: string;
  pins: PlantaPin[];
  selectedId: string | null;
  /** Marcador provisório de uma ocorrência por gravar. */
  draft: { x: number; y: number } | null;
  /** Modo "clica no local": o clique devolve a posição em vez de selecionar. */
  placing: null | 'new' | 'move';
  /** Centra o mapa neste ponto (`n` muda a cada pedido, para repetir o mesmo ponto). */
  focus: { x: number; y: number; n: number } | null;
  onPlace: (x: number, y: number) => void;
  onSelect: (id: string | null) => void;
  onCancelPlacing: () => void;
}

const DEFAULT_ASPECT = 1193 / 4056;     // altura/largura das plantas atuais
const MIN_HEIGHT = 300;
const MIN_HEIGHT_NARROW = 200;           // ecrãs estreitos (< 640 px)

export function PlantaViewer({ src, alt, pins, selectedId, draft, placing, focus, onPlace, onSelect, onCancelPlacing }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [cw, setCw] = useState(0);
  const [aspect, setAspect] = useState(DEFAULT_ASPECT);
  const [view, setView] = useState<View>({ s: 1, tx: 0, ty: 0 });
  const [panning, setPanning] = useState(false);

  const w = cw;
  const h = cw * aspect;
  const ch = Math.max(h, w < 640 ? MIN_HEIGHT_NARROW : MIN_HEIGHT);

  // Vista inicial: a planta inteira (todos os marcadores visíveis); amplia-se a pedido.
  const home = useCallback((): View => clampView({ s: 1, tx: 0, ty: 0 }, w, ch, w, h), [w, ch, h]);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setCw(el.clientWidth));
    ro.observe(el);
    setCw(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // Vista inicial (e sempre que a planta ou a largura mudam).
  useEffect(() => { if (w > 0) setView(home()); }, [home, w, src]);

  const zoomAt = useCallback((factor: number, cx: number, cy: number) => {
    setView(v => {
      const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.s * factor));
      const k = s / v.s;
      return clampView({ s, tx: cx - (cx - v.tx) * k, ty: cy - (cy - v.ty) * k }, w, ch, w, h);
    });
  }, [w, ch, h]);

  // Ctrl/⌘ + roda (e o pinch do trackpad, que chega como ctrl+roda): listener não passivo.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * 0.0025), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  // Centrar num ponto (ao escolher uma ocorrência na lista).
  useEffect(() => {
    if (!focus || w <= 0) return;
    setView(v => {
      const s = Math.max(v.s, 3);
      return clampView({ s, tx: w / 2 - focus.x * w * s, ty: ch / 2 - focus.y * h * s }, w, ch, w, h);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.n]);

  /* ── Ponteiros: arrastar, pinch e clique ─────────────────────────────────── */
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ x: number; y: number; tx: number; ty: number; moved: boolean } | null>(null);
  const pinch = useRef<{ d: number } | null>(null);

  const dist = () => {
    const [a, b] = [...pointers.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    wrapRef.current?.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      drag.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty, moved: false };
    } else if (pointers.current.size === 2) {
      if (drag.current) drag.current.moved = true;      // já não é um clique
      pinch.current = { d: dist() };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinch.current) {
      const d = dist();
      const [a, b] = [...pointers.current.values()];
      const r = wrapRef.current!.getBoundingClientRect();
      zoomAt(d / pinch.current.d, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      pinch.current.d = d;
      return;
    }
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) > 4) { d.moved = true; setPanning(true); }
    if (d.moved) setView(v => clampView({ ...v, tx: d.tx + dx, ty: d.ty + dy }, w, ch, w, h));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    const d = drag.current;
    if (pointers.current.size === 0) {
      drag.current = null; pinch.current = null; setPanning(false);
      if (d && !d.moved) handleClick(e.clientX, e.clientY);
    } else if (pointers.current.size === 1) {
      pinch.current = null;
      // continua a arrastar com o dedo que ficou, a partir de onde está
      const [p] = [...pointers.current.values()];
      drag.current = { x: p.x, y: p.y, tx: view.tx, ty: view.ty, moved: true };
    }
  };

  const handleClick = (clientX: number, clientY: number) => {
    const st = stageRef.current;
    if (!st) return;
    const r = st.getBoundingClientRect();
    const x = (clientX - r.left) / r.width, y = (clientY - r.top) / r.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    if (placing) onPlace(x, y);
    else onSelect(null);
  };

  const center = () => ({ x: w / 2, y: ch / 2 });
  const btn = 'h-8 w-8 bg-background/95 shadow-sm';

  return (
    <div
      ref={wrapRef}
      className={cn(
        'relative overflow-hidden rounded-lg border bg-white touch-none select-none',
        placing ? 'cursor-crosshair' : panning ? 'cursor-grabbing' : 'cursor-grab',
      )}
      style={{ height: ch || MIN_HEIGHT }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      data-testid="planta-viewer"
    >
      {w > 0 && (
        <div
          ref={stageRef}
          className="absolute left-0 top-0"
          style={{ width: w, height: h, transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.s})`, transformOrigin: '0 0' }}
        >
          <img
            src={src} alt={alt} draggable={false}
            className="block h-full w-full pointer-events-none"
            onLoad={e => {
              const im = e.currentTarget;
              if (im.naturalWidth > 0) setAspect(im.naturalHeight / im.naturalWidth);
            }}
          />

          {pins.map(p => {
            const sel = p.id === selectedId;
            return (
              <div key={p.id} className="absolute" style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%`, zIndex: sel ? 30 : 10 }}>
                <button
                  type="button"
                  title={p.label}
                  aria-label={p.label}
                  aria-pressed={sel}
                  onPointerDown={e => e.stopPropagation()}
                  onClick={e => { e.stopPropagation(); if (!placing) onSelect(p.id); }}
                  className={cn('block origin-bottom focus:outline-none', p.dim && 'opacity-45')}
                  style={{ transform: `translate(-50%, -100%) scale(${(sel ? 1.25 : 1) / view.s})` }}
                >
                  <svg width="24" height="32" viewBox="0 0 24 32" className={cn('drop-shadow', sel && 'drop-shadow-lg')}>
                    <path d="M12 1C5.9 1 1 5.9 1 12c0 8.3 11 19 11 19s11-10.7 11-19C23 5.9 18.1 1 12 1z"
                      fill={p.color} stroke={sel ? '#0f172a' : '#fff'} strokeWidth={sel ? 2.5 : 2} />
                    <circle cx="12" cy="12" r="4.5" fill="#fff" />
                  </svg>
                </button>
              </div>
            );
          })}

          {draft && (
            <div className="absolute pointer-events-none" style={{ left: `${draft.x * 100}%`, top: `${draft.y * 100}%`, zIndex: 40 }}>
              <div style={{ transform: `translate(-50%, -100%) scale(${1 / view.s})` }} data-testid="planta-draft">
                <svg width="28" height="36" viewBox="0 0 24 32" className="animate-bounce">
                  <path d="M12 1C5.9 1 1 5.9 1 12c0 8.3 11 19 11 19s11-10.7 11-19C23 5.9 18.1 1 12 1z"
                    fill="hsl(var(--primary))" stroke="#fff" strokeWidth="2" />
                  <circle cx="12" cy="12" r="4.5" fill="#fff" />
                </svg>
              </div>
            </div>
          )}
        </div>
      )}

      {placing && (
        <div className="absolute left-1/2 top-2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-md"
          onPointerDown={e => e.stopPropagation()}>
          <Crosshair className="h-3.5 w-3.5" />
          {placing === 'move' ? 'Clica no novo local' : draft ? 'Clica de novo para reposicionar' : 'Clica no local do problema'}
          <button type="button" onClick={onCancelPlacing} className="ml-1 rounded-full p-0.5 hover:bg-primary-foreground/20" aria-label="Cancelar">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="absolute bottom-2 right-2 z-50 flex flex-col gap-1" onPointerDown={e => e.stopPropagation()}>
        <Button type="button" variant="outline" size="icon" className={btn} aria-label="Ampliar"
          onClick={() => zoomAt(1.5, center().x, center().y)}><Plus className="h-4 w-4" /></Button>
        <Button type="button" variant="outline" size="icon" className={btn} aria-label="Reduzir"
          onClick={() => zoomAt(1 / 1.5, center().x, center().y)}><Minus className="h-4 w-4" /></Button>
        <Button type="button" variant="outline" size="icon" className={btn} aria-label="Ver planta inteira"
          onClick={() => setView(home())}><Maximize2 className="h-4 w-4" /></Button>
      </div>

      <div className="pointer-events-none absolute bottom-2 left-2 z-40 hidden rounded bg-background/80 px-2 py-0.5 text-[10px] text-muted-foreground sm:block">
        Ctrl/⌘ + roda para ampliar · arrastar para mover
      </div>
    </div>
  );
}
