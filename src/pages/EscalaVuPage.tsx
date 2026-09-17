import EscalaBoard, { type EscalaConfig } from '@/components/EscalaBoard';

/* Escala VU — igual à VN, mas sem coluna Genius e com a equipa AL / RD / MP. */
const VU_CONFIG: EscalaConfig = {
  storagePath: 'escala-vu.json',
  defaultTeam: [
    { id: 'AL', initials: 'AL', kind: 'VEND' },
    { id: 'RD', initials: 'RD', kind: 'VEND' },
    { id: 'MP', initials: 'MP', kind: 'VEND' },
  ],
  typologies: ['STAND', 'APOIO', 'LIVRE', 'FOLGAS', 'FÉRIAS', 'FORMAÇÃO'],
  workTypologies: ['STAND', 'APOIO', 'LIVRE'],
  hasGenius: false,
};

export default function EscalaVuPage() {
  return <EscalaBoard config={VU_CONFIG} />;
}
