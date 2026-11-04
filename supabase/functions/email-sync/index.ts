// Edge function email-sync — lê, só em leitura, os emails de que a "Sincronizar" (VN) precisa.
//
// Devolve DOIS conjuntos, ambos filtrados por assunto E por remetente (nada mais sai da caixa):
//  - plates:  emails diários "Matriculas - Aveiro" (HTML, para ler a tabela);
//  - pedidos: conversas "Pedido de matrícula" (texto SÓ de cada mensagem, sem o histórico citado).
// Não interpreta nem grava nada: a leitura, o emparelhamento com os registos e a gravação
// (depois de o administrador confirmar) fazem-se na aplicação — ver src/lib/email-sync.ts.
//
// PRIVACIDADE: o conteúdo dos emails não é guardado nem registado em log.
//
// Acesso: só administradores (email em platform_admins ou perfil com is_admin).
// Segredos (Supabase → Edge Functions → Secrets):
//   MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET — app registada no Microsoft Entra ID com a
//     permissão de aplicação Mail.Read, RESTRINGIDA à caixa certa (Application Access Policy /
//     RBAC for Applications do Exchange Online) — nunca sobre todas as caixas do grupo;
//   MS_MAILBOX — o email da caixa a ler (p.ex. a do diretor de polo).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const GRAPH = "https://graph.microsoft.com/v1.0";
const MAX_DIAS = 60;
const PAGINAS = 3;       // de 50 mensagens cada, por pesquisa
const MAX_HTML = 200_000; // caracteres por email diário
const MAX_TEXTO = 8_000;  // caracteres por mensagem de pedido
const EMAIL = /^[^\s@"'\\]+@[^\s@"'\\]+\.[^\s@"'\\]+$/;

type GraphMsg = {
  id: string;
  subject?: string;
  conversationId?: string;
  receivedDateTime?: string;
  sentDateTime?: string;
  from?: { emailAddress?: { address?: string } };
  body?: { content?: string };
  uniqueBody?: { content?: string };
};

async function graphToken(): Promise<string> {
  const tenant = Deno.env.get("MS_TENANT_ID")!;
  const res = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("MS_CLIENT_ID")!,
      client_secret: Deno.env.get("MS_CLIENT_SECRET")!,
      grant_type: "client_credentials",
      scope: "https://graph.microsoft.com/.default",
    }),
  });
  if (!res.ok) throw new Error(`Microsoft recusou o acesso (${res.status}). Confirmar tenant, cliente e segredo.`);
  return (await res.json()).access_token as string;
}

/** Pesquisa KQL ($search) na caixa; segue as páginas até ao limite. */
async function pesquisar(token: string, mailbox: string, kql: string, tipoCorpo: "html" | "text"): Promise<GraphMsg[]> {
  const select = "id,subject,conversationId,receivedDateTime,sentDateTime,from,body,uniqueBody";
  let url: string | null =
    `${GRAPH}/users/${encodeURIComponent(mailbox)}/messages?$search=${encodeURIComponent(`"${kql}"`)}&$select=${select}&$top=50`;
  const out: GraphMsg[] = [];
  for (let i = 0; i < PAGINAS && url; i++) {
    const res: Response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Prefer: `outlook.body-content-type="${tipoCorpo}"`, ConsistencyLevel: "eventual" },
    });
    if (res.status === 403 || res.status === 401) throw new Error("Sem permissão para ler esta caixa (Mail.Read / política de acesso da aplicação).");
    if (!res.ok) throw new Error(`Falha a ler o email (${res.status}).`);
    const page = await res.json();
    out.push(...((page.value ?? []) as GraphMsg[]));
    url = (page["@odata.nextLink"] as string | undefined) ?? null;
  }
  return out;
}

const dia = (d: Date) => d.toISOString().slice(0, 10);
const de = (m: GraphMsg) => (m.from?.emailAddress?.address ?? "").toLowerCase();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Quem chama: JWT validado aqui (verify_jwt=false no config.toml), como em admin-users.
    const token = (req.headers.get("Authorization") ?? "").replace(/^[Bb]earer\s+/, "").trim();
    if (!token) return json({ error: "Não autenticado." }, 401);
    const asUser = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: { user }, error: uErr } = await asUser.auth.getUser(token);
    if (uErr || !user?.email) return json({ error: "Não autenticado." }, 401);

    const admin = createClient(url, serviceKey);
    let isAdmin = false;
    const { data: pa } = await admin.from("platform_admins").select("email").eq("email", user.email.toLowerCase()).maybeSingle();
    isAdmin = !!pa;
    if (!isAdmin) {
      const { data: u } = await admin.from("app_users").select("perfil").ilike("email", user.email).maybeSingle();
      if (u?.perfil) {
        const { data: r } = await admin.from("app_roles").select("is_admin").eq("name", u.perfil).maybeSingle();
        isAdmin = !!r?.is_admin;
      }
    }
    if (!isAdmin) return json({ error: "Sem permissão de administrador." }, 403);

    const cfg = ["MS_TENANT_ID", "MS_CLIENT_ID", "MS_CLIENT_SECRET", "MS_MAILBOX"].filter((k) => !Deno.env.get(k));
    if (cfg.length > 0) {
      return json({ error: "SEM_CONFIG", message: `Falta configurar o acesso ao email (${cfg.join(", ")}).` }, 503);
    }
    const mailbox = Deno.env.get("MS_MAILBOX")!;

    const body = await req.json().catch(() => ({}));
    const sendersPlates = ((body?.plateSenders ?? []) as unknown[]).map((s) => String(s).trim().toLowerCase()).filter((s) => EMAIL.test(s));
    if (sendersPlates.length === 0) return json({ error: "Indique pelo menos um remetente do email diário de matrículas." }, 400);
    const dias = Math.min(Math.max(Number(body?.sinceDays) || 14, 1), MAX_DIAS);
    const desde = dia(new Date(Date.now() - dias * 86_400_000));

    const tk = await graphToken();

    // 1. Emails diários de matrículas (HTML).
    const quemPlates = sendersPlates.map((s) => `from:${s}`).join(" OR ");
    const brutosPlates = await pesquisar(tk, mailbox, `subject:Matriculas AND (${quemPlates}) AND received>=${desde}`, "html");
    const plates = brutosPlates
      .filter((m) => /^\s*matr[ií]culas\s*-\s*aveiro/i.test(m.subject ?? "") && sendersPlates.includes(de(m)) && (m.receivedDateTime ?? "") >= desde)
      .map((m) => ({ id: m.id, receivedAt: m.receivedDateTime ?? "", html: (m.body?.content ?? "").slice(0, MAX_HTML) }));

    // 2. Conversas de pedido de matrícula (texto). O pedido é do consultor (qualquer remetente);
    //    só as RESPOSTAS dos confirmadores contam como confirmação, e isso decide-se na aplicação.
    const brutosPedidos = await pesquisar(tk, mailbox, `subject:"Pedido de matrícula" AND received>=${desde}`, "text");
    const pedidos = brutosPedidos
      .filter((m) => /pedido\s+de\s+matr[ií]cula/i.test(m.subject ?? "") && (m.sentDateTime ?? "") >= desde && !!m.conversationId)
      .map((m) => ({
        id: m.id,
        conversationId: m.conversationId!,
        subject: m.subject ?? "",
        from: de(m),
        sentAt: m.sentDateTime ?? "",
        text: (m.uniqueBody?.content ?? m.body?.content ?? "").slice(0, MAX_TEXTO),
      }));

    return json({ plates, pedidos, desde });
  } catch (e) {
    return json({ error: "ERRO", message: e instanceof Error ? e.message : "Erro inesperado." }, 502);
  }
});
