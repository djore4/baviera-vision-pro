import { describe, it, expect, vi, beforeEach } from 'vitest';
import { webcrypto } from 'node:crypto';

const invoke = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } } }));

import { extrairFicha, gravarCache, lerCache, hashTexto, CACHE_MAX, CACHE_TTL_MS } from '@/lib/ficha-extrair';

const pdf = (conteudo: string) => new File([conteudo], 'contrato.pdf', { type: 'application/pdf' });

beforeEach(() => {
  localStorage.clear();
  invoke.mockReset();
  invoke.mockResolvedValue({ data: { campos: { pvb: 50000, incerto: [] } }, error: null });
  vi.stubGlobal('crypto', webcrypto);
});

describe('cache da leitura do contrato (poupa créditos)', () => {
  it('o mesmo ficheiro só é lido uma vez; a segunda vez vem da cache', async () => {
    const a = await extrairFicha(pdf('%PDF-1.4 igual'));
    const b = await extrairFicha(pdf('%PDF-1.4 igual'));
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(b).toEqual(a);
  });

  it('um ficheiro diferente volta a ser lido', async () => {
    await extrairFicha(pdf('%PDF-1.4 um'));
    await extrairFicha(pdf('%PDF-1.4 outro'));
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it('duplo clique em simultâneo reaproveita o pedido em curso', async () => {
    const [a, b] = await Promise.all([extrairFicha(pdf('%PDF-1.4 x')), extrairFicha(pdf('%PDF-1.4 x'))]);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
  });

  it('uma leitura falhada NÃO fica em cache (volta a tentar)', async () => {
    invoke.mockResolvedValueOnce({ data: null, error: { context: undefined } });
    await expect(extrairFicha(pdf('%PDF-1.4 falha'))).rejects.toThrow();
    await extrairFicha(pdf('%PDF-1.4 falha'));
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it('sem crypto.subtle não há cache, mas a leitura funciona', async () => {
    vi.stubGlobal('crypto', {});
    await extrairFicha(pdf('%PDF-1.4 s'));
    await extrairFicha(pdf('%PDF-1.4 s'));
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(await hashTexto('x')).toBeNull();
  });

  it('entradas com mais de 7 dias expiram', () => {
    gravarCache('h1', { pvb: 1 }, 1_000);
    expect(lerCache('h1', 1_000 + CACHE_TTL_MS - 1)).toEqual({ pvb: 1 });
    expect(lerCache('h1', 1_000 + CACHE_TTL_MS + 1)).toBeNull();
    expect(localStorage.getItem('ficha-extrair:h1')).toBeNull();
  });

  it('guarda no máximo as 20 leituras mais recentes', () => {
    for (let i = 0; i < CACHE_MAX + 5; i++) gravarCache(`h${i}`, { pvb: i }, 1_000 + i);
    const chaves = Object.keys(localStorage).filter(k => k.startsWith('ficha-extrair:'));
    expect(chaves).toHaveLength(CACHE_MAX);
    expect(lerCache('h0', 2_000)).toBeNull();                    // a mais antiga saiu
    expect(lerCache(`h${CACHE_MAX + 4}`, 2_000)).toEqual({ pvb: CACHE_MAX + 4 });
  });

  it('a cache só guarda os campos extraídos (valores económicos), nunca o ficheiro', async () => {
    await extrairFicha(pdf('%PDF-1.4 conteudo-secreto'));
    const guardado = Object.entries(localStorage).filter(([k]) => k.startsWith('ficha-extrair:')).map(([, v]) => String(v)).join('');
    expect(guardado).not.toContain('conteudo-secreto');
    expect(guardado).not.toContain(btoa('%PDF-1.4 conteudo-secreto'));
  });
});
