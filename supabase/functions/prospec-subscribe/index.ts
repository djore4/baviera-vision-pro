// prospec-subscribe — regista/remove a subscrição Web Push de um dispositivo na
// tabela fechada public.prospec_push_subs, e devolve a chave VAPID pública.
// Reutiliza as chaves VAPID de cs_config. Escreve com a service role.
//   GET  -> { vapidPublic }
//   POST { action:'subscribe', subscription, email? }   -> upsert
//   POST { action:'unsubscribe', subscription }         -> delete por endpoint
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const supa = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    if (req.method === 'GET') {
      const { data: cfg } = await supa.from('cs_config').select('vapid_public').eq('id', 1).single();
      if (!cfg?.vapid_public) return json({ error: 'sem chave VAPID' }, 400);
      return json({ vapidPublic: cfg.vapid_public });
    }
    if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

    const body = await req.json().catch(() => ({}));
    const action = body?.action || 'subscribe';
    const sub = body?.subscription;
    const endpoint = sub?.endpoint;
    if (!endpoint || typeof endpoint !== 'string') return json({ error: 'subscription.endpoint em falta' }, 400);

    if (action === 'unsubscribe') {
      await supa.from('prospec_push_subs').delete().eq('endpoint', endpoint);
      return json({ ok: true, removed: true });
    }

    const p256dh = sub?.keys?.p256dh, auth = sub?.keys?.auth;
    if (!p256dh || !auth) return json({ error: 'subscription.keys em falta' }, 400);
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() || null : null;
    const { error } = await supa.from('prospec_push_subs').upsert({
      endpoint, p256dh, auth, user_email: email,
      ua: String(req.headers.get('user-agent') || '').slice(0, 300),
      last_ok: new Date().toISOString(), fail_count: 0,
    }, { onConflict: 'endpoint' });
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true, subscribed: true });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 400);
  }
});
