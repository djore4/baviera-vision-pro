/* ── Instalar a app (PWA) ─────────────────────────────────────────────────────
 * A faixa só aparece em telemóvel, depois do login (vive no AppLayout) e se a app
 * ainda não estiver instalada.
 *  - Android/Chrome: o browser dispara `beforeinstallprompt`; guarda-se o evento
 *    (captura-se no arranque, porque pode chegar antes de a interface montar) e
 *    abre-se o diálogo nativo ao tocar em "Instalar".
 *  - iPhone/iPad: o iOS não tem API de instalação; a faixa mostra as instruções.
 * "Agora não" volta a perguntar ao fim de 7 dias, no máximo 2 vezes.
 * ──────────────────────────────────────────────────────────────────────────── */

export type Plataforma = 'ios' | 'android' | null;

export interface EstadoInstalar { instalada?: boolean; n?: number; ts?: number }

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const CHAVE = 'app-instalar';
const SETE_DIAS = 7 * 24 * 3600 * 1000;
const MAX_PEDIDOS = 2;

export function plataformaMovel(ua: string, maxTouchPoints = 0): Plataforma {
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios';
  if (/Macintosh/.test(ua) && maxTouchPoints > 1) return 'ios'; // iPadOS
  if (/Android/.test(ua)) return 'android';
  return null;
}

export function appJaInstalada(): boolean {
  try { if (window.matchMedia?.('(display-mode: standalone)').matches) return true; } catch { /* ignora */ }
  return !!(navigator as Navigator & { standalone?: boolean }).standalone;
}

export function lerEstado(): EstadoInstalar {
  try { return JSON.parse(localStorage.getItem(CHAVE) ?? 'null') || {}; } catch { return {}; }
}

export function guardarEstado(e: EstadoInstalar) {
  try { localStorage.setItem(CHAVE, JSON.stringify(e)); } catch { /* ignora */ }
}

export function faixaDevida(e: EstadoInstalar, agora = Date.now()): boolean {
  if (e.instalada) return false;
  if (!e.n) return true;
  return e.n < MAX_PEDIDOS && agora - (e.ts ?? 0) > SETE_DIAS;
}

export function dispensar(agora = Date.now()) {
  guardarEstado({ n: (lerEstado().n ?? 0) + 1, ts: agora });
}

/* ── Evento do browser ───────────────────────────────────────────────────── */

let pedido: BeforeInstallPromptEvent | null = null;
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach(f => f());

export const temPedido = () => pedido !== null;

export function subscrever(f: () => void): () => void {
  ouvintes.add(f);
  return () => { ouvintes.delete(f); };
}

/* Chamar uma vez no arranque. */
export function capturarPedidoInstalacao() {
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    pedido = e as BeforeInstallPromptEvent;
    avisar();
  });
  window.addEventListener('appinstalled', () => {
    guardarEstado({ instalada: true });
    pedido = null;
    avisar();
  });
}

/* Abre o diálogo nativo. Devolve true se o utilizador aceitou. */
export async function instalar(): Promise<boolean> {
  if (!pedido) return false;
  const p = pedido;
  pedido = null;
  try {
    await p.prompt();
    const r = await p.userChoice;
    if (r.outcome === 'accepted') { guardarEstado({ instalada: true }); return true; }
    dispensar();
  } catch { /* ignora */ }
  return false;
}
