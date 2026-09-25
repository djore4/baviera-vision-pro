import EscalaBoard, { type EscalaConfig } from '@/components/EscalaBoard';

/* Escala VN — equipa com Genius + vendedores. */
const VN_CONFIG: EscalaConfig = {
  storagePath: 'escala-teste.json',
  defaultTeam: [
    { id: 'JD', initials: 'JD', kind: 'PG' },
    { id: 'BR', initials: 'BR', kind: 'VEND' },
    { id: 'FS', initials: 'FS', kind: 'VEND' },
    { id: 'NC', initials: 'NC', kind: 'VEND' },
    { id: 'PM', initials: 'PM', kind: 'VEND' },
    { id: 'TS', initials: 'TS', kind: 'VEND' },
  ],
  typologies: ['Genius', 'STAND', 'APOIO', 'LIVRE', 'FOLGAS', 'FÉRIAS', 'FORMAÇÃO'],
  workTypologies: ['Genius', 'STAND', 'APOIO', 'LIVRE'],
  hasGenius: true,
  tabKey: 'escala',
  editableByAll: true, // na escala VN qualquer pessoa pode alterar
};

export default function EscalaPage() {
  return <EscalaBoard config={VN_CONFIG} />;
}
