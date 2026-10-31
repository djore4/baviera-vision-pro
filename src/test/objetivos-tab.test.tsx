import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const canEdit = vi.fn();
vi.mock('@/contexts/PermissionsContext', () => ({ usePermissions: () => ({ canEdit }) }));
vi.mock('@/components/objetivos/ObjetivosVnPanel', () => ({ default: ({ editable }: { editable: boolean }) => <div>painel-vn:{String(editable)}</div> }));
vi.mock('@/components/objetivos/ObjetivosVuPanel', () => ({ default: ({ editable }: { editable: boolean }) => <div>painel-vu:{String(editable)}</div> }));

import ObjetivosPage, { OBJETIVOS_AREAS } from '@/pages/ObjetivosPage';
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

describe('Objetivos — áreas', () => {
  it('Vendas VN, Vendas VU, Motorrad VN, Motorrad VU, Finance e APV, por esta ordem', () => {
    expect(OBJETIVOS_AREAS.map(a => a.label)).toEqual([
      'Vendas VN', 'Vendas VU', 'Vendas Motorrad VN', 'Vendas Motorrad VU', 'Finance', 'APV',
    ]);
  });

  it('as novas áreas estão assinaladas em desenvolvimento e mostram o aviso', () => {
    canEdit.mockReturnValue(true);
    render(<ObjetivosPage />);
    expect(screen.getAllByText('em desenvolvimento')).toHaveLength(4);
    ['Vendas Motorrad VN', 'Vendas Motorrad VU', 'Finance', 'APV'].forEach(nome => {
      fireEvent.click(screen.getByRole('tab', { name: new RegExp(`^${nome}`) }));
      expect(screen.getByRole('status')).toHaveTextContent(`${nome}`);
      expect(screen.getByRole('status')).toHaveTextContent(/em desenvolvimento/i);
      expect(screen.queryByText(/painel-v[nu]/)).toBeNull();
    });
  });

  it('VN e VU continuam sem aviso de desenvolvimento', () => {
    canEdit.mockReturnValue(true);
    render(<ObjetivosPage />);
    expect(screen.queryByRole('status')).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Vendas VU' }));
    expect(screen.queryByRole('status')).toBeNull();
  });
});
