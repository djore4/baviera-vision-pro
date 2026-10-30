// Edge function admin-users — operações privilegiadas sobre utilizadores/funções.
// Só um administrador (email em platform_admins ou perfil com is_admin) pode invocar.
// Exceção: a ação "create" também é permitida a quem gere o End-of-Term (perfil com
// 'end-of-term:todos' em edição), mas só para funções com acesso ao End-of-Term e sem is_admin.
// Usa o service role para criar/eliminar utilizadores de autenticação e para
// escrever nas tabelas app_users/app_roles (que só permitem leitura a
// utilizadores autenticados). A tabela app_users é exclusiva desta plataforma.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    // Identificar quem chama a partir do JWT. Validamos o token nós próprios
    // (getUser via GoTrue), por isso a função é publicada com verify_jwt=false —
    // evita o erro de verificação no gateway quando o projeto usa chaves ES256.
    const token = authHeader.replace(/^[Bb]earer\s+/, "").trim();
    if (!token) return json({ error: "Não autenticado." }, 401);
    const asUser = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: { user }, error: uErr } = await asUser.auth.getUser(token);
    if (uErr || !user) return json({ error: "Não autenticado." }, 401);

    const admin = createClient(url, serviceKey);

    // Validar admin: email em platform_admins OU perfil com is_admin.
    let isAdmin = false;
    let eotManager = false;
    if (user.email) {
      const { data: pa } = await admin.from("platform_admins").select("email")
        .eq("email", user.email.toLowerCase()).maybeSingle();
      isAdmin = !!pa;
    }
    if (!isAdmin && user.email) {
      const { data: u } = await admin.from("app_users").select("perfil").ilike("email", user.email).maybeSingle();
      if (u?.perfil) {
        const { data: r } = await admin.from("app_roles").select("is_admin, permissions").eq("name", u.perfil).maybeSingle();
        isAdmin = !!r?.is_admin;
        eotManager = (r?.permissions as Record<string, string> | null)?.["end-of-term:todos"] === "edit";
      }
    }

    const body = await req.json().catch(() => ({}));
    const action = body?.action as string;

    if (!isAdmin && !(eotManager && action === "create")) {
      return json({ error: "Sem permissão de administrador." }, 403);
    }

    if (action === "create") {
      const { nome, email, password, perfil, local, negocio, marca } = body;
      if (!email || !password) return json({ error: "Email e password são obrigatórios." }, 400);

      if (!isAdmin) {
        // Gestor do End-of-Term: só funções com acesso ao End-of-Term e nunca administradoras.
        const { data: target } = await admin.from("app_roles").select("is_admin, permissions")
          .eq("name", String(perfil ?? "")).maybeSingle();
        const eotLevel = (target?.permissions as Record<string, string> | null)?.["end-of-term"];
        if (!target || target.is_admin || !(eotLevel === "view" || eotLevel === "edit")) {
          return json({ error: "Só pode criar utilizadores com funções de End-of-Term (não administradoras)." }, 403);
        }
      }

      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { nome, perfil },
      });
      if (cErr || !created?.user) return json({ error: cErr?.message ?? "Falha a criar login." }, 400);

      const { data: row, error: iErr } = await admin.from("app_users")
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

      // Reposição de password envia só { id, password } (patch vazio). Um UPDATE vazio
      // não devolve linhas e o .single() falhava com "Cannot coerce the result to a
      // single JSON object". Sem alterações, só lemos a linha.
      const hasPatch = !!patch && typeof patch === "object" && Object.keys(patch).length > 0;
      const { data: row, error: e1 } = hasPatch
        ? await admin.from("app_users").update(patch).eq("id", id).select(USER_COLS).maybeSingle()
        : await admin.from("app_users").select(USER_COLS).eq("id", id).maybeSingle();
      if (e1) return json({ error: e1.message }, 400);
      if (!row) return json({ error: "Utilizador não encontrado." }, 400);

      if (password) {
        if (String(password).length < 6) return json({ error: "A password deve ter pelo menos 6 caracteres." }, 400);
        const authUser = await findAuthUserByEmail(admin, row.email);
        if (!authUser) return json({ error: "Este utilizador não tem login de acesso." }, 400);
        const { error: pErr } = await admin.auth.admin.updateUserById(authUser.id, { password: String(password) });
        if (pErr) return json({ error: "Erro ao alterar a password: " + pErr.message }, 400);
      }
      return json({ user: row });
    }

    if (action === "delete") {
      const { id } = body;
      if (!id) return json({ error: "id em falta." }, 400);
      const { data: row } = await admin.from("app_users").select("email").eq("id", id).maybeSingle();
      const { error: dErr } = await admin.from("app_users").delete().eq("id", id);
      if (dErr) return json({ error: dErr.message }, 400);
      if (row?.email) {
        const authUser = await findAuthUserByEmail(admin, row.email);
        if (authUser) await admin.auth.admin.deleteUser(authUser.id);
      }
      return json({ ok: true });
    }

    if (action === "save_role") {
      const { name, permissions, is_admin } = body;
      if (!name || !String(name).trim()) return json({ error: "Nome da função em falta." }, 400);
      const { data: row, error: rErr } = await admin.from("app_roles")
        .upsert({ name: String(name).trim(), permissions: permissions ?? {}, is_admin: !!is_admin }, { onConflict: "name" })
        .select("name, is_admin, permissions").single();
      if (rErr) return json({ error: rErr.message }, 400);
      return json({ role: row });
    }

    if (action === "rename_role") {
      const { name, new_name } = body;
      const to = String(new_name ?? "").trim();
      if (!name || !to) return json({ error: "Nome da função em falta." }, 400);
      if (to === name) return json({ error: "O novo nome é igual ao atual." }, 400);
      const { data: old } = await admin.from("app_roles")
        .select("name, is_admin, permissions").eq("name", name).maybeSingle();
      if (!old) return json({ error: "Função não encontrada." }, 404);
      const { data: all } = await admin.from("app_roles").select("name");
      if ((all ?? []).some((r) => r.name !== name && String(r.name).toLowerCase() === to.toLowerCase())) {
        return json({ error: "Já existe uma função com esse nome." }, 400);
      }
      // O nome é a chave da função e é o que os utilizadores guardam em `perfil`, por
      // isso: 1) cria a função com o novo nome, 2) passa os utilizadores, 3) apaga a
      // antiga. Se o passo 2 falhar, desfaz o 1 e nada muda.
      const { error: cErr } = await admin.from("app_roles")
        .insert({ name: to, permissions: old.permissions, is_admin: old.is_admin });
      if (cErr) return json({ error: cErr.message }, 400);
      const { error: uErr } = await admin.from("app_users").update({ perfil: to }).eq("perfil", name);
      if (uErr) {
        await admin.from("app_roles").delete().eq("name", to);
        return json({ error: uErr.message }, 400);
      }
      const { error: dErr } = await admin.from("app_roles").delete().eq("name", name);
      if (dErr) return json({ error: `Renomeada, mas não foi possível remover o nome antigo: ${dErr.message}` }, 500);
      return json({ role: { name: to, permissions: old.permissions, is_admin: old.is_admin } });
    }

    if (action === "delete_role") {
      const { name } = body;
      if (!name) return json({ error: "Nome da função em falta." }, 400);
      // Não permitir eliminar funções em uso.
      const { count } = await admin.from("app_users")
        .select("id", { count: "exact", head: true }).eq("perfil", name);
      if ((count ?? 0) > 0) return json({ error: "Função em uso por utilizadores." }, 400);
      const { data: role } = await admin.from("app_roles").select("is_admin").eq("name", name).maybeSingle();
      if (role?.is_admin) return json({ error: "Não é possível eliminar uma função de administrador." }, 400);
      const { error: dErr } = await admin.from("app_roles").delete().eq("name", name);
      if (dErr) return json({ error: dErr.message }, 400);
      return json({ ok: true });
    }

    return json({ error: "Ação desconhecida." }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
