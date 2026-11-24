import type { AccessLevel } from '@/lib/permissions';

/* ── Uma linha de permissão de um perfil, vista como uma pessoa a lê ──────────────
 * Por baixo há duas matrizes (modelo simples): "completo" (Aveiro e contas sem local) e "outros"
 * (Maia, Porto, Gaia, Feira). Na interface cada tab tem UM nível e um "Onde":
 *   todos  = vale nas duas;  aveiro = só em Aveiro (e sem local);  outros = só nos outros locais.
 * Estas funções convertem entre as duas formas sem perder nada: uma linha que ninguém toca
 * mantém exatamente os valores guardados. ────────────────────────────────────────────── */

export type Onde = 'todos' | 'aveiro' | 'outros';

const RANK: Record<AccessLevel, number> = { none: 0, view: 1, edit: 2 };
const max = (a: AccessLevel, b: AccessLevel): AccessLevel => (RANK[a] >= RANK[b] ? a : b);

export interface Linha {
  nivel: AccessLevel;
  /** Null quando não há acesso em lado nenhum. */
  onde: Onde | null;
  /** Níveis diferentes nas duas matrizes (herança de dados antigos): mostra-se o mais alto. */
  misto: boolean;
}

export function linhaDe(completo: AccessLevel, outros: AccessLevel): Linha {
  const c = completo !== 'none', o = outros !== 'none';
  return {
    nivel: max(completo, outros),
    onde: c && o ? 'todos' : c ? 'aveiro' : o ? 'outros' : null,
    misto: c && o && completo !== outros,
  };
}

/** Novo nível: mantém o "onde"; um tab sem acesso que passa a ter nível fica em todos os locais. */
export function comNivel(completo: AccessLevel, outros: AccessLevel, nivel: AccessLevel): [AccessLevel, AccessLevel] {
  if (nivel === 'none') return ['none', 'none'];
  const c = completo !== 'none', o = outros !== 'none';
  if (!c && !o) return [nivel, nivel];
  return [c ? nivel : 'none', o ? nivel : 'none'];
}

/** Novo "onde": mantém o nível (o mais alto das duas matrizes). */
export function comOnde(completo: AccessLevel, outros: AccessLevel, onde: Onde): [AccessLevel, AccessLevel] {
  const n = max(completo, outros);
  if (n === 'none') return ['none', 'none'];
  return [onde === 'outros' ? 'none' : n, onde === 'aveiro' ? 'none' : n];
}
