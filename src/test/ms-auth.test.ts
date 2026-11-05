import { describe, it, expect, vi, afterEach } from 'vitest';
import { explicarErroMs, getMsConfig, msRedirectUri } from '@/lib/ms-auth';

afterEach(() => vi.unstubAllEnvs());

describe('configuração da Microsoft', () => {
  it('sem Client ID e Tenant ID não está configurada', () => {
    expect(getMsConfig()).toBeNull();
  });
  it('lê o ambiente do build e exige os dois valores', () => {
    vi.stubEnv('VITE_MS_CLIENT_ID', ' abc ');
    expect(getMsConfig()).toBeNull();
    vi.stubEnv('VITE_MS_TENANT_ID', 'tenant-1');
    expect(getMsConfig()).toEqual({ clientId: 'abc', tenantId: 'tenant-1' });
  });
  it('o endereço de retorno é a página em branco do próprio site', () => {
    expect(msRedirectUri()).toBe(`${window.location.origin}/ms-redirect.html`);
  });
});

describe('explicarErroMs', () => {
  const uri = 'https://site.pt/ms-redirect.html';
  it('traduz os erros mais comuns', () => {
    expect(explicarErroMs({ errorCode: 'user_cancelled' }, uri)).toMatch(/cancelado/);
    expect(explicarErroMs({ errorCode: 'popup_window_error' }, uri)).toMatch(/pop-ups/);
    expect(explicarErroMs({ message: 'AADSTS50011: reply url' }, uri)).toContain(uri);
    expect(explicarErroMs({ message: 'AADSTS700016: app not found' }, uri)).toMatch(/Client ID/);
    expect(explicarErroMs({ message: 'AADSTS65001: consent' }, uri)).toMatch(/IT/);
    expect(explicarErroMs({ message: 'AADSTS90094: admin consent' }, uri)).toMatch(/IT/);
  });
  it('erros desconhecidos mantêm a mensagem original', () => {
    expect(explicarErroMs({ message: 'qualquer coisa' }, uri)).toBe('qualquer coisa');
    expect(explicarErroMs({}, uri)).toMatch(/Não foi possível/);
  });
});
