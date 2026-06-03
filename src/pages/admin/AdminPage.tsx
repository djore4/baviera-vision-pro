import { AdminLayout } from '@/components/AdminLayout';
import { useLocation } from 'react-router-dom';
import DatabaseTab from './DatabaseTab';
import DemosTab from './DemosTab';
import ObjetivosTab from './ObjetivosTab';

export default function AdminPage() {
  const { pathname } = useLocation();

  const content = () => {
    if (pathname === '/admin/database') return <DatabaseTab />;
    if (pathname === '/admin/demos') return <DemosTab />;
    if (pathname === '/admin/objetivos') return <ObjetivosTab />;
    return null;
  };

  return (
    <AdminLayout>
      {content()}
    </AdminLayout>
  );
}
