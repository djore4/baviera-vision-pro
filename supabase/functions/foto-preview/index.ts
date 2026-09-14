// Edge function foto-preview — resolve uma imagem de capa a partir de um link
// de fotos (álbum Google Photos, página de produto caetano.pt, etc.), lendo a
// meta tag og:image/twitter:image da página. Corre no lado do servidor porque
// o browser não consegue ler estas páginas (CORS/redirects/auth).
//
// Segurança: só busca hosts numa allowlist (evita SSRF/proxy aberto). Links
// SharePoint protegidos por autenticação devolvem, na prática, imagem nula — o
// frontend cai no cartão com placeholder de marca.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const ALLOWED_HOSTS = [
  "photos.app.goo.gl",
  "photos.google.com",
  "lh3.googleusercontent.com",
  "caetano.pt",
  "www.caetano.pt",
];

function hostAllowed(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (ALLOWED_HOSTS.includes(h)) return true;
  return h.endsWith(".sharepoint.com") || h.endsWith(".caetano.pt") || h.endsWith(".googleusercontent.com");
}

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "public, max-age=86400" },
  });

function extractImage(html: string): string | null {
  const patterns = [
    /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m?.[1]) return m[1].replace(/&amp;/g, "&");
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    let target = "";
    if (req.method === "GET") {
      target = new URL(req.url).searchParams.get("url") ?? "";
    } else {
      const body = await req.json().catch(() => ({}));
      target = (body?.url as string) ?? "";
    }
    if (!target) return json({ error: "url em falta" }, 400);

    let u: URL;
    try { u = new URL(target); } catch { return json({ error: "url inválido" }, 400); }
    if (u.protocol !== "https:") return json({ error: "só https" }, 400);
    if (!hostAllowed(u.hostname)) return json({ image: null, reason: "host não permitido" });

    const res = await fetch(u.toString(), {
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-PT,pt;q=0.9,en;q=0.8",
      },
    });

    const ctype = res.headers.get("content-type") ?? "";
    if (ctype.startsWith("image/")) return json({ image: res.url });
    if (!ctype.includes("html") && !ctype.includes("xml")) return json({ image: null });

    const html = (await res.text()).slice(0, 600_000);
    return json({ image: extractImage(html) });
  } catch (e) {
    // Falha graciosa — o frontend usa o placeholder de marca.
    return json({ image: null, error: String(e) }, 200);
  }
});
