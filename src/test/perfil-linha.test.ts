import { describe, it, expect } from 'vitest';
import { linhaDe, comNivel, comOnde } from '@/lib/perfil-linha';

describe('linha de permissão (nível + onde)', () => {
  it('lê as duas matrizes como um nível e um "onde"', () => {
    expect(linhaDe('edit', 'edit')).toEqual({ nivel: 'edit', onde: 'todos', misto: false });
    expect(linhaDe('view', 'none')).toEqual({ nivel: 'view', onde: 'aveiro', misto: false });
    expect(linhaDe('none', 'edit')).toEqual({ nivel: 'edit', onde: 'outros', misto: false });
    expect(linhaDe('none', 'none')).toEqual({ nivel: 'none', onde: null, misto: false });
    expect(linhaDe('view', 'edit')).toEqual({ nivel: 'edit', onde: 'todos', misto: true });
  });
  it('mudar o nível mantém o onde; sem acesso passa a todos os locais', () => {
    expect(comNivel('view', 'none', 'edit')).toEqual(['edit', 'none']);
    expect(comNivel('none', 'view', 'edit')).toEqual(['none', 'edit']);
    expect(comNivel('view', 'view', 'edit')).toEqual(['edit', 'edit']);
    expect(comNivel('none', 'none', 'view')).toEqual(['view', 'view']);
    expect(comNivel('edit', 'view', 'none')).toEqual(['none', 'none']);
  });
  it('mudar o onde mantém o nível', () => {
    expect(comOnde('view', 'view', 'aveiro')).toEqual(['view', 'none']);
    expect(comOnde('view', 'none', 'outros')).toEqual(['none', 'view']);
    expect(comOnde('none', 'edit', 'todos')).toEqual(['edit', 'edit']);
    expect(comOnde('none', 'none', 'todos')).toEqual(['none', 'none']);
  });
});
