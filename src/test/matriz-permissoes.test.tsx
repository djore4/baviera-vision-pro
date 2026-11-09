/* Guarda da matriz de permissões (tab Utilizadores → Funções).
 *
 * Um tab que não aparece na matriz não se consegue atribuir a ninguém. Isto já aconteceu
 * (Multas, ao ficar `adminOnly`/arquivado), por isso:
 *  1. a lista de tabs FORA da matriz é fixa e tem de ser alterada aqui, de propósito;
 *  2. a matriz realmente renderizada mostra todos os restantes tabs, cada um na sua área.
 * Se este teste falhar ao mexer em permissions.ts, não é um falso alarme: confirma que o
 * tab deve mesmo deixar de ser atribuível antes de atualizar a lista. */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { AppRole } from '@/lib/permissions';

vi.mock('@/contexts/PermissionsContext', () => ({
  usePermissions: () => ({ capabilities: { lavagemGranular: true, eotGranular: true, eotResponsaveis: true, viaturasLocal: true } }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { RolesPanel } from '@/components/users/RolesPanel';
import { AREAS, TABS, PERMISSION_TABS } from '@/lib/permissions';

/* Tabs que NÃO se atribuem na matriz, por decisão (arrumados no Arquivo ou só de admin). */
const FORA_DA_MATRIZ_DE_PROPOSITO = ['comparativo', 'database', 'emprestimos', 'escala-repsol', 'logs', 'pendentes', 'prospecao'];

/* Tabs que TÊM de ser atribuíveis (pedido explícito do negócio): não podem sair da matriz. */
const OBRIGATORIOS_NA_MATRIZ = ['multas', 'marketing', 'objetivos', 'end-of-term', 'demos', 'lavagem'];

const roles: AppRole[] = [{ name: 'Comercial', is_admin: false, permissions: {} }];

describe('matriz de permissões', () => {
  it('só ficam fora da matriz os tabs listados de propósito', () => {
    const fora = TABS.filter(t => !PERMISSION_TABS.some(p => p.key === t.key)).map(t => t.key).sort();
    expect(fora).toEqual(FORA_DA_MATRIZ_DE_PROPOSITO);
  });

  it('os tabs obrigatórios estão sempre na matriz', () => {
    for (const k of OBRIGATORIOS_NA_MATRIZ) {
      expect(PERMISSION_TABS.some(t => t.key === k), `${k} saiu da matriz`).toBe(true);
    }
  });

  it('a matriz renderizada mostra cada tab na sua área (Multas em Vendas VN)', () => {
    render(<RolesPanel roles={roles} users={[]} loading={false} onSaved={async () => {}} />);
    fireEvent.click(screen.getAllByText('Comercial')[0]);
    for (const area of AREAS) {
      const tabs = PERMISSION_TABS.filter(t => t.area === area.key);
      if (tabs.length === 0) continue;
      const bloco = screen.getByRole('heading', { name: area.label, level: 4 }).closest('div.rounded-xl') as HTMLElement;
      expect(bloco, `área ${area.label}`).toBeTruthy();
      for (const t of tabs) {
        expect(within(bloco).getAllByText(t.label).length, `${t.label} em ${area.label}`).toBeGreaterThan(0);
      }
    }
    const vn = screen.getByRole('heading', { name: 'Vendas VN', level: 4 }).closest('div.rounded-xl') as HTMLElement;
    expect(within(vn).getByText('Multas')).toBeTruthy();
  });
});
