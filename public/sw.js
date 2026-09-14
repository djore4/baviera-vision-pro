/* Service worker — apenas Web Push da Prospeção.
 * Não faz cache nem intercepta pedidos (não transforma a app numa PWA offline);
 * limita-se a mostrar as notificações push e a abrir a página ao clicar. */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Constrói o URL a abrir a partir do scope do SW (que já inclui a subpasta,
// ex.: /baviera-vision-pro/) e da rota hash da app (HashRouter).
function targetUrl(route) {
  const base = self.registration.scope.replace(/\/$/, '');
  const r = (route || '/prospecao').replace(/^#/, '');
  return `${base}/#${r.startsWith('/') ? r : '/' + r}`;
}

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_e) {
    data = { title: 'Prospeção', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Prospeção';
  const icon = new URL('favicon.ico', self.registration.scope).href;
  const options = {
    body: data.body || '',
    icon,
    badge: icon,
    tag: data.tag || 'prospec',
    renotify: true,
    data: { url: targetUrl(data.data && data.data.url) },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || targetUrl('/prospecao');
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of all) {
      // Já há uma janela da app aberta → foca-a (e navega para a rota).
      if (client.url.startsWith(self.registration.scope) && 'focus' in client) {
        try { await client.navigate(url); } catch (_e) { /* ignora */ }
        return client.focus();
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(url);
  })());
});
