import { Navigate } from 'react-router-dom';
import { usePermissions } from '@/contexts/PermissionsContext';

/* Abertura da aplicação: quem tem acesso ao Painel começa por aí; os restantes
 * seguem para o WIP, como sempre (RequireTab encaminha se também não houver acesso). */
const Index = () => {
  const { canView } = usePermissions();
  return <Navigate to={canView('painel') ? '/painel' : '/retails'} replace />;
};
export default Index;
