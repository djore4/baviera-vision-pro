// Edge function importar-extrair — lê uma imagem (print/captura) ou PDF de um mapa ou relatório
// e devolve as linhas em formato estruturado, para o botão "Importar" propor alterações.
//
// Tipos reconhecidos:
//   · mapa_retail — "Mapas de Retail - Veículos Novos" (portal BMW): chassis, matrícula, datas.
//   · faturas     — relatório/lista de faturas de venda: chassis (VIN), data de fatura, total.
//
// PRIVACIDADE: o ficheiro só passa por aqui para ser lido; NÃO se guarda e o conteúdo NÃO se
// regista em log. O modelo devolve só identificadores de viatura, datas e valores — nunca
// nomes, NIF, moradas ou contactos de pessoas.
//
// Só administradores (como o botão Sincronizar). Precisa do segredo ANTHROPIC_API_KEY.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });

const MODEL = "claude-sonnet-5-5";
const MAX_BASE64 = 8 * 1024 * 1024; // ~6 MB de ficheiro
const TIPOS = ["application/pdf", "image/png", "image/jpeg", "image/webp"];

const txt = (d: string) => ({ type: ["string", "null"], description: d });
const num = (d: string) => ({ type: ["number", "null"], description: d });

// Os nomes dos campos são os de src/lib/importar.ts (um teste garante que batem).
const SCHEMA = {
  type: "object",
  properties: {
    tipo: { type: "string", enum: ["mapa_retail", "faturas", "desconhecido"], description: "Que documento é." },
    linhas: {
      type: "array",
      description: "Uma entrada por viatura, pela ordem do documento.",
      items: {
        type: "object",
        properties: {
          enc: txt("Número de encomenda (coluna «Nº Enc.»), só dígitos/letras, tal como aparece."),
          chassis: txt("Chassis/VIN completo (17 caracteres) ou o que estiver visível."),
          matricula: txt("Matrícula, formato AA-00-AA (coluna «Matrícula»)."),
          dataPedidoMatricula: txt("Coluna «Data Pedido Matrícula», AAAA-MM-DD (ignora a hora)."),
          dataMatricula: txt("Coluna «Data Matrícula», AAAA-MM-DD."),
          data298: txt("Coluna «Data de 298», AAAA-MM-DD (ignora a hora)."),
          dataEntrega: txt("Coluna «Data Entrega», AAAA-MM-DD (ignora a hora)."),
          dfat: txt("Data de fatura de venda, AAAA-MM-DD (só em faturas)."),
          total: num("Total da venda em euros, negativo se for nota de crédito (só em faturas)."),
        },
      },
    },
    incerto: { type: "array", items: { type: "string" }, description: "Chassis (ou enc) das linhas de que NÃO tens a certeza." },
    notas: txt("Uma frase curta sobre dúvidas ou partes que não consegui ler."),
  },
  required: ["tipo", "linhas"],
};

const SYSTEM = `Lês capturas de ecrã, fotografias e PDF de um concessionário BMW português e extrais as linhas de uma tabela para uma plataforma de gestão.

Regras:
- Responde SEMPRE chamando a ferramenta registar_linhas, sem texto antes nem depois.
- Identifica o tipo: "mapa_retail" (título «Mapas de Retail - Veículos Novos», colunas Marca, Nº Enc., Modelo, Chassis, Matrícula, Data Pedido Matrícula, Data Matrícula, Data de 298, Data Entrega…), "faturas" (lista de faturas de venda com VIN/chassis, data de fatura e total) ou "desconhecido".
- Extrai UMA entrada por linha de viatura, sem saltar nenhuma. Extrai apenas o que está escrito: se uma célula está vazia ou ilegível, devolve null. NUNCA inventes nem completes chassis, matrículas ou datas.
- Datas em AAAA-MM-DD (o documento usa DD/MM/AAAA: «12/11/2026 09:53:53» → 2026-11-12). Ignora as horas.
- Chassis: copia caracter a caracter (sem espaços). Os VIN não têm as letras I, O, Q: se tiveres dúvida entre 0/O ou 1/I, assume o algarismo e acrescenta o chassis a "incerto".
- Linhas de cabeçalho, filtros e rodapés não são viaturas.
- Privacidade: NÃO devolvas nomes, NIF, moradas, contactos nem qualquer dado pessoal. Só identificadores de viatura, datas e valores.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método não suportado." }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");

    const token = (req.headers.get("Authorization") ?? "").replace(/^[Bb]earer\s+/, "").trim();
    if (!token) return json({ error: "Não autenticado." }, 401);
    const asUser = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: { user }, error: uErr } = await asUser.auth.getUser(token);
    if (uErr || !user?.email) return json({ error: "Não autenticado." }, 401);

    // Só administradores (a mesma regra do botão Sincronizar).
    const admin = createClient(url, serviceKey);
    const { data: pa } = await admin.from("platform_admins").select("email").eq("email", user.email.toLowerCase()).maybeSingle();
    let isAdmin = !!pa;
    if (!isAdmin) {
      const { data: u } = await admin.from("app_users").select("perfil").ilike("email", user.email).maybeSingle();
      if (u?.perfil) {
        const { data: r } = await admin.from("app_roles").select("is_admin").eq("name", u.perfil).maybeSingle();
        isAdmin = !!r?.is_admin;
      }
    }
    if (!isAdmin) return json({ error: "Sem permissão de administrador." }, 403);

    if (!apiKey) return json({ error: "SEM_CHAVE", message: "Falta configurar a chave da API (ANTHROPIC_API_KEY)." }, 500);

    const body = await req.json().catch(() => ({}));
    const mediaType = String(body?.media_type ?? "");
    const data = String(body?.data ?? "");
    if (!TIPOS.includes(mediaType)) return json({ error: "Formato não suportado (PDF, PNG, JPEG ou WebP)." }, 400);
    if (!data) return json({ error: "Ficheiro em falta." }, 400);
    if (data.length > MAX_BASE64) return json({ error: "Ficheiro demasiado grande (máx. ~6 MB)." }, 413);

    const fileBlock = mediaType === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: mediaType, data } }
      : { type: "image", source: { type: "base64", media_type: mediaType, data } };

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 8000,
        system: SYSTEM,
        tools: [{
          name: "registar_linhas",
          description: "Regista as linhas (viaturas) extraídas do documento.",
          input_schema: SCHEMA,
        }],
        // Este modelo não aceita forçar a ferramenta: fica em "auto" e o SYSTEM manda chamá-la.
        tool_choice: { type: "auto" },
        messages: [{
          role: "user",
          content: [fileBlock, { type: "text", text: "Extrai as linhas deste documento." }],
        }],
      }),
    });

    if (!resp.ok) {
      // Só o TIPO e a mensagem de erro da API (descrevem o pedido, não o documento).
      const err = await resp.json().catch(() => null);
      const tipo = String(err?.error?.type ?? "");
      const detalhe = String(err?.error?.message ?? "").slice(0, 300);
      console.error(`importar-extrair: API ${resp.status} ${tipo}: ${detalhe}`);
      return json({ error: "ERRO_LEITURA", message: `O serviço de leitura falhou (${resp.status}${tipo ? " " + tipo : ""}).`, detalhe }, 502);
    }
    const out = await resp.json();
    const blocos: { type: string; input?: unknown; text?: string }[] = out?.content ?? [];
    let resultado = blocos.find((b) => b.type === "tool_use")?.input as Record<string, unknown> | undefined;
    if (!resultado) {
      const texto = blocos.filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n");
      const m = texto.match(/\{[\s\S]*\}/);
      try { resultado = m ? JSON.parse(m[0]) : undefined; } catch { resultado = undefined; }
    }
    if (!resultado || typeof resultado !== "object") {
      console.error(`importar-extrair: sem dados (stop_reason=${out?.stop_reason})`);
      return json({ error: "ERRO_LEITURA", message: "Não foi possível ler o documento.", detalhe: `stop_reason=${out?.stop_reason ?? "?"}` }, 502);
    }
    return json({ resultado });
  } catch (_e) {
    return json({ error: "ERRO_LEITURA", message: "Erro inesperado ao ler o documento." }, 500);
  }
});
