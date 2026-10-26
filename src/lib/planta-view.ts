/* Vista (zoom + deslocamento) da planta. */
export const MIN_SCALE = 1;
export const MAX_SCALE = 8;

export interface View { s: number; tx: number; ty: number }

/** Mantém a planta (w×h, já escalada por `s`) sobre a área visível cw×ch, e
 *  centrada quando cabe inteira. */
export function clampView(v: View, cw: number, ch: number, w: number, h: number): View {
  const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.s));
  const sw = w * s, sh = h * s;
  const tx = sw <= cw ? (cw - sw) / 2 : Math.min(0, Math.max(cw - sw, v.tx));
  const ty = sh <= ch ? (ch - sh) / 2 : Math.min(0, Math.max(ch - sh, v.ty));
  return { s, tx, ty };
}
