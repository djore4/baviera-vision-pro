// Edge function admin-users — operações privilegiadas sobre utilizadores/funções.
// Só um administrador (email de admin ou perfil com is_admin) pode invocar.
// Usa o service role para criar/eliminar utilizadores de autenticação e para
// escrever nas tabelas utilizadores/app_roles (que só permitem leitura a
// utilizadores autenticados).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const ADMIN_EMAIL = "joaocarlos.duarte@caetano.pt";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });

const USER_COLS = "id, nome, email, perfil, local, negocio, marca";

async function findAuthUserByEmail(admin: SupabaseClient, email: string) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) break;
    const found = data.users.find((u) => (u.email ?? "").toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (data.users.length < 200) break;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";

    // Identificar quem chama a partir do JWT.
    const asUser = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: uErr } = await asUser.auth.getUser();
    if (uErr || !user) return json({ error: "Não autenticado." }, 401);

    const admin = createClient(url, serviceKey);

    // Validar admin: email de admin OU perfil com is_admin.
    let isAdmin = (user.email ?? "").toLowerCase() === ADMIN_EMAIL;
    if (!isAdmin && user.email) {
      const { data: u } = await admin.from("utilizadores").select("perfil").ilike("email", user.email).maybeSingle();
      if (u?.perfil) {
        const { data: r } = await admin.from("app_roles").select("is_admin").eq("name", u.perfil).maybeSingle();
        isAdmin = !!r?.is_admin;
      }
    }
    if (!isAdmin) return json({ error: "Sem permissão de administrador." }, 403);

    const body = await req.json().catch(() => ({}));
    const action = body?.action as string;

    if (action === "create") {
      const { nome, email, password, perfil, local, negocio, marca } = body;
      if (!email || !password) return json({ error: "Email e password são obrigatórios." }, 400);

      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { nome, perfil },
      });
      if (cErr || !created?.user) return json({ error: cErr?.message ?? "Falha a criar login." }, 400);

      const { data: row, error: iErr } = await admin.from("utilizadores")
        .insert({ nome: nome ?? null, email, perfil: perfil ?? null, local: local ?? null, negocio: negocio ?? null, marca: marca ?? null })
        .select(USER_COLS).single();
      if (iErr) {
        await admin.auth.admin.deleteUser(created.user.id); // rollback
        return json({ error: iErr.message }, 400);
      }
      return json({ user: row });
    }

    if (action === "update") {
      const { id, patch, password } = body;
      if (!id) return json({ error: "id em falta." }, 400);
      const { data: row, error: e1 } = await admin.from("utilizadores")
        .update(patch ?? {}).eq("id", id).select(USER_COLS).single();
      if (e1) return json({ error: e1.message }, 400);
      if (password && row?.email) {
        const authUser = await findAuthUserByEmail(admin, row.email);
        if (authUser) await admin.auth.admin.updateUserById(authUser.id, { password });
      }
      return json({ user: row });
    }

    if (action === "delete") {
      const { id } = body;
      if (!id) return json({ error: "id em falta." }, 400);
      const { data: row } = await admin.from("utilizadores").select("email").eq("id", id).maybeSingle();
      const { error: dErr } = await admin.from("utilizadores").delete().eq("id", id);
      if (dErr) return json({ error: dErr.message }, 400);
      if (row?.email) {
        const authUser = await findAuthUserByEmail(admin, row.email);
        if (authUser) await admin.auth.admin.deleteUser(authUser.id);
      }
      return json({ ok: true });
    }

    if (action === "save_role") {
      const { name, permissions, is_admin } = body;
      if (!name) return json({ error: "Nome da função em falta." }, 400);
      const { data: row, error: rErr } = await admin.from("app_roles")
        .upsert({ name, permissions: permissions ?? {}, is_admin: !!is_admin }, { onConflict: "name" })
        .select("name, is_admin, permissions").single();
      if (rErr) return json({ error: rErr.message }, 400);
      return json({ role: row });
    }

    return json({ error: "Ação desconhecida." }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
