import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { nivelDaFuncao, type AppRole } from '@/lib/permissions';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/App', () => ({ useAuth: () => ({ session: null }) }));
vi.mock('@/contexts/DataContext', () => ({ useData: () => ({ error: null }) }));
vi.mock('@/contexts/ProspecContext', () => ({ useProspec: () => ({ overdue: 0 }) }));
vi.mock('@/contexts/PermissionsContext', () => ({ usePermissions: () => ({ canView: (t: string) => t === 'painel' || t === 'retails', isAdmin: false }) }));
vi.mock('@/components/NotificationBell', () => ({ NotificationBell: () => null }));
vi.mock('@/components/UserMenu', () => ({ UserMenu: () => null }));
vi.mock('@/components/ViewAsBanner', () => ({ ViewAsBanner: () => null }));
vi.mock('@/components/InstallBanner', () => ({ InstallBanner: () => null }));
vi.mock('@/components/CartaoGoReminder', () => ({ CartaoGoReminder: () => null }));
import { AppLayout } from '@/components/AppLayout';

describe('painel na navegação', () => {
  it('aparece na barra lateral a quem tem acesso', () => {
    render(<MemoryRouter><AppLayout>x</AppLayout></MemoryRouter>);
    expect(screen.getAllByText('DIÁRIO').length).toBeGreaterThan(0);
  });
  it('a matriz de Aveiro decide: sem a chave no local, sem acesso (mesmo que a base ou outro local a tenham)', () => {
    const role: AppRole = { name: 'Comercial', is_admin: false, permissions: { painel: 'view' },
      permissions_local: { Maia: { painel: 'view' }, Aveiro: { retails: 'edit' } } };
    expect(nivelDaFuncao(role, ['Aveiro'], 'painel')).toBe('none');
    expect(nivelDaFuncao(role, ['Maia'], 'painel')).toBe('view');
  });
});
