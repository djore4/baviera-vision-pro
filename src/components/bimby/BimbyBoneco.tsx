/* Bimby: boneco de cartão em SVG. `falando` abre/fecha a boca e faz o corpo abanar;
 * `boca` (0..1) controla a abertura da boca. Tudo CSS/SVG, sem imagens. */

interface Props { falando: boolean; aberta: boolean }

export function BimbyBoneco({ falando, aberta }: Props) {
  return (
    <svg
      viewBox="0 0 240 320"
      role="img"
      aria-label="Bimby, o boneco de cartão"
      className={`mx-auto h-72 w-auto drop-shadow-[6px_8px_0_rgba(0,0,0,0.18)] ${falando ? 'animate-bimby-fala' : 'animate-bimby-parado'}`}
      style={{ transformOrigin: '50% 100%' }}
    >
      <defs>
        <pattern id="bimby-onda" width="12" height="8" patternUnits="userSpaceOnUse">
          <path d="M0 4 Q3 0 6 4 T12 4" fill="none" stroke="#b07a3c" strokeWidth="1" opacity="0.45" />
        </pattern>
      </defs>

      {/* pernas */}
      <g stroke="#6b4423" strokeWidth="3" strokeLinejoin="round" fill="#d9a05b">
        <rect x="78" y="250" width="30" height="58" rx="3" />
        <rect x="132" y="250" width="30" height="58" rx="3" />
        <rect x="68" y="300" width="46" height="14" rx="5" fill="#c58a45" />
        <rect x="126" y="300" width="46" height="14" rx="5" fill="#c58a45" />
      </g>

      {/* braços (tiras de cartão presas com pioneses) */}
      <g stroke="#6b4423" strokeWidth="3" strokeLinejoin="round" fill="#d9a05b">
        <g className={falando ? 'animate-bimby-braco-e' : ''} style={{ transformOrigin: '62px 175px' }}>
          <rect x="22" y="170" width="46" height="16" rx="4" transform="rotate(-25 62 178)" />
          <circle cx="62" cy="178" r="5" fill="#ef4444" />
        </g>
        <g className={falando ? 'animate-bimby-braco-d' : ''} style={{ transformOrigin: '178px 175px' }}>
          <rect x="172" y="170" width="46" height="16" rx="4" transform="rotate(25 178 178)" />
          <circle cx="178" cy="178" r="5" fill="#ef4444" />
        </g>
      </g>

      {/* corpo */}
      <g stroke="#6b4423" strokeWidth="3" strokeLinejoin="round">
        <rect x="60" y="150" width="120" height="110" rx="6" fill="#e0a862" />
        <rect x="60" y="150" width="120" height="110" rx="6" fill="url(#bimby-onda)" stroke="none" />
        {/* gravata às bolinhas */}
        <path d="M120 156 l-14 14 l14 10 l14 -10 z" fill="#2563eb" />
        <path d="M120 180 l-12 52 l12 10 l12 -10 z" fill="#2563eb" />
        <circle cx="116" cy="200" r="2.5" fill="#fff" /><circle cx="124" cy="216" r="2.5" fill="#fff" />
        <circle cx="118" cy="230" r="2.5" fill="#fff" />
        {/* fita-cola */}
        <rect x="150" y="214" width="46" height="18" fill="#fde68a" opacity="0.8" stroke="#ca8a04" strokeWidth="1.5" transform="rotate(-18 173 223)" />
      </g>

      {/* cabeça */}
      <g stroke="#6b4423" strokeWidth="3" strokeLinejoin="round">
        <path d="M52 62 l8 -8 l10 6 l12 -8 l12 8 l12 -8 l12 8 l12 -8 l12 8 l12 -8 l10 6 l8 -4 v82 a8 8 0 0 1 -8 8 h-112 a8 8 0 0 1 -8 -8 z" fill="#e8b26c" />
        <path d="M52 62 l8 -8 l10 6 l12 -8 l12 8 l12 -8 l12 8 l12 -8 l12 8 l12 -8 l10 6 l8 -4 v82 a8 8 0 0 1 -8 8 h-112 a8 8 0 0 1 -8 -8 z" fill="url(#bimby-onda)" stroke="none" />
        {/* tufo de cabelo de cartão */}
        <path d="M112 54 q-6 -26 10 -30 q-2 12 14 8 q-10 8 -8 22" fill="#c58a45" />
      </g>

      {/* olhos esbugalhados */}
      <g stroke="#3b2412" strokeWidth="3">
        <circle cx="96" cy="95" r="19" fill="#fff" />
        <circle cx="146" cy="92" r="23" fill="#fff" />
        <g className={falando ? 'animate-bimby-olhos' : ''}>
          <circle cx="99" cy="97" r="7" fill="#111" stroke="none" />
          <circle cx="141" cy="95" r="9" fill="#111" stroke="none" />
        </g>
        {/* sobrancelhas à maluco */}
        <path d="M76 70 q18 -14 36 -2" fill="none" strokeLinecap="round" />
        <path d="M128 60 q20 -10 36 8" fill="none" strokeLinecap="round" />
      </g>

      {/* nariz */}
      <path d="M118 108 q-8 14 4 16" fill="none" stroke="#6b4423" strokeWidth="3" strokeLinecap="round" />

      {/* boca */}
      <g stroke="#3b2412" strokeWidth="3" strokeLinejoin="round">
        {aberta ? (
          <>
            <path d="M88 132 q32 40 64 0 z" fill="#7f1d1d" />
            <path d="M104 146 q16 14 32 0 q-16 -6 -32 0z" fill="#f87171" stroke="none" />
            <rect x="96" y="132" width="14" height="9" fill="#fff" />
            <rect x="130" y="132" width="14" height="9" fill="#fff" />
          </>
        ) : (
          <path d="M92 134 q28 12 56 -2" fill="none" strokeLinecap="round" />
        )}
      </g>

      {/* bochechas */}
      <circle cx="78" cy="122" r="7" fill="#f87171" opacity="0.5" />
      <circle cx="164" cy="122" r="7" fill="#f87171" opacity="0.5" />
    </svg>
  );
}
