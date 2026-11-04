import { describe, it, expect } from 'vitest';
import {
  agruparPorMes, agruparPorVendedor, estadoDe, formatarIntervalo, highlightsDeTexto, linkWhatsApp, posicaoHoje,
  proximoEvento, resumoConvidados, resumoOrcamento, telefoneWhatsApp, textoConvite, textoRelativo,
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
  it('próximo evento ignora passados e inclui o a decorrer', () => {
    const evs = [ev('a', '2027-01-01'), ev('b', '2027-01-02', '2027-01-20'), ev('c', '2027-02-01')];
    expect(proximoEvento(evs, '2027-01-05')?.id).toBe('b');
    expect(proximoEvento(evs, '2027-03-01')).toBeNull();
  });
  it('posição de hoje interpola entre eventos', () => {
    const evs = [ev('a', '2027-01-01'), ev('b', '2027-01-11'), ev('c', '2027-01-21')];
    expect(posicaoHoje(evs, '2026-12-01')).toBe(0);
    expect(posicaoHoje(evs, '2027-01-06')).toBeCloseTo(0.5);
    expect(posicaoHoje(evs, '2027-01-11')).toBeCloseTo(1);
    expect(posicaoHoje(evs, '2027-06-01')).toBe(2);
    expect(posicaoHoje([], '2027-01-01')).toBe(0);
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
