import { supabase } from '@/integrations/supabase/client';

/* ── Web Push da Prospeção ─────────────────────────────────────────────────────
 * Regista o service worker (/sw.js), subscreve este dispositivo às notificações
 * push e guarda a subscrição via a edge function `prospec-subscribe`. O envio é
 * feito server-side (edge function `prospec-push`, disparada por pg_cron), pelo
 * que os avisos chegam mesmo com o separador em segundo plano.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Chave VAPID pública — par da privada guardada em `cs_config` no Supabase.
 *  É pública por natureza (identifica o servidor de push); não é segredo. */
const VAPID_PUBLIC = 'BNG86IR9Fplry-FEix7OGz6vqSuYDe8JN5P1b95YgKKtztT0aowsYcWpk4sI0z-17IfpCawwcHQ0zW8uTfT3Kps';

/** O browser suporta o pipeline completo de Web Push? */
export const pushSupported = (): boolean =>
  typeof window !== 'undefined'
  && 'serviceWorker' in navigator
  && 'PushManager' in window
  && 'Notification' in window;

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

async function ensureRegistration(): Promise<ServiceWorkerRegistration> {
  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  return reg;
}

/** Subscreve este dispositivo às notificações push da Prospeção. */
export async function subscribeToPush(email: string | null): Promise<void> {
  const reg = await ensureRegistration();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
    });
  }
  const { error } = await supabase.functions.invoke('prospec-subscribe', {
    body: { action: 'subscribe', subscription: sub.toJSON(), email },
  });
  if (error) throw error;
}

/** Remove a subscrição deste dispositivo (deixa de receber push). */
export async function unsubscribeFromPush(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  try {
    await supabase.functions.invoke('prospec-subscribe', {
      body: { action: 'unsubscribe', subscription: sub.toJSON() },
    });
  } catch { /* ignora — o endpoint morto é limpo no servidor ao falhar o envio */ }
  try { await sub.unsubscribe(); } catch { /* ignora */ }
}

/** Dispara um push de teste imediato (feedback ao ativar as notificações). */
export async function sendTestPush(): Promise<void> {
  try {
    await supabase.functions.invoke('prospec-push', { body: { test: true } });
  } catch { /* ignora — não estorva o fluxo de ativação */ }
}
