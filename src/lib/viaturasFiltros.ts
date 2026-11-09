/* Filtros da gestão do parque (como na "Gestão VD" da Sales Force): Concessão, Tipo, Marca e pesquisa,
 * cada um de escolha única com "Todas/Todos". */

export const TIPOS_NEGOCIO = ['VD', 'VU'] as const;
export const MARCAS = ['BMW', 'BMW Motorrad'] as const;
export type TipoNegocio = (typeof TIPOS_NEGOCIO)[number];

/** É VU só com estado_negocio 'VU'; tudo o resto conta como VD (regra da Sales Force). */
export const tipoNegocio = (estado: string | null | undefined): TipoNegocio => (estado === 'VU' ? 'VU' : 'VD');

/** Marcas da viatura; sem marca definida conta como BMW. */
export const marcasDe = (marcas: string[]): string[] => {
  const m = marcas.map(x => x.trim()).filter(Boolean);
  return m.length ? m : ['BMW'];
};

export const TODAS = 'Todas';
export const TODOS = 'Todos';

/** Opções de uma linha de filtro: as conhecidas (por ordem) e as que aparecem nos dados. */
export const opcoesFiltro = (conhecidas: readonly string[], presentes: Iterable<string>): string[] => {
  const extra = [...new Set(presentes)].filter(x => x && !conhecidas.includes(x)).sort();
  return [...conhecidas, ...extra];
};

/** Concessão inicial: a do perfil se for só uma; com várias (ou nenhuma) mostra todas. */
export const concessaoInicial = (locaisDoPerfil: string[]): string => (locaisDoPerfil.length === 1 ? locaisDoPerfil[0] : TODAS);
