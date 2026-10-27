import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { canonicalLocal, locaisDoPerfil } from '@/lib/locations';
import { contractLocal, localPorOmissao } from '@/lib/eot';
import { LocaisPicker } from '@/components/users/LocaisPicker';

describe('Locais do grupo', () => {
  it.each([
    ['Aveiro', 'Aveiro'], ['aveiro', 'Aveiro'], ['Caetano Aveiro', 'Aveiro'], ['Baviera Aveiro 2', 'Aveiro'],
    ['V. N. Gaia', 'Gaia'], ['Vila Nova de Gaia', 'Gaia'], ['Santa Maria da Feira', 'Feira'], ['Caetano Feira', 'Feira'],
    ['Maia', 'Maia'], ['  PORTO ', 'Porto'],
  ])('%s → %s', (raw, nome) => expect(canonicalLocal(raw)).toBe(nome));

  it('o que não é do grupo dá null', () => {
    expect(canonicalLocal('Lisboa - M.G.Costa')).toBeNull();
    expect(canonicalLocal('')).toBeNull();
    expect(canonicalLocal(null)).toBeNull();
  });

  it('locais do perfil: canoniza, tira repetidos e ignora o que não é local', () => {
    expect(locaisDoPerfil(['aveiro', 'Caetano Aveiro', 'Porto', 'Lisboa'])).toEqual(['Aveiro', 'Porto']);
    expect(locaisDoPerfil('Gaia')).toEqual(['Gaia']);
    expect(locaisDoPerfil(null)).toEqual([]);
    expect(locaisDoPerfil({})).toEqual([]);
  });

  it('o local de um contrato usa o nome canónico; fora do grupo mantém a regra antiga', () => {
    expect(contractLocal({ concessionario_resp: 'Caetano Santa Maria da Feira', concessionario: null })).toBe('Feira');
    expect(contractLocal({ concessionario_resp: 'Caetano Baviera - Viseu', concessionario: null })).toBe('Viseu');
  });

  it('EoT: os locais do perfil mandam; vários → todos', () => {
    const c = (resp: string) => ({ concessionario_resp: resp, concessionario: resp });
    const contratos = [c('Caetano Porto'), c('Caetano Aveiro')];
    expect(localPorOmissao(contratos, [], 'v@x.pt', ['Maia'])).toBe('Maia');
    expect(localPorOmissao(contratos, [], 'v@x.pt', ['Maia', 'Gaia'])).toBe('all');
    expect(localPorOmissao([c('Caetano Porto')], [], 'v@x.pt', [])).toBe('Porto'); // sem perfil: cai nos contratos
  });
});

describe('LocaisPicker', () => {
  it('escolhe e limpa locais, pela ordem do grupo', () => {
    const onChange = vi.fn();
    render(<LocaisPicker value={['Aveiro']} onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'Locais' }).textContent).toContain('Aveiro');
    fireEvent.click(screen.getByRole('button', { name: 'Locais' }));
    fireEvent.click(screen.getByLabelText('Porto'));
    expect(onChange).toHaveBeenLastCalledWith(['Porto', 'Aveiro']); // ordem do grupo: Porto antes de Aveiro
    fireEvent.click(screen.getByText('Limpar (todos os locais)'));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('sem locais mostra "Todos os locais"', () => {
    render(<LocaisPicker value={[]} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Locais' }).textContent).toContain('Todos os locais');
  });
});
