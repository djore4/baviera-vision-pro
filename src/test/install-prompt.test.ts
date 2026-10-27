import { describe, it, expect } from 'vitest';
import { faixaDevida, plataformaMovel } from '@/lib/install-prompt';
import { localPorOmissao } from '@/lib/eot';

describe('Instalar a app', () => {
  it('deteta a plataforma móvel', () => {
    expect(plataformaMovel('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)')).toBe('ios');
    expect(plataformaMovel('Mozilla/5.0 (Macintosh; Intel Mac OS X)', 5)).toBe('ios'); // iPadOS
    expect(plataformaMovel('Mozilla/5.0 (Macintosh; Intel Mac OS X)', 0)).toBe(null);   // Mac
    expect(plataformaMovel('Mozilla/5.0 (Linux; Android 14)')).toBe('android');
    expect(plataformaMovel('Mozilla/5.0 (Windows NT 10.0)')).toBe(null);
  });

  it('pergunta de início, volta a perguntar ao fim de 7 dias e no máximo 2 vezes', () => {
    const dia = 24 * 3600 * 1000;
    const t0 = 1_000_000_000_000;
    expect(faixaDevida({}, t0)).toBe(true);
    expect(faixaDevida({ instalada: true }, t0)).toBe(false);
    expect(faixaDevida({ n: 1, ts: t0 }, t0 + 3 * dia)).toBe(false);
    expect(faixaDevida({ n: 1, ts: t0 }, t0 + 8 * dia)).toBe(true);
    expect(faixaDevida({ n: 2, ts: t0 }, t0 + 30 * dia)).toBe(false);
  });
});

describe('EoT — local por omissão', () => {
  const c = (resp: string) => ({ concessionario_resp: resp, concessionario: resp });

  it('usa o único local da ficha do utilizador', () => {
    const owners = [{ email: 'a@x.pt', locais: ['Aveiro'] }];
    expect(localPorOmissao([c('Caetano Porto'), c('Caetano Aveiro')], owners, 'A@x.pt')).toBe('Aveiro');
  });

  it('sem ficha, usa o único local dos contratos que lhe chegam', () => {
    expect(localPorOmissao([c('Caetano Porto'), c('Baviera Porto 2')], [], 'v@x.pt')).toBe('Porto');
  });

  it('vários locais (ou ficha com vários) → todos', () => {
    expect(localPorOmissao([c('Caetano Porto'), c('Caetano Aveiro')], [], 'v@x.pt')).toBe('all');
    expect(localPorOmissao([c('Caetano Porto')], [{ email: 'v@x.pt', locais: ['Porto', 'Gaia'] }], 'v@x.pt')).toBe('Porto');
    expect(localPorOmissao([c('Caetano Porto'), c('Caetano Aveiro')], [{ email: 'v@x.pt', locais: ['Porto', 'Gaia'] }], 'v@x.pt')).toBe('all');
  });
});
