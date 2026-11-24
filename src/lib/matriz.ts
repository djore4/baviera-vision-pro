import type { AccessLevel, Matriz } from '@/lib/permissions';

/* ── Operações puras sobre a matriz Perfil → Local → Equipa → Tab ─────────────────────────── */

const RANK: Record<AccessLevel, number> = { none: 0, view: 1, edit: 2 };

/** Sem acesso → consulta → edição → sem acesso. */
export const proximoNivel = (v: AccessLevel): AccessLevel => (v === 'none' ? 'view' : v === 'view' ? 'edit' : 'none');

export const nivelDe = (m: Matriz | undefined, local: string, equipa: string, tab: string): AccessLevel =>
  m?.[local]?.[equipa]?.[tab] ?? 'none';

/** Nova matriz com o nível de várias células (local × equipa × tab). 'none' apaga a célula. */
export function definir(m: Matriz, locais: readonly string[], equipas: readonly string[], tabs: readonly string[], valor: AccessLevel): Matriz {
  const out: Matriz = { ...m };
  for (const l of locais) {
    const porEquipa = { ...(out[l] ?? {}) };
    for (const e of equipas) {
      const tabsDe = { ...(porEquipa[e] ?? {}) };
      for (const t of tabs) { if (valor === 'none') delete tabsDe[t]; else tabsDe[t] = valor; }
      if (Object.keys(tabsDe).length) porEquipa[e] = tabsDe; else delete porEquipa[e];
    }
    if (Object.keys(porEquipa).length) out[l] = porEquipa; else delete out[l];
  }
  return out;
}

/** Copia todas as células de um local (com as suas equipas) para outro. */
export function copiarLocal(m: Matriz, de: string, para: string): Matriz {
  const out: Matriz = { ...m };
  if (m[de] && Object.keys(m[de]).length) out[para] = JSON.parse(JSON.stringify(m[de])); else delete out[para];
  return out;
}

/** Só níveis view/edit, sem equipas nem locais vazios (forma em que se compara e se grava). */
export function limpa(m: Matriz | undefined): Matriz {
  const out: Matriz = {};
  Object.entries(m ?? {}).forEach(([l, porEquipa]) => Object.entries(porEquipa ?? {}).forEach(([e, tabs]) => {
    const t = Object.fromEntries(Object.entries(tabs ?? {}).filter(([, v]) => v === 'view' || v === 'edit')) as Record<string, AccessLevel>;
    if (Object.keys(t).length) ((out[l] ??= {})[e] = t);
  }));
  return out;
}

export const iguais = (a: Matriz | undefined, b: Matriz | undefined) => JSON.stringify(ordena(limpa(a))) === JSON.stringify(ordena(limpa(b)));

function ordena<T>(v: T): T {
  if (Array.isArray(v) || v === null || typeof v !== 'object') return v;
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([x], [y]) => x.localeCompare(y)).map(([k, x]) => [k, ordena(x)])) as T;
}

/** O nível mais alto que o tab tem em alguma célula (para o resumo de cada linha). */
export const nivelMaximo = (m: Matriz | undefined, tab: string): AccessLevel => {
  let best: AccessLevel = 'none';
  Object.values(m ?? {}).forEach(pe => Object.values(pe ?? {}).forEach(t => { const v = t?.[tab] ?? 'none'; if (RANK[v] > RANK[best]) best = v; }));
  return best;
};
