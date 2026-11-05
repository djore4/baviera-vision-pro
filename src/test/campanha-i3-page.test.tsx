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
let CRIAR = true;                       // pode criar negócios (editar Dados ou Database)
let EMAIL: string | null = 'admin@x.pt';
vi.mock('@/contexts/PermissionsContext', () => ({
  usePermissions: () => ({ isAdmin: ADMIN, canEdit: (k: string) => (k === 'campanha-i3' ? EDIT : CRIAR), effectiveEmail: EMAIL }),
}));
const openNew = vi.fn();
vi.mock('@/components/RecordEditor', () => ({ useRecordEditor: () => ({ openNew }) }));
vi.mock('@/contexts/DataContext', () => ({ useData: () => ({ data: { control: [{ resp: 'AN' }, { resp: 'RC' }] } }) }));
vi.mock('sonner', () => ({ toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() } }));

import CampanhaI3Page from '@/pages/CampanhaI3Page';

const hojeIsoStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// O Select do Radix precisa destas APIs do browser, que o jsdom não tem.
Element.prototype.scrollIntoView = vi.fn();
Element.prototype.hasPointerCapture = vi.fn(() => false);
Element.prototype.releasePointerCapture = vi.fn();

beforeEach(() => {
  assign.mockReset(); imp.mockReset(); upd.mockReset(); openNew.mockReset();
  ADMIN = true; EDIT = true; CRIAR = true; EMAIL = 'admin@x.pt';
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

describe('Campanha i3 — transformar em negócio quente', () => {
  const lead9 = () => mk('9', { nome: 'Maria Silva', owner_email: 'rui@x.pt', owner_nome: 'Rui Costa', estado: 'em_contacto', ponto_situacao: 'Ligou, quer test drive' });

  it('cada oportunidade tem o botão e abre o "Novo negócio" já preenchido como Quente', async () => {
    DB = [lead9(), mk('8')];
    render(<CampanhaI3Page />);
    await screen.findByText('Maria Silva');
    expect(screen.getAllByRole('button', { name: /^Negócio quente:/ })).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Negócio quente: Maria Silva' }));
    expect(openNew).toHaveBeenCalledTimes(1);
    const [preset] = openNew.mock.calls[0];
    expect(preset).toMatchObject({ status: 'Quente', type: 'VN', neg: hojeIsoStr(), id_cliente: 'Maria Silva', resp: 'RC' });
    expect(preset.obs).toContain('Origem: Campanha i3');
    expect(preset.obs).toContain('912345678');
    expect(preset.obs).toContain('Ponto de situação: Ligou, quer test drive');
    // Não abriu a ficha da oportunidade (o clique no botão não conta como clique na linha).
    expect(screen.queryByText('Acompanhamento')).toBeNull();
  });

  it('só depois de o negócio ser gravado fica o registo no ponto de situação', async () => {
    DB = [lead9()];
    upd.mockImplementation(async (_id: string, p: { ponto_situacao: string }) => ({ ...lead9(), ponto_situacao: p.ponto_situacao }));
    render(<CampanhaI3Page />);
    await screen.findByText('Maria Silva');
    fireEvent.click(screen.getByRole('button', { name: 'Negócio quente: Maria Silva' }));
    expect(upd).not.toHaveBeenCalled();                    // ainda só abriu o editor

    const onCreated = openNew.mock.calls[0][1] as () => void;
    onCreated();                                            // o editor gravou o negócio
    await waitFor(() => expect(upd).toHaveBeenCalledTimes(1));
    const [id, patch] = upd.mock.calls[0];
    expect(id).toBe('9');
    expect(patch.ponto_situacao).toContain('Ligou, quer test drive');
    expect(patch.ponto_situacao).toMatch(/Negócio quente criado a \d{2}\/\d{2}\/\d{4}\./);
  });

  it('na ficha da oportunidade também há o botão (e a ficha fecha-se antes de abrir o editor)', async () => {
    DB = [lead9()];
    render(<CampanhaI3Page />);
    fireEvent.click(await screen.findByText('Maria Silva'));
    fireEvent.click(await screen.findByRole('button', { name: /Transformar em negócio quente/ }));
    expect(openNew).toHaveBeenCalledTimes(1);
    expect(openNew.mock.calls[0][0]).toMatchObject({ status: 'Quente', id_cliente: 'Maria Silva' });
  });

  it('sem permissão para criar negócios o botão não aparece (nem na tabela nem na ficha)', async () => {
    CRIAR = false;
    DB = [lead9()];
    render(<CampanhaI3Page />);
    fireEvent.click(await screen.findByText('Maria Silva'));
    await screen.findByText('Acompanhamento');
    expect(screen.queryByRole('button', { name: /Negócio quente/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Transformar em negócio quente/ })).toBeNull();
  });
});
