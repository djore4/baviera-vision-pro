import { describe, it, expect } from 'vitest';
import { safeInternalLink, isNotificationVisible, notificationTarget } from '@/lib/notifications';

describe('safeInternalLink — só caminhos internos', () => {
  it('aceita caminhos internos, com query', () => {
    expect(safeInternalLink('/end-of-term')).toBe('/end-of-term');
    expect(safeInternalLink('/end-of-term?contrato=EOT-1')).toBe('/end-of-term?contrato=EOT-1');
    expect(safeInternalLink('/end-of-term?contrato=A%20B%26c%2F1')).toBe('/end-of-term?contrato=A%20B%26c%2F1');
  });

  it.each([
    ['endereço externo', 'https://evil.example/x'],
    ['protocolo relativo', '//evil.example/x'],
    ['barra invertida', '/\\evil.example'],
    ['javascript:', 'javascript:alert(1)'],
    ['data:', 'data:text/html,<script>1</script>'],
    ['sem barra inicial', 'end-of-term'],
    ['com espaços', '/end of term'],
    ['com quebra de linha', '/end-of-term\nhttps://evil.example'],
    ['vazio', ''],
    ['só espaços', '   '],
  ])('recusa %s', (_nome, link) => {
    expect(safeInternalLink(link)).toBeNull();
  });

  it('null e undefined → null', () => {
    expect(safeInternalLink(null)).toBeNull();
    expect(safeInternalLink(undefined)).toBeNull();
  });
});

describe('isNotificationVisible — repete a regra da base de dados', () => {
  const canView = (tabs: string[]) => (t: string) => tabs.includes(t);

  it('dirigida a uma pessoa: só a ela, sem distinguir maiúsculas; nunca a outros nem a quem tem o tab', () => {
    const n = { audience: 'end-of-term', recipient_email: 'Vend@X.pt' };
    expect(isNotificationVisible(n, 'vend@x.pt', canView(['end-of-term']))).toBe(true);
    expect(isNotificationVisible(n, 'outro@x.pt', canView(['end-of-term']))).toBe(false);
    expect(isNotificationVisible(n, null, canView(['end-of-term']))).toBe(false);
  });

  it('geral: toda a gente', () => {
    expect(isNotificationVisible({ audience: 'all' }, 'a@x.pt', canView([]))).toBe(true);
  });

  it('de uma área: só quem a tem', () => {
    expect(isNotificationVisible({ audience: 'lavagem' }, 'a@x.pt', canView(['lavagem']))).toBe(true);
    expect(isNotificationVisible({ audience: 'lavagem' }, 'a@x.pt', canView(['funil']))).toBe(false);
  });

  it('@admin: só quem tem acesso total (o administrador); o Finance com o tab não chega', () => {
    const admin = () => true;   // o administrador tem acesso a tudo
    expect(isNotificationVisible({ audience: '@admin' }, 'a@x.pt', admin)).toBe(true);
    expect(isNotificationVisible({ audience: '@admin' }, 'f@x.pt', canView(['end-of-term', 'end-of-term:todos']))).toBe(false);
  });

  it('sem recipient_email (base ainda não migrada) comporta-se como antes', () => {
    expect(isNotificationVisible({ audience: 'end-of-term', recipient_email: undefined }, 'a@x.pt', canView(['end-of-term']))).toBe(true);
    expect(isNotificationVisible({ audience: 'end-of-term', recipient_email: null }, 'a@x.pt', canView([]))).toBe(false);
  });
});

describe('notificationTarget — para onde leva clicar', () => {
  const tabPath = (k: string) => ({ 'end-of-term': '/end-of-term', lavagem: '/lavagem' } as Record<string, string>)[k] ?? null;

  it('o link da notificação tem prioridade', () => {
    expect(notificationTarget({ audience: 'end-of-term', link: '/end-of-term?contrato=X' }, tabPath)).toBe('/end-of-term?contrato=X');
    expect(notificationTarget({ audience: '@admin', link: '/end-of-term?contrato=X' }, tabPath)).toBe('/end-of-term?contrato=X');
  });

  it('sem link, vai para a área a que se dirige (comportamento de sempre)', () => {
    expect(notificationTarget({ audience: 'lavagem', link: null }, tabPath)).toBe('/lavagem');
    expect(notificationTarget({ audience: 'lavagem' }, tabPath)).toBe('/lavagem');
  });

  it('gerais e de administração sem link não têm destino', () => {
    expect(notificationTarget({ audience: 'all', link: null }, tabPath)).toBeNull();
    expect(notificationTarget({ audience: '@admin', link: null }, tabPath)).toBeNull();
  });

  it('um link inseguro é ignorado e cai para a área (ou nada)', () => {
    expect(notificationTarget({ audience: 'lavagem', link: 'https://evil.example' }, tabPath)).toBe('/lavagem');
    expect(notificationTarget({ audience: 'all', link: '//evil.example' }, tabPath)).toBeNull();
    expect(notificationTarget({ audience: '@admin', link: 'javascript:alert(1)' }, tabPath)).toBeNull();
  });
});
