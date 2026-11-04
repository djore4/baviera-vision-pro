// Edge function sync-matriculas — "puxa" do Outlook (Microsoft 365) as respostas ao
// pedido de matrícula (caixa de Aveiro) e atualiza os registos VN (control_records):
//   · resposta "matrícula pedida" → mat_pedida_em (o pedido só conta a partir daqui);
//   · matrícula atribuída         → mat (só se estiver vazia e o pedido estiver confirmado).
// As regras estão em ../_shared/matriculas-email.ts (testadas). Idempotente.
//
// Só administradores. Segredos (supabase secrets set …), app Azure com a permissão de
// aplicação Mail.Read limitada à caixa pretendida:
//   MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET, MS_MAILBOX (ex.: matriculas.aveiro@…)
//   MS_MAIL_FOLDER (opcional, por omissão "inbox")
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { type Mensagem, processar, type RegistoVN } from "../_shared/matriculas-email.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });

const MAX_MENSAGENS = 600;

async function tokenGraph(): Promise<string> {
  const tenant = Deno.env.get("MS_TENANT_ID"), id = Deno.env.get("MS_CLIENT_ID"), secret = Deno.env.get("MS_CLIENT_SECRET");
  if (!tenant || !id || !secret || !Deno.env.get("MS_MAILBOX")) throw new Error("NAO_CONFIGURADO");
  const r = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: id, client_secret: secret, scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials" }),
  });
  if (!r.ok) throw new Error(`Microsoft recusou o acesso (${r.status}).`);
  return (await r.json()).access_token as string;
}

async function lerMensagens(token: string, dias: number): Promise<Mensagem[]> {
  const caixa = encodeURIComponent(Deno.env.get("MS_MAILBOX")!);
  const pasta = encodeURIComponent(Deno.env.get("MS_MAIL_FOLDER") ?? "inbox");
  const desde = new Date(Date.now() - dias * 86400000).toISOString();
  let url: string | null = `https://graph.microsoft.com/v1.0/users/${caixa}/mailFolders/${pasta}/messages`
    + `?$filter=${encodeURIComponent(`receivedDateTime ge ${desde}`)}&$orderby=receivedDateTime desc`
    + `&$select=id,subject,receivedDateTime,body&$top=50`;
  const out: Mensagem[] = [];
  while (url && out.length < MAX_MENSAGENS) {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.body-content-type="text"' } });
    if (!r.ok) throw new Error(`Não foi possível ler a caixa de correio (${r.status}).`);
    const j = await r.json();
    for (const m of j.value ?? []) {
      // Só conversas do pedido de matrícula (sem acentos, para apanhar "matricula"/"matrícula").
      const assunto = String(m.subject ?? "");
      if (!/matr[ií]cula/i.test(assunto.normalize("NFC"))) continue;
      out.push({ id: m.id, assunto, corpo: String(m.body?.content ?? ""), recebidaEm: m.receivedDateTime });
    }
    url = j["@odata.nextLink"] ?? null;
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const token = (req.headers.get("Authorization") ?? "").replace(/^[Bb]earer\s+/, "").trim();
    if (!token) return json({ error: "Não autenticado." }, 401);
    const asUser = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: { user }, error: uErr } = await asUser.auth.getUser(token);
    if (uErr || !user) return json({ error: "Não autenticado." }, 401);

    const admin = createClient(url, serviceKey);
    let isAdmin = false;
    if (user.email) {
      const { data: pa } = await admin.from("platform_admins").select("email").eq("email", user.email.toLowerCase()).maybeSingle();
      isAdmin = !!pa;
      if (!isAdmin) {
        const { data: u } = await admin.from("app_users").select("perfil").ilike("email", user.email).maybeSingle();
        if (u?.perfil) {
          const { data: r } = await admin.from("app_roles").select("is_admin").eq("name", u.perfil).maybeSingle();
          isAdmin = !!r?.is_admin;
        }
      }
    }
    if (!isAdmin) return json({ error: "Sem permissão de administrador." }, 403);

    const body = await req.json().catch(() => ({}));
    const dias = Math.min(90, Math.max(1, Number(body?.dias) || 30));

    let mensagens: Mensagem[];
    try {
      mensagens = await lerMensagens(await tokenGraph(), dias);
    } catch (e) {
      if (e instanceof Error && e.message === "NAO_CONFIGURADO") {
        return json({ error: "Sincronização não configurada: faltam os segredos MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET e MS_MAILBOX." }, 503);
      }
      return json({ error: e instanceof Error ? e.message : "Falha ao ler o email." }, 502);
    }

    const { data: registos, error: rErr } = await admin.from("control_records")
      .select("id, id_cliente, cliente, enc, chas, mat, status, mat_pedida_em")
      .in("status", ["Carteira", "Matricula"]);
    if (rErr) return json({ error: "Não foi possível ler os registos VN." }, 500);

    const vn: RegistoVN[] = (registos ?? []).map((r: Record<string, string | null>) => ({
      id: r.id as string, cliente: r.id_cliente ?? r.cliente, enc: r.enc, chas: r.chas,
      mat: r.mat, status: r.status, mat_pedida_em: r.mat_pedida_em,
    }));
    const res = processar(mensagens, vn);
    for (const a of res.alteracoes) {
      const { id, ...campos } = a;
      const { error } = await admin.from("control_records").update(campos).eq("id", id);
      if (error) return json({ error: `Falha ao gravar: ${error.message}` }, 500);
    }
    return json({
      mensagens: mensagens.length, pedidas: res.pedidas, matriculas: res.matriculas,
      ignoradas: res.ignoradas.slice(0, 20), totalIgnoradas: res.ignoradas.length,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Erro inesperado." }, 500);
  }
});
