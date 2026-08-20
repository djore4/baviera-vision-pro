-- Prospeção Comercial (CRM interno de contas empresariais) — domínio isolado.
-- Segue o padrão das restantes tabelas desta plataforma: RLS ativo mas permissivo
-- (auth_only USING(true)); o isolamento vendedor/diretor é feito na app por
-- owner_email (o diretor/admin vê tudo, o vendedor filtra pelas suas próprias).

-- ── Contas (empresas prospetadas) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.prospec_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  setor text,
  -- Avaliações 1–5
  potencial int CHECK (potencial BETWEEN 1 AND 5),
  dimensao_frota int CHECK (dimensao_frota BETWEEN 1 AND 5),
  relacao int CHECK (relacao BETWEEN 1 AND 5),
  -- Score composto: média ponderada (potencial 0.5 · dimensão frota 0.3 · relação 0.2).
  -- Coluna gerada para permitir ordenar/filtrar por score diretamente em SQL.
  -- Os mesmos pesos estão espelhados em src/lib/prospec.ts (SCORE_WEIGHTS).
  score numeric GENERATED ALWAYS AS (
    round(
      (COALESCE(potencial, 0) * 0.5
       + COALESCE(dimensao_frota, 0) * 0.3
       + COALESCE(relacao, 0) * 0.2)::numeric,
      2
    )
  ) STORED,
  fase text NOT NULL DEFAULT 'novo'
    CHECK (fase IN ('novo','contactado','reuniao','proposta','negociacao','ganho','perdido')),
  fonte text
    CHECK (fonte IN ('geografica','lookalike','indicacao','lusha','outro')),
  owner_email text,                -- vendedor responsável (utilizador autenticado)
  owner_nome text,                 -- nome apresentado do responsável
  created_by text,                 -- email de quem criou
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS prospec_accounts_owner_idx ON public.prospec_accounts (owner_email);
CREATE INDEX IF NOT EXISTS prospec_accounts_fase_idx  ON public.prospec_accounts (fase);
CREATE INDEX IF NOT EXISTS prospec_accounts_score_idx ON public.prospec_accounts (score);

ALTER TABLE public.prospec_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_only" ON public.prospec_accounts;
CREATE POLICY "auth_only" ON public.prospec_accounts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── Contactos (por empresa) ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.prospec_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.prospec_accounts(id) ON DELETE CASCADE,
  nome text NOT NULL,
  cargo text,
  email text,
  telefone text,
  fonte text,                      -- fonte do contacto (ex.: Lusha); livre
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS prospec_contacts_account_idx ON public.prospec_contacts (account_id);

ALTER TABLE public.prospec_contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_only" ON public.prospec_contacts;
CREATE POLICY "auth_only" ON public.prospec_contacts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── Interações (histórico cronológico) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.prospec_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.prospec_accounts(id) ON DELETE CASCADE,
  tipo text NOT NULL DEFAULT 'chamada'
    CHECK (tipo IN ('chamada','email','reuniao','visita')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  autor text,                      -- email/nome de quem registou
  nota text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS prospec_interactions_account_idx ON public.prospec_interactions (account_id, occurred_at DESC);

ALTER TABLE public.prospec_interactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_only" ON public.prospec_interactions;
CREATE POLICY "auth_only" ON public.prospec_interactions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── Tarefas (tabela única: to-do · próxima ação · compromisso) ───────────────
-- type = 'todo'        → tarefa solta do vendedor (não ligada a conta)
--        'next_action' → próxima ação de uma conta (account_id preenchido)
--        'appointment' → compromisso/agenda (account_id opcional)
-- "Atrasados" = qualquer linha com done=false AND due_at < now().
CREATE TABLE IF NOT EXISTS public.prospec_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL DEFAULT 'todo'
    CHECK (type IN ('todo','next_action','appointment')),
  account_id uuid REFERENCES public.prospec_accounts(id) ON DELETE CASCADE,
  owner_email text,                -- vendedor dono da tarefa
  owner_nome text,
  descricao text NOT NULL,
  due_at timestamptz,              -- prazo / início do compromisso
  done boolean NOT NULL DEFAULT false,
  done_at timestamptz,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS prospec_tasks_owner_idx   ON public.prospec_tasks (owner_email);
CREATE INDEX IF NOT EXISTS prospec_tasks_account_idx ON public.prospec_tasks (account_id);
CREATE INDEX IF NOT EXISTS prospec_tasks_open_idx    ON public.prospec_tasks (done, due_at);
CREATE INDEX IF NOT EXISTS prospec_tasks_type_idx    ON public.prospec_tasks (type);

ALTER TABLE public.prospec_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_only" ON public.prospec_tasks;
CREATE POLICY "auth_only" ON public.prospec_tasks
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── updated_at automático (reutiliza a função existente crm_set_updated_at) ───
CREATE OR REPLACE FUNCTION public.crm_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS prospec_accounts_updated_at ON public.prospec_accounts;
CREATE TRIGGER prospec_accounts_updated_at
  BEFORE UPDATE ON public.prospec_accounts
  FOR EACH ROW EXECUTE FUNCTION public.crm_set_updated_at();

DROP TRIGGER IF EXISTS prospec_contacts_updated_at ON public.prospec_contacts;
CREATE TRIGGER prospec_contacts_updated_at
  BEFORE UPDATE ON public.prospec_contacts
  FOR EACH ROW EXECUTE FUNCTION public.crm_set_updated_at();

DROP TRIGGER IF EXISTS prospec_tasks_updated_at ON public.prospec_tasks;
CREATE TRIGGER prospec_tasks_updated_at
  BEFORE UPDATE ON public.prospec_tasks
  FOR EACH ROW EXECUTE FUNCTION public.crm_set_updated_at();
