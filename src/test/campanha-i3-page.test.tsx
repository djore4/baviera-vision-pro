import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import type { Lead } from '@/lib/campanha-i3';

/* Página Campanha i3 inteira, com os dados simulados (a segurança por vendedor é da RLS e
 * está testada em supabase/tests/campanha-i3.test.sql). */

const mk = (id: string, over: Partial<Lead> = {}): Lead => ({
  id, nome: `Lead ${id}`, email: `${id}@x.pt`, contacto: '912345678', data_contacto: '2026-10-28', polo: 'DCC - Aveiro',
  chave: `${id}@x.pt`, owner_email: null, owner_nome: null, atribuido_em: null, atribuido_por: null, estado: 'novo',
  ponto_situacao: null, observacoes: null, proximo_contacto: null, ultima_atualizacao: null, importado_por: null,
  created_at: '2026-10-28T10:00:00Z', updated_at: '2026-10-28T10:00:00Z', ...over,
});

let DB: Lead[] = [];
const assign = vi.fn();
const imp = vi.fn();
const upd = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/lib/campanha-i3', async (orig) => ({
  ...(await orig<typeof import('@/lib/campanha-i3')>()),
  listLeads: vi.fn(async () => DB),
  listVendedores: vi.fn(async () => [{ email: 'ana@x.pt', nome: 'Ana' }, { email: 'rui@x.pt', nome: 'Rui' }]),
  listHistorico: vi.fn(async () => []),
  assignLeads: (...a: unknown[]) => assign(...a),
  importLeads: (...a: unknown[]) => imp(...a),
  updateAcompanhamento: (...a: unknown[]) => upd(...a),
  exportLeads: vi.fn(),
}));

let ADMIN = true;
let EDIT = true;
let EMAIL: string | null = 'admin@x.pt';
vi.mock('@/contexts/PermissionsContext', () => ({
  usePermissions: () => ({ isAdmin: ADMIN, canEdit: () => EDIT, effectiveEmail: EMAIL }),
}));
vi.mock('sonner', () => ({ toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() } }));

import CampanhaI3Page from '@/pages/CampanhaI3Page';

const hojeIsoStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// O Select do Radix precisa destas APIs do browser, que o jsdom não tem.
Element.prototype.scrollIntoView = vi.fn();
Element.prototype.hasPointerCapture = vi.fn(() => false);
Element.prototype.releasePointerCapture = vi.fn();

beforeEach(() => {
  assign.mockReset(); imp.mockReset(); upd.mockReset();
  ADMIN = true; EDIT = true; EMAIL = 'admin@x.pt';
  DB = [
    mk('1'),
    mk('2'),
    mk('3', { owner_email: 'ana@x.pt', owner_nome: 'Ana', estado: 'em_contacto', ponto_situacao: 'Ligou, ficou de ver', proximo_contacto: '2000-01-01', ultima_atualizacao: hojeIsoStr() + 'T09:00:00' }),
    mk('4', { owner_email: 'rui@x.pt', owner_nome: 'Rui', estado: 'agendado' }),
    mk('5', { owner_email: 'rui@x.pt', owner_nome: 'Rui', estado: 'ganho' }),
  ];
});

const linhas = () => within(screen.getByTestId('lista-leads')).getAllByRole('row').slice(1);

describe('Campanha i3 — administrador', () => {
  it('lista as oportunidades em curso e os indicadores', async () => {
    render(<CampanhaI3Page />);
    await screen.findByText('Lead 1');
    expect(linhas()).toHaveLength(4);                      // ganha fica de fora por omissão
    expect(screen.queryByText('Lead 5')).toBeNull();
    expect(screen.getByRole('button', { name: /Por delegar/ })).toHaveTextContent('2');
    expect(screen.getByRole('button', { name: /Atrasadas/ })).toHaveTextContent('1');
    expect(screen.getByRole('button', { name: /Importar/ })).toBeInTheDocument();
  });

  it('o atalho "Por delegar" filtra as sem responsável', async () => {
    render(<CampanhaI3Page />);
    await screen.findByText('Lead 1');
    fireEvent.click(screen.getByRole('button', { name: /Por delegar/ }));
    await waitFor(() => expect(linhas()).toHaveLength(2));
    expect(screen.getByText('Lead 1')).toBeInTheDocument();
    expect(screen.queryByText('Lead 3')).toBeNull();
  });

  it('seleciona várias e delega-as numa só operação', async () => {
    assign.mockResolvedValue([mk('1', { owner_email: 'ana@x.pt', owner_nome: 'Ana' }), mk('2', { owner_email: 'ana@x.pt', owner_nome: 'Ana' })]);
    render(<CampanhaI3Page />);
    await screen.findByText('Lead 1');
    fireEvent.click(screen.getByLabelText('Selecionar Lead 1'));
    fireEvent.click(screen.getByLabelText('Selecionar Lead 2'));
    const barra = await screen.findByTestId('barra-lote');
    expect(barra).toHaveTextContent('2 selecionadas');
    fireEvent.click(within(barra).getByRole('combobox', { name: 'Delegar a' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Ana' }));
    await waitFor(() => expect(assign).toHaveBeenCalledTimes(1));
    expect(assign).toHaveBeenCalledWith(['1', '2'], { email: 'ana@x.pt', nome: 'Ana' });
    await waitFor(() => expect(screen.queryByTestId('barra-lote')).toBeNull());
  });

  it('mostra o resumo por vendedor', async () => {
    render(<CampanhaI3Page />);
    await screen.findByText('Lead 1');
    fireEvent.click(screen.getByRole('button', { name: /Por vendedor/ }));
    const tabela = await screen.findByTestId('resumo-vendedores');
    expect(within(tabela).getByText('Ana')).toBeInTheDocument();
    expect(within(tabela).getByText('Rui')).toBeInTheDocument();
  });

  it('importa a tabela colada: mostra novas/já existem e só envia as novas', async () => {
    imp.mockResolvedValue([mk('9', { nome: 'Novo Cliente', email: 'novo@x.pt' })]);
    DB = [mk('1', { nome: 'Tiago Gonçalves', email: 'imperyal@gmail.com', chave: 'imperyal@gmail.com' })];
    render(<CampanhaI3Page />);
    await screen.findByText('Tiago Gonçalves');
    fireEvent.click(screen.getByRole('button', { name: /Importar/ }));
    fireEvent.change(await screen.findByLabelText('Tabela colada'), { target: { value: [
      'Nome Entidade\tE-mail Entidade\tContacto Entidade\tData Contacto\tPolo',
      'Tiago Gonçalves\timperyal@gmail.com\t925344820\t29/10/2026\tDCC - Aveiro',
      'Novo Cliente\tnovo@x.pt\t966357533\t28/10/2026\tDCC - Aveiro',
    ].join('\n') } });
    const prev = await screen.findByTestId('import-preview');
    expect(prev).toHaveTextContent('1 nova');
    expect(prev).toHaveTextContent('1 já existe');
    fireEvent.click(screen.getByRole('button', { name: /^Importar 1$/ }));
    await waitFor(() => expect(imp).toHaveBeenCalledTimes(1));
    expect(imp.mock.calls[0][0]).toEqual([
      { nome: 'Novo Cliente', email: 'novo@x.pt', contacto: '966357533', data_contacto: '2026-10-28', polo: 'DCC - Aveiro' },
    ]);
    await screen.findByText('Novo Cliente');
  });

  it('abre a oportunidade e guarda ponto de situação e observações', async () => {
    upd.mockResolvedValue(mk('1', { ponto_situacao: 'Ligou', observacoes: 'Quer elétrico', estado: 'em_contacto' }));
    render(<CampanhaI3Page />);
    fireEvent.click(await screen.findByText('Lead 1'));
    fireEvent.change(await screen.findByLabelText('Ponto de situação'), { target: { value: 'Ligou' } });
    fireEvent.change(screen.getByLabelText('Observações'), { target: { value: 'Quer elétrico' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(upd).toHaveBeenCalledTimes(1));
    expect(upd).toHaveBeenCalledWith('1', expect.objectContaining({ ponto_situacao: 'Ligou', observacoes: 'Quer elétrico', estado: 'novo' }));
  });
});

describe('Campanha i3 — vendedor', () => {
  beforeEach(() => { ADMIN = false; EMAIL = 'ana@x.pt'; });

  it('vê só as suas e não tem importar, distribuir nem delegar', async () => {
    render(<CampanhaI3Page />);
    await screen.findByText('Lead 3');
    expect(screen.queryByText('Lead 1')).toBeNull();
    expect(screen.queryByText('Lead 4')).toBeNull();
    expect(screen.queryByRole('button', { name: /Importar/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Distribuir/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Por delegar/ })).toBeNull();
    expect(screen.queryByLabelText('Selecionar todas')).toBeNull();
  });

  it('regista o acompanhamento da sua oportunidade', async () => {
    upd.mockResolvedValue(mk('3'));
    render(<CampanhaI3Page />);
    fireEvent.click(await screen.findByText('Lead 3'));
    const ponto = await screen.findByLabelText('Ponto de situação');
    expect(ponto).toHaveValue('Ligou, ficou de ver');
    fireEvent.change(ponto, { target: { value: 'Test drive marcado' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(upd).toHaveBeenCalledWith('3', expect.objectContaining({ ponto_situacao: 'Test drive marcado' })));
    expect(screen.queryByLabelText('Nome')).toBeNull();   // dados do contacto: só o administrador
  });

  it('só com consulta (view) não pode guardar', async () => {
    EDIT = false;
    render(<CampanhaI3Page />);
    fireEvent.click(await screen.findByText('Lead 3'));
    expect(await screen.findByLabelText('Ponto de situação')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Guardar' })).toBeNull();
  });
});
