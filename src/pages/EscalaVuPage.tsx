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
  tabKey: 'escala-vu', // só edita quem tem 'edit' neste tab (chefe de vendas VU)
  horario: [
    'Stand: 9h – 12:30h e 14:00h – 19:00h',
    'Apoio: 9h – 12:30h e 14:00h – 18:00h',
    'Sábado: 09:30h – 12:30h e 14:00h – 19:00h*',
    '*Salvo exceções a comunicar',
  ],
};

export default function EscalaVuPage() {
  return <EscalaBoard config={VU_CONFIG} />;
}
