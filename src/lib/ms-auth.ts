/**
 * Entrar com Microsoft (só leitura do email de quem está a usar a plataforma).
 *
 * Usa uma app registada no Microsoft Entra como "Single-page application" com a permissão
 * DELEGADA Mail.Read: lê apenas a caixa da pessoa que inicia sessão, com o consentimento dela,
 * por isso não precisa de segredo nem de política do Exchange. Os tokens ficam só na sessão do
 * browser (sessionStorage). A biblioteca da Microsoft carrega-se só quando se usa.
 */
import { client } from '@/clients';

export class MsAuthError extends Error {}

export interface MsConfig { clientId: string; tenantId: string }

/** Client ID / Tenant ID (públicos). A configuração do cliente tem precedência sobre o ambiente. */
export function getMsConfig(): MsConfig | null {
  const cfg = client.emailSync?.microsoft;
  const clientId = (cfg?.clientId || import.meta.env.VITE_MS_CLIENT_ID || '').trim();
  const tenantId = (cfg?.tenantId || import.meta.env.VITE_MS_TENANT_ID || '').trim();
  return clientId && tenantId ? { clientId, tenantId } : null;
}

/** Endereço de retorno que tem de estar registado na app (tipo "Single-page application"). */
export function msRedirectUri(): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}ms-redirect.html`;
}

const SCOPES = ['Mail.Read'];

/** Mensagem em português para os erros mais comuns do início de sessão. */
export function explicarErroMs(e: unknown, redirectUri = msRedirectUri()): string {
  const err = e as { errorCode?: string; message?: string };
  const code = err?.errorCode ?? '';
  const msg = err?.message ?? '';
  if (code === 'user_cancelled') return 'O início de sessão da Microsoft foi cancelado.';
  if (code === 'popup_window_error' || code === 'empty_window_error') return 'O browser bloqueou a janela da Microsoft: permite pop-ups para este site e tenta outra vez.';
  if (msg.includes('AADSTS50011') || code === 'redirect_uri_mismatch') return `O endereço de retorno não está registado na app da Microsoft. Regista ${redirectUri} (tipo "Single-page application").`;
  if (msg.includes('AADSTS700016')) return 'A Microsoft não encontrou esta app no teu tenant: confirma o Client ID e o Tenant ID.';
  if (/AADSTS(65001|90094|65004|90008)/.test(msg) || code === 'consent_required') return 'A tua organização exige aprovação da IT para esta app aceder ao email.';
  if (/AADSTS(50020|50105|700025)/.test(msg)) return 'A conta usada não pertence ao tenant da app. Entra com a conta de trabalho.';
  return msg || 'Não foi possível iniciar sessão na Microsoft.';
}

let pca: import('@azure/msal-browser').PublicClientApplication | null = null;

/** Token para ler o email. Pede sessão à pessoa (janela da Microsoft) só se for preciso. */
export async function obterTokenMs(): Promise<string> {
  const cfg = getMsConfig();
  if (!cfg) throw new MsAuthError('A ligação à Microsoft ainda não está configurada (faltam o Client ID e o Tenant ID).');
  try {
    const { PublicClientApplication } = await import('@azure/msal-browser');
    if (!pca) {
      pca = new PublicClientApplication({
        auth: { clientId: cfg.clientId, authority: `https://login.microsoftonline.com/${cfg.tenantId}`, redirectUri: msRedirectUri() },
        cache: { cacheLocation: 'sessionStorage' },
      });
      await pca.initialize();
    }
    const account = pca.getAllAccounts()[0];
    if (account) {
      try {
        return (await pca.acquireTokenSilent({ scopes: SCOPES, account })).accessToken;
      } catch { /* sessão expirada: pede de novo abaixo */ }
    }
    return (await pca.acquireTokenPopup({ scopes: SCOPES, account })).accessToken;
  } catch (e) {
    throw new MsAuthError(explicarErroMs(e));
  }
}
