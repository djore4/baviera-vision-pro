import { describe, it, expect } from 'vitest';
import {
  agruparPorMes, agruparPorVendedor, estadoDe, formatarIntervalo, highlightsDeTexto, linkWhatsApp, agendaComHoje, contagemDias,
  urlAbrirMapa, urlMapaEmbed, urlRota, resumoConvidados, resumoOrcamento, telefoneWhatsApp, textoConvite, textoRelativo,
  type Convidado,
} from '@/lib/marketing';
import { validarDocumento, validarImagem, descreverViatura } from '@/lib/marketing-data';

const ev = (id: string, inicio: string, fim?: string) => ({ id, titulo: id, inicio, fim: fim ?? null });

describe('linha do tempo', () => {
  it('estado face a hoje', () => {
    expect(estadoDe(ev('a', '2027-01-01'), '2027-01-02')).toBe('passado');
    expect(estadoDe(ev('a', '2027-01-01', '2027-01-05'), '2027-01-03')).toBe('a-decorrer');
    expect(estadoDe(ev('a', '2027-01-03'), '2027-01-03')).toBe('a-decorrer');
    expect(estadoDe(ev('a', '2027-01-10'), '2027-01-03')).toBe('futuro');
  });
  it('agrupa por mês, ordenado', () => {
    const g = agruparPorMes([ev('b', '2027-02-01'), ev('a', '2026-12-30'), ev('c', '2027-02-20')]);
    expect(g.map(x => x.key)).toEqual(['2026-12', '2027-02']);
    expect(g[0].label).toBe('Dezembro 2026');
    expect(g[1].eventos.map(e => e.id)).toEqual(['b', 'c']);
  });
  it('formata intervalos e texto relativo', () => {
    expect(formatarIntervalo({ inicio: '2026-12-05' })).toBe('5 dez');
    expect(formatarIntervalo({ inicio: '2026-12-05', fim: '2026-12-06' })).toBe('5–6 dez');
    expect(formatarIntervalo({ inicio: '2026-11-28', fim: '2026-12-02' })).toBe('28 nov – 2 dez');
    expect(textoRelativo(ev('a', '2027-01-04'), '2027-01-03')).toBe('Amanhã');
    expect(textoRelativo(ev('a', '2027-01-23'), '2027-01-03')).toBe('Em 20 dias');
    expect(textoRelativo(ev('a', '2027-01-01', '2027-01-09'), '2027-01-03')).toBe('A decorrer');
    expect(textoRelativo(ev('a', '2027-01-01'), '2027-01-04')).toBe('Há 3 dias');
  });
  it('"Hoje" fica antes de todos os eventos quando eles são todos futuros', () => {
    const g = agendaComHoje([ev('a', '2027-01-20'), ev('b', '2027-02-10')], '2027-01-05');
    expect(g.map(x => x.key)).toEqual(['2027-01', '2027-02']);
    expect(g[0].itens.map(i => (i.tipo === 'hoje' ? 'HOJE' : i.evento.id))).toEqual(['HOJE', 'a']);
  });
  it('"Hoje" fica entre os eventos, na ordem do calendário', () => {
    const g = agendaComHoje([ev('a', '2027-01-02'), ev('b', '2027-01-20'), ev('c', '2027-01-05', '2027-01-30')], '2027-01-10');
    expect(g[0].itens.map(i => (i.tipo === 'hoje' ? 'HOJE' : i.evento.id))).toEqual(['a', 'c', 'HOJE', 'b']);
  });
  it('um evento que começa hoje fica logo a seguir ao "Hoje"', () => {
    const g = agendaComHoje([ev('a', '2027-01-10')], '2027-01-10');
    expect(g[0].itens.map(i => (i.tipo === 'hoje' ? 'HOJE' : i.evento.id))).toEqual(['HOJE', 'a']);
  });
  it('o mês de hoje existe sempre: sem eventos nele, ou depois do último evento', () => {
    const futuro = agendaComHoje([ev('a', '2027-03-01')], '2027-01-10');
    expect(futuro.map(x => x.key)).toEqual(['2027-01', '2027-03']);
    expect(futuro[0].itens).toEqual([{ tipo: 'hoje' }]);
    const passado = agendaComHoje([ev('a', '2026-12-01')], '2027-01-10');
    expect(passado.map(x => x.key)).toEqual(['2026-12', '2027-01']);
    expect(passado[1].itens).toEqual([{ tipo: 'hoje' }]);
    expect(agendaComHoje([], '2027-01-10')).toHaveLength(1);
  });
  it('contagem de dias: faltam, urgência, a decorrer e passados', () => {
    expect(contagemDias(ev('a', '2027-01-20'), '2027-01-10')).toEqual({ topo: 'Faltam', valor: '10', rotulo: 'dias', tom: 'breve' });
    expect(contagemDias(ev('a', '2027-01-11'), '2027-01-10')).toEqual({ topo: 'Falta', valor: '1', rotulo: 'dia', tom: 'urgente' });
    expect(contagemDias(ev('a', '2027-01-17'), '2027-01-10').tom).toBe('urgente');
    expect(contagemDias(ev('a', '2027-02-09'), '2027-01-10').tom).toBe('breve');
    expect(contagemDias(ev('a', '2027-02-10'), '2027-01-10').tom).toBe('normal');
    expect(contagemDias(ev('a', '2027-01-10'), '2027-01-10')).toEqual({ topo: 'Começa', valor: 'hoje', rotulo: '', tom: 'agora' });
    expect(contagemDias(ev('a', '2027-01-08', '2027-01-12'), '2027-01-10')).toEqual({ topo: 'A decorrer', valor: '2', rotulo: 'dias restantes', tom: 'agora' });
    expect(contagemDias(ev('a', '2027-01-08', '2027-01-10'), '2027-01-10')).toMatchObject({ valor: 'último', rotulo: 'dia' });
    expect(contagemDias(ev('a', '2027-01-01'), '2027-01-04')).toEqual({ topo: 'Há', valor: '3', rotulo: 'dias', tom: 'passado' });
  });
});

describe('orçamento e highlights', () => {
  it('previsto vs real', () => {
    expect(resumoOrcamento(1000, 500)).toMatchObject({ estado: 'dentro', desvio: -500, usado: 0.5 });
    expect(resumoOrcamento(1000, 950).estado).toBe('proximo');
    expect(resumoOrcamento(1000, 1200)).toMatchObject({ estado: 'acima', desvio: 200 });
    expect(resumoOrcamento(1000, null).estado).toBe('sem-dados');
    expect(resumoOrcamento(0, 100).estado).toBe('sem-dados');
  });
  it('um highlight por linha, sem marcadores nem linhas vazias', () => {
    expect(highlightsDeTexto('- A\n• B\n\n  * C  \n')).toEqual(['A', 'B', 'C']);
  });
});

const conv = (id: string, vendedor: string, nome: string, estado: Convidado['estado']): Convidado =>
  ({ id, evento_id: 'e', vendedor_email: vendedor, vendedor_nome: vendedor.split('@')[0], nome, contacto: null, estado, obs: null });

describe('convidados por vendedor', () => {
  it('assiduidade ignora quem recusou', () => {
    const r = resumoConvidados([{ estado: 'compareceu' }, { estado: 'faltou' }, { estado: 'recusou' }, { estado: 'confirmado' }]);
    expect(r).toMatchObject({ total: 4, confirmados: 2, compareceram: 1 });
    expect(r.assiduidade).toBeCloseTo(1 / 3);
    expect(resumoConvidados([]).assiduidade).toBeNull();
  });
  it('agrupa por vendedor com resumo por grupo', () => {
    const g = agruparPorVendedor([
      conv('1', 'rui@x.pt', 'Zé', 'compareceu'), conv('2', 'ana@x.pt', 'Bia', 'faltou'), conv('3', 'rui@x.pt', 'Ana', 'confirmado'),
    ]);
    expect(g.map(x => x.email)).toEqual(['ana@x.pt', 'rui@x.pt']);
    expect(g[1].convidados.map(c => c.nome)).toEqual(['Ana', 'Zé']);
    expect(g[1].resumo).toMatchObject({ total: 2, confirmados: 2, compareceram: 1 });
  });
});

describe('WhatsApp', () => {
  it('normaliza telefones (Portugal por omissão)', () => {
    expect(telefoneWhatsApp('912 345 678')).toBe('351912345678');
    expect(telefoneWhatsApp('+351 912345678')).toBe('351912345678');
    expect(telefoneWhatsApp('00447911123456')).toBe('447911123456');
    expect(telefoneWhatsApp('123')).toBeNull();
    expect(telefoneWhatsApp(null)).toBeNull();
  });
  it('texto do convite e link', () => {
    const t = textoConvite({ titulo: 'Noite M', inicio: '2027-03-13', fim: null, hora: '19:00', local: 'Aveiro', descricao: null, dress_code: 'Smart casual' }, 'Maria Silva', 'Rui Costa');
    expect(t).toContain('Olá Maria!');
    expect(t).toContain('*Noite M*');
    expect(t).toContain('13 mar 2027 · 19:00');
    expect(t).toContain('Smart casual');
    expect(t).toContain('Rui · Caetano BMW');
    expect(linkWhatsApp('olá & tudo', '912345678')).toBe('https://wa.me/351912345678?text=ol%C3%A1%20%26%20tudo');
    expect(linkWhatsApp('x')).toBe('https://wa.me/?text=x');
  });
});

describe('ficheiros (máx. 5 MB)', () => {
  it('imagem', () => {
    expect(validarImagem({ name: 'a.png', size: 1000 })).toBeNull();
    expect(validarImagem({ name: 'a.pdf', size: 1000 })).toMatch(/não suportado/);
    expect(validarImagem({ name: 'a.png', size: 5 * 1024 * 1024 + 1 })).toMatch(/excede 5 MB/);
    expect(validarImagem({ name: 'a.png', size: 0 })).toMatch(/vazio/);
  });
  it('documentos', () => {
    expect(validarDocumento({ name: 'brochura.pdf', size: 4 * 1024 * 1024 })).toBeNull();
    expect(validarDocumento({ name: 'x.exe', size: 10 })).toMatch(/não suportado/);
  });
  it('descrição de viatura', () => {
    expect(descreverViatura({ marca: 'BMW', modelo: 'iX1', versao: 'xDrive30', matricula: '00-AA-00' })).toBe('BMW iX1 xDrive30 · 00-AA-00');
    expect(descreverViatura({ marca: null, modelo: 'X5', versao: null, matricula: null })).toBe('X5');
  });
});

describe('mapa e resumo da agenda', () => {
  it('embed sem chave mostra só o local; com chave mostra a rota', () => {
    expect(urlMapaEmbed('Rua A, Aveiro', 'Caetano BMW Aveiro')).toBe('https://www.google.com/maps?q=Rua%20A%2C%20Aveiro&hl=pt-PT&z=14&output=embed');
    const u = urlMapaEmbed('Rua A, Aveiro', 'Caetano BMW Aveiro', 'K3Y');
    expect(u).toContain('/embed/v1/directions?key=K3Y');
    expect(u).toContain('origin=Caetano%20BMW%20Aveiro');
    expect(u).toContain('destination=Rua%20A%2C%20Aveiro');
  });
  it('ligações para abrir o mapa e a rota', () => {
    expect(urlAbrirMapa('Porto')).toBe('https://www.google.com/maps/search/?api=1&query=Porto');
    expect(urlRota('Aveiro', 'Porto')).toBe('https://www.google.com/maps/dir/?api=1&origin=Aveiro&destination=Porto&travelmode=driving');
  });
});
