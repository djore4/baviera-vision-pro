import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import type { EotContract, EotOwner, EotVendedorMapRow } from '@/lib/eot';
import { eotIsDirector, eotIsLocalLead } from '@/lib/eot-access';

const lib = vi.hoisted(() => ({
  addEotVendedorMap: vi.fn(async () => {}),
  removeEotVendedorMap: vi.fn(async () => {}),
  saveEotOwner: vi.fn(async () => {}),
  deleteEotOwner: vi.fn(async () => {}),
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/permissions', () => ({
  listUsers: vi.fn(async () => [
    { id: 1, nome: 'Rui Duarte', email: 'rui@x.pt' }, { id: 2, nome: 'Ana Sousa', email: 'ana@x.pt' },
  ]),
}));
vi.mock('@/lib/eot', async importOriginal => ({ ...(await importOriginal<typeof import('@/lib/eot')>()), ...lib }));

import { normVendedor, suggestOwners, groupOwnersFor, contractLocal } from '@/lib/eot';
import { OwnersPanel } from '@/components/eot/OwnersPanel';

const owner = (iniciais: string, email: string, locais: string[], chefe_email: string | null = null): EotOwner =>
  ({ email, iniciais, locais, chefe_email, nome: `${iniciais} · ${email.split('@')[0]}` });
const CHEFE = owner('CH', 'chefe@x.pt', ['Aveiro']);
const RD = owner('RD', 'rd@x.pt', ['Aveiro'], 'chefe@x.pt');
const RD2 = owner('RX', 'rd2@x.pt', ['Viseu'], 'outro@x.pt');
const AN = owner('AN', 'an@x.pt', ['Aveiro'], 'chefe@x.pt');
const contract = (vendedor: string, resp = 'Caetano Aveiro', extra: Partial<EotContract> = {}) =>
  ({ contrato: `C-${vendedor}-${resp}`, vendedor, concessionario_resp: resp, concessionario: resp, owner_email: null, owner_nome: null, ...extra }) as EotContract;
const map = (raw: string, email: string): EotVendedorMapRow => ({ raw_norm: normVendedor(raw), owner_email: email, raw_exemplo: raw });

describe('normVendedor', () => {
  it('ignora acentos, pontos, maiúsculas e espaços a mais', () => {
    expect(normVendedor('Rui M. Duarte')).toBe('RUI M DUARTE');
    expect(normVendedor('  rui   m  DUARTE ')).toBe('RUI M DUARTE');
    expect(normVendedor('João  Conceição')).toBe('JOAO CONCEICAO');
  });
  it('vazio e nulo dão chave vazia', () => {
    expect(normVendedor(null)).toBe('');
    expect(normVendedor('  . ')).toBe('');
  });
});

describe('suggestOwners', () => {
  it('sugere o responsável mapeado, apesar de o nome vir escrito de outra forma', () => {
    const m = [map('Rui M. Duarte', 'rd@x.pt')];
    expect(suggestOwners(contract('RUI  M DUARTE'), [RD, AN], m).map(o => o.email)).toEqual(['rd@x.pt']);
  });
  it('sem mapeamento ou sem nome não sugere nada', () => {
    expect(suggestOwners(contract('Outro'), [RD], [map('Rui', 'rd@x.pt')])).toEqual([]);
    expect(suggestOwners(contract(''), [RD], [map('Rui', 'rd@x.pt')])).toEqual([]);
  });
  it('mapeamento para quem já não é responsável é ignorado', () => {
    expect(suggestOwners(contract('Rui'), [AN], [map('Rui', 'rd@x.pt')])).toEqual([]);
  });
  it('homónimos: prefere o responsável do local do contrato', () => {
    const m = [map('Rui', 'rd@x.pt'), map('Rui', 'rd2@x.pt')];
    expect(suggestOwners(contract('Rui', 'Caetano Viseu'), [RD, RD2], m).map(o => o.email)).toEqual(['rd2@x.pt']);
    expect(suggestOwners(contract('Rui', 'Baviera Aveiro 2'), [RD, RD2], m).map(o => o.email)).toEqual(['rd@x.pt']);
  });
  it('homónimos sem ninguém no local: mostra todos', () => {
    const m = [map('Rui', 'rd@x.pt'), map('Rui', 'rd2@x.pt')];
    expect(suggestOwners(contract('Rui', 'Caetano Porto'), [RD, RD2], m)).toHaveLength(2);
  });
});

describe('groupOwnersFor', () => {
  it('separa sugeridos, do local e outros, sem repetir ninguém', () => {
    const g = groupOwnersFor(contract('Rui', 'Caetano Aveiro'), [RD, AN, RD2], [map('Rui', 'rd@x.pt')]);
    expect(g.sugeridos.map(o => o.iniciais)).toEqual(['RD']);
    expect(g.doLocal.map(o => o.iniciais)).toEqual(['AN']);
    expect(g.outros.map(o => o.iniciais)).toEqual(['RX']);
  });
});

describe('eotIsLocalLead', () => {
  const caps = { lavagemGranular: true, eotGranular: true, eotResponsaveis: true };
  const can = (perms: string[], isAdmin = false) => (t: string) => isAdmin || perms.includes(t);
  it('é chefe local com a permissão e a migração aplicada', () => {
    expect(eotIsLocalLead({ isAdmin: false, roleName: 'X', capabilities: caps, canView: can(['end-of-term:local']) })).toBe(true);
  });
  it('sem a migração (capacidade) a permissão não conta', () => {
    expect(eotIsLocalLead({ isAdmin: false, roleName: 'X', capabilities: { ...caps, eotResponsaveis: false }, canView: can(['end-of-term:local']) })).toBe(false);
  });
  it('quem já vê tudo não é chefe local; o vendedor também não', () => {
    expect(eotIsLocalLead({ isAdmin: true, roleName: null, capabilities: caps, canView: can([], true) })).toBe(false);
    expect(eotIsLocalLead({ isAdmin: false, roleName: 'X', capabilities: caps, canView: can(['end-of-term:todos', 'end-of-term:local']) })).toBe(false);
    expect(eotIsLocalLead({ isAdmin: false, roleName: 'X', capabilities: caps, canView: can([]) })).toBe(false);
    expect(eotIsDirector({ isAdmin: false, roleName: 'X', capabilities: caps, canView: can(['end-of-term:local']) })).toBe(false);
  });
});

describe('contractLocal', () => {
  it.each([
    ['Baviera Aveiro 2', 'Aveiro'], ['Caetano Aveiro', 'Aveiro'], ['Caetano Baviera - Viseu', 'Viseu'],
    ['Lisboa - M.G.Costa', 'Lisboa'], ['V. N. Gaia', 'Gaia'], ['Caetano', 'Caetano'],
  ])('%s → %s', (resp, local) => {
    expect(contractLocal({ concessionario_resp: resp, concessionario: null })).toBe(local);
  });
  it('sem resp usa o concessionário; vazio dá —', () => {
    expect(contractLocal({ concessionario_resp: null, concessionario: 'Caetano Porto' })).toBe('Porto');
    expect(contractLocal({ concessionario_resp: '  ', concessionario: '' })).toBe('—');
  });
});

describe('OwnersPanel', () => {
  // O Select do Radix precisa destas APIs do browser, que o jsdom não tem.
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
  const contracts = [
    contract('Rui M. Duarte', 'Caetano Aveiro', { contrato: '1' }),
    contract('RUI M DUARTE', 'Caetano Aveiro', { contrato: '2', owner_email: 'rd@x.pt' }),
    contract('Ana S.', 'Caetano Viseu', { contrato: '3' }),
  ];
  const onChanged = vi.fn();
  beforeEach(() => { Object.values(lib).forEach(f => f.mockClear()); onChanged.mockClear(); });

  const panel = (lead: string | null = null, m: EotVendedorMapRow[] = []) =>
    render(<OwnersPanel contracts={contracts} owners={[CHEFE, RD, AN, RD2]} ownerMap={m} leadEmail={lead} onChanged={onChanged} />);

  it('agrupa as grafias do mesmo nome e conta contratos e os sem responsável', () => {
    panel();
    const row = screen.getByText('Rui M. Duarte').closest('tr')!;
    expect(within(row).getByText('2')).toBeInTheDocument();   // 2 contratos
    expect(within(row).getByText('1')).toBeInTheDocument();   // 1 sem responsável
  });

  it('por omissão mostra só os nomes por mapear', () => {
    panel(null, [map('Rui M. Duarte', 'rd@x.pt')]);
    expect(screen.queryByText('Rui M. Duarte')).not.toBeInTheDocument();
    expect(screen.getByText('Ana S.')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/Só por mapear/));
    expect(screen.getByText('Rui M. Duarte')).toBeInTheDocument();
  });

  it('remove um mapeamento', async () => {
    panel(null, [map('Rui M. Duarte', 'rd@x.pt')]);
    fireEvent.click(screen.getByLabelText(/Só por mapear/));
    fireEvent.click(screen.getByLabelText('Remover RD de Rui M. Duarte'));
    await waitFor(() => expect(lib.removeEotVendedorMap).toHaveBeenCalledWith('RUI M DUARTE', 'rd@x.pt'));
    expect(onChanged).toHaveBeenCalled();
  });

  it('o chefe de equipa só edita a sua equipa: não a sua ficha, nem outros chefes, nem outras equipas', () => {
    panel('chefe@x.pt');
    expect(screen.getByLabelText('Editar RD')).toBeInTheDocument();
    expect(screen.getByLabelText('Editar AN')).toBeInTheDocument();
    expect(screen.queryByLabelText('Editar CH')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Editar RX')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Remover RX')).not.toBeInTheDocument();
  });

  it('quem gere tudo edita qualquer responsável e escolhe o chefe; o chefe não vê essa escolha', async () => {
    const { unmount } = panel(null);
    expect(screen.getByLabelText('Editar CH')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Editar RX'));
    expect(await screen.findByText('Chefe de equipa', { selector: 'label' })).toBeInTheDocument();
    unmount();
    panel('chefe@x.pt');
    fireEvent.click(screen.getByLabelText('Editar RD'));
    await screen.findByLabelText('Iniciais');
    expect(screen.queryByText('Chefe de equipa', { selector: 'label' })).not.toBeInTheDocument();
  });

  it('adiciona um responsável: utilizador existente, iniciais sugeridas e local', async () => {
    panel();
    fireEvent.click(screen.getByText('Adicionar responsável'));
    await screen.findByText('Escolher utilizador…');   // a lista de utilizadores já carregou
    fireEvent.keyDown(screen.getAllByRole('combobox')[0], { key: 'ArrowDown' });
    fireEvent.click(await screen.findByRole('option', { name: /Ana Sousa/ }));
    expect((screen.getByLabelText('Iniciais') as HTMLInputElement).value).toBe('AS');
    fireEvent.click(screen.getByRole('button', { name: 'Viseu' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(lib.saveEotOwner).toHaveBeenCalledWith({ email: 'ana@x.pt', iniciais: 'AS', locais: ['Viseu'], chefe_email: null }));
  });

  it('o chefe de equipa acrescenta alguém: fica sempre na sua equipa', async () => {
    panel('chefe@x.pt');
    fireEvent.click(screen.getByText('Adicionar responsável'));
    await screen.findByText('Escolher utilizador…');   // a lista de utilizadores já carregou
    fireEvent.keyDown(screen.getAllByRole('combobox')[0], { key: 'ArrowDown' });
    fireEvent.click(await screen.findByRole('option', { name: /Ana Sousa/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(lib.saveEotOwner).toHaveBeenCalledWith({ email: 'ana@x.pt', iniciais: 'AS', locais: [], chefe_email: 'chefe@x.pt' }));
  });
});
