
/* ── Configuração por cliente ─────────────────────────────────────────────────
 * Cada instalação (projeto Vercel + projeto Supabase) serve um cliente,
 * escolhido no build por VITE_CLIENT. Tudo o que muda entre clientes — marca,
 * cores, tabs disponíveis — vive aqui, nunca espalhado pelo código.
 * ──────────────────────────────────────────────────────────────────────────── */

export interface FontFace {
  url: string;
  weight: number;
  format: 'woff2' | 'woff' | 'truetype';
}

export interface ClientConfig {
  /** Identificador usado em VITE_CLIENT e na pasta src/clients/<id>/. */
  id: string;
  /** Nome curto na barra lateral (ex.: "Caetano"). */
  name: string;
  /** Segunda palavra, destacada na cor da marca no ecrã de login (ex.: "BMW"). */
  nameAccent?: string;
  /** Linha de rodapé da barra lateral. */
  tagline: string;
  /** Título do separador do browser e das notificações. */
  title: string;
  /** Texto por baixo do nome no ecrã de login. */
  loginSubtitle: string;
  /** Identificação nos documentos impressos (ex.: escala). */
  documentHeader: string;
  logo: { src: string; alt: string };
  /** Cores da marca, como triplos HSL ("214 77% 47%"). */
  theme: { primary: string; dark: string };
  /** Tipo de letra próprio; sem ele usa-se Inter. */
  font?: { family: string; faces: FontFace[] };
  /** Tabs que não existem nesta instalação (nem para administradores). */
  disabledTabs: string[];
  /** Destinatários do pedido de matrícula (texto copiado para email). */
  matricula: { to: string[]; cc: string[] };
  /** TEMPORÁRIO. Exceções de acesso por email que passaram para a tabela
   *  app_access_exceptions; só se usam enquanto a função my_access_exceptions não
   *  existir na base de dados. Remover depois de aplicadas as migrações. */
  legacyTabAccessExceptions?: Record<string, Record<string, import('@/lib/permissions').AccessLevel>>;
}
