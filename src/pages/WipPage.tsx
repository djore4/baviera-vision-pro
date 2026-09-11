import { ClipboardList } from 'lucide-react';
import { PlaceholderPage } from '@/components/PlaceholderPage';

export default function WipPage() {
  return (
    <PlaceholderPage
      title="WIP"
      icon={ClipboardList}
      description="Acompanhamento do trabalho em curso de Viaturas Usadas. Funcionalidade a desenvolver."
    />
  );
}
