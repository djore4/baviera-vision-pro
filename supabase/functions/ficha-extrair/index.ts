// Edge function ficha-extrair — lê um contrato (PDF) ou imagem (PNG/JPEG) e devolve os
// valores económicos para preencher a Ficha de Margem.
//
// PRIVACIDADE: o ficheiro só passa por aqui para ser lido; NÃO se guarda e o conteúdo
// NÃO se regista em log. O modelo é instruído a devolver apenas o número do contrato e
// valores económicos — nunca nomes, NIF, moradas ou contactos de pessoas.
//
// Piloto: só administradores. Precisa do segredo ANTHROPIC_API_KEY.
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

const MODEL = "claude-sonnet-5-5";
const MAX_BASE64 = 8 * 1024 * 1024; // ~6 MB de ficheiro
const TIPOS = ["application/pdf", "image/png", "image/jpeg"];

// Os nomes dos campos são os do estado da página FichaMargemPage (guardados por um teste).
const num = (d: string) => ({ type: ["number", "null"], description: d });
const txt = (d: string) => ({ type: ["string", "null"], description: d });

const SCHEMA = {
  type: "object",
  properties: {
    docTipo: { type: ["string", "null"], enum: ["Proposta", "Contrato", null], description: "O documento é uma Proposta ou um Contrato." },
    docNum: txt("Número do contrato (ou da proposta) tal como aparece no documento."),
    natureza: { type: ["string", "null"], enum: ["VN", "VD", null], description: "VN = viatura nova (sem matrícula anterior); VD = viatura usada/demonstração com matrícula." },
    modelo: txt("Modelo e versão da viatura, em texto curto."),
    encChass: txt("Número de encomenda e/ou chassis."),
    pagamento: { type: ["string", "null"], enum: ["BMW FS", "Financiamento Interno", "Financiamento Externo", "Pronto Pagamento", null], description: "Forma de pagamento." },
    matricula: txt("Matrícula (só viaturas usadas)."),
    dataMatricula: txt("Data da primeira matrícula, formato AAAA-MM-DD (só viaturas usadas)."),
    pvb: num("PVB: preço base da viatura, sem IVA, em euros."),
    opc: num("OPC: total de opcionais, sem IVA, em euros."),
    bsi: num("BSI, em euros."),
    eco: num("ECO (ecovalor/eco-taxa), em euros."),
    legTr: num("LEG/TR: legalização e transporte, em euros."),
    isv: num("ISV, em euros."),
    recond: num("Recondicionamento, em euros."),
    ofertas: num("Valor das ofertas/brindes incluídos, em euros."),
    precoVenda: num("Preço de venda final ao cliente, COM IVA, em euros."),
    ivaPct: num("Taxa de IVA em percentagem (ex.: 23)."),
    mgFixaPct: num("Margem fixa, em % sobre PVB+OPC."),
    mgVarPct: num("Margem variável, em % sobre PVB+OPC."),
    pacPct: num("PAC, em % sobre PVB+OPC."),
    apoioFrotaPct: num("Apoio frota, em % sobre PVB+OPC."),
    apoioDemoPct: num("Apoio demo, em % sobre PVB+OPC."),
    deprec: num("Depreciações, em euros (valor absoluto)."),
    bonusMPct: num("Bónus M, em % sobre PVB+OPC."),
    incerto: {
      type: "array",
      items: { type: "string" },
      description: "Nomes dos campos acima (ex.: \"pvb\") de que NÃO tens a certeza, ou que leste de forma ambígua.",
    },
    notas: txt("Uma frase curta sobre dúvidas ou campos que pareciam existir mas não consegui ler."),
  },
  required: ["incerto"],
};

const SYSTEM = `Lês documentos de venda automóvel (contratos e propostas BMW de um concessionário português) e extrais os valores económicos para uma Ficha de Margem.

Regras:
- Responde SEMPRE chamando a ferramenta registar_ficha, sem texto antes nem depois.
- Extrai apenas o que está escrito no documento. Se um campo não existe ou não é legível, devolve null. NUNCA inventes nem estimes valores.
- Valores monetários: números em euros, ponto como separador decimal, sem símbolo nem milhares (ex.: 31450.5). Percentagens: o número (ex.: 5 para 5 %).
- PVB, OPC, BSI, ECO, LEG/TR e ISV são valores SEM IVA. precoVenda é o preço final pago pelo cliente COM IVA.
- Privacidade: NÃO devolvas nome, NIF, morada, contactos nem qualquer dado pessoal. Do cliente não devolvas nada (o tipo de cliente é preenchido pelo utilizador). Da identificação só o número do contrato.
- NÃO preenchas apoios adicionais nem descontos: esses campos não existem na ferramenta e ficam em branco na ficha.
- Se um campo for ambíguo (vários valores possíveis, texto cortado, ilegível), devolve o melhor palpite E acrescenta o nome do campo a "incerto".`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método não suportado." }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");

    // Quem chama: validamos o token nós próprios (como admin-users).
    const token = (req.headers.get("Authorization") ?? "").replace(/^[Bb]earer\s+/, "").trim();
    if (!token) return json({ error: "Não autenticado." }, 401);
    const asUser = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: { user }, error: uErr } = await asUser.auth.getUser(token);
    if (uErr || !user?.email) return json({ error: "Não autenticado." }, 401);

    // Piloto: só administradores (email em platform_admins OU perfil com is_admin).
    const admin = createClient(url, serviceKey);
    let isAdmin = false;
    const { data: pa } = await admin.from("platform_admins").select("email")
      .eq("email", user.email.toLowerCase()).maybeSingle();
    isAdmin = !!pa;
    if (!isAdmin) {
      const { data: u } = await admin.from("app_users").select("perfil").ilike("email", user.email).maybeSingle();
      if (u?.perfil) {
        const { data: r } = await admin.from("app_roles").select("is_admin").eq("name", u.perfil).maybeSingle();
        isAdmin = !!r?.is_admin;
      }
    }
    if (!isAdmin) return json({ error: "Sem permissão (funcionalidade em piloto)." }, 403);

    if (!apiKey) return json({ error: "SEM_CHAVE", message: "Falta configurar a chave da API (ANTHROPIC_API_KEY)." }, 500);

    const body = await req.json().catch(() => ({}));
    const mediaType = String(body?.media_type ?? "");
    const data = String(body?.data ?? "");
    if (!TIPOS.includes(mediaType)) return json({ error: "Formato não suportado (PDF, PNG ou JPEG)." }, 400);
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
        max_tokens: 2000,
        system: SYSTEM,
        tools: [{
          name: "registar_ficha",
          description: "Regista os valores extraídos do documento para a Ficha de Margem.",
          input_schema: SCHEMA,
        }],
        // Este modelo não aceita forçar a ferramenta (tool_choice "tool"/"any" dá 400): fica em
        // "auto" e o SYSTEM manda chamar sempre registar_ficha.
        tool_choice: { type: "auto" },
        messages: [{
          role: "user",
          content: [fileBlock, { type: "text", text: "Extrai os dados deste documento para a Ficha de Margem." }],
        }],
      }),
    });

    if (!resp.ok) {
      // Só se regista e devolve o TIPO e a mensagem de erro da API (descrevem o pedido, não
      // o documento); o corpo do pedido e o conteúdo do ficheiro nunca.
      const err = await resp.json().catch(() => null);
      const tipo = String(err?.error?.type ?? "");
      const detalhe = String(err?.error?.message ?? "").slice(0, 300);
      console.error(`ficha-extrair: API ${resp.status} ${tipo}: ${detalhe}`);
      return json({
        error: "ERRO_LEITURA",
        message: `O serviço de leitura falhou (${resp.status}${tipo ? " " + tipo : ""}).`,
        detalhe,
      }, 502);
    }
    const out = await resp.json();
    const blocos: { type: string; input?: unknown; text?: string }[] = out?.content ?? [];
    let campos = blocos.find((b) => b.type === "tool_use")?.input as Record<string, unknown> | undefined;
    if (!campos) {
      // Rede de segurança: o modelo respondeu em texto com um objeto JSON.
      const texto = blocos.filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n");
      const m = texto.match(/\{[\s\S]*\}/);
      try { campos = m ? JSON.parse(m[0]) : undefined; } catch { campos = undefined; }
    }
    if (!campos || typeof campos !== "object") {
      console.error(`ficha-extrair: sem dados (stop_reason=${out?.stop_reason})`);
      return json({ error: "ERRO_LEITURA", message: "Não foi possível ler o documento.", detalhe: `stop_reason=${out?.stop_reason ?? "?"}` }, 502);
    }
    return json({ campos });
  } catch (_e) {
    return json({ error: "ERRO_LEITURA", message: "Erro inesperado ao ler o documento." }, 500);
  }
});
