import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const canEdit = vi.fn();
vi.mock('@/contexts/PermissionsContext', () => ({ usePermissions: () => ({ canEdit }) }));
vi.mock('@/components/objetivos/ObjetivosVnPanel', () => ({ default: ({ editable }: { editable: boolean }) => <div>painel-vn:{String(editable)}</div> }));
vi.mock('@/components/objetivos/ObjetivosVuPanel', () => ({ default: ({ editable }: { editable: boolean }) => <div>painel-vu:{String(editable)}</div> }));

import ObjetivosPage from '@/pages/ObjetivosPage';
import { TABS, PERMISSION_TABS, ARCHIVED_TAB_KEYS } from '@/lib/permissions';

describe('tab único de Objetivos', () => {
  it('está na secção Transversal, fora do Arquivo, e é atribuível na matriz', () => {
    const t = TABS.find(x => x.key === 'objetivos');
    expect(t).toMatchObject({ area: 'apv', path: '/objetivos' });
    expect(ARCHIVED_TAB_KEYS).not.toContain('objetivos');
    expect(PERMISSION_TABS.some(x => x.key === 'objetivos')).toBe(true);
  });

  it('o tab VU antigo deixa de existir', () => {
    expect(TABS.some(x => x.key === 'objetivos-vu')).toBe(false);
  });

  it('VN e VU na mesma página, VN por defeito', () => {
    canEdit.mockReturnValue(true);
    render(<ObjetivosPage />);
    expect(screen.getByText('painel-vn:true')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Vendas VU' }));
    expect(screen.getByText('painel-vu:true')).toBeInTheDocument();
    expect(screen.queryByText(/painel-vn/)).toBeNull();
  });

  it('só edita quem tem edição no tab objetivos; os outros consultam', () => {
    canEdit.mockImplementation((k: string) => k === 'objetivos' ? false : true);
    render(<ObjetivosPage />);
    expect(screen.getByText('painel-vn:false')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Vendas VU' }));
    expect(screen.getByText('painel-vu:false')).toBeInTheDocument();
    expect(canEdit).toHaveBeenCalledWith('objetivos');
  });
});
