-- End-of-Term (EoT) — controlo das terminações de contrato BMW FS.
-- Domínio isolado, segue o padrão das restantes tabelas (RLS ativo mas
-- permissivo: auth_only USING(true)). O isolamento vendedor/diretor faz-se na
-- app (o diretor vê tudo; o vendedor filtra pelo que é seu).
--
-- Diferença deliberada face ao control_records_vu: aqui a importação do mapa NÃO
-- apaga-e-reinsere. A chave natural é o número de contrato e a importação faz
-- UPSERT apenas das colunas-base do mapa. O estado de acompanhamento (fase,
-- responsável, observações) e o histórico/agenda de atividades vivem por
-- contrato e SOBREVIVEM às reimportações mensais — não se perde follow-up.

-- ── Contratos a terminar (base do mapa + estado de acompanhamento) ────────────
CREATE TABLE IF NOT EXISTS public.eot_contracts (
  contrato text PRIMARY KEY,               -- nº de contrato BMW FS (chave natural)
  -- Colunas-base (importadas do mapa; atualizadas por upsert em cada importação)
  concessionario text,
  vendedor text,
  tipo text,                               -- CLEA, CVCR, CSMOTOS, CALD, CSEL, CRTG…
  cliente text,
  contacto text,
  telefone text,
  telemovel text,
  morada text,
  codigo_postal text,
  data_fim date,                           -- fim de contrato (EoT)
  prazo int,                               -- meses
  prestacao numeric,
  kms_contratados numeric,
  matricula text,
  marca text,
  modelo text,
  seguro text,                             -- S/N
  manutencao text,                         -- S/N
  manutencao_tipo text,                    -- pacote de manutenção (2.ª coluna "Manutenção")
  valor_residual numeric,                  -- Valor Residual a Refinanciar
  despesas_finais numeric,
  valor_total numeric,                     -- Valor Total a Pagar
  concessionario_resp text,                -- Concessionário Responsável
  -- Estado de acompanhamento (NÃO é tocado pela importação; persiste)
  fase text NOT NULL DEFAULT 'pendente'
    CHECK (fase IN ('pendente','contactado','proposta_enviada','negociacao','renovado','retomado','perdido','sem_interesse')),
  resultado text,                          -- desfecho livre / detalhe
  obs text,                                -- notas de acompanhamento
  owner_email text,                        -- responsável pelo follow-up (utilizador)
  owner_nome text,
  imported_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS eot_contracts_data_fim_idx  ON public.eot_contracts (data_fim);
CREATE INDEX IF NOT EXISTS eot_contracts_vendedor_idx  ON public.eot_contracts (vendedor);
CREATE INDEX IF NOT EXISTS eot_contracts_fase_idx      ON public.eot_contracts (fase);
CREATE INDEX IF NOT EXISTS eot_contracts_owner_idx     ON public.eot_contracts (owner_email);

ALTER TABLE public.eot_contracts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_only" ON public.eot_contracts;
CREATE POLICY "auth_only" ON public.eot_contracts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── Atividades (agendamentos + histórico) por contrato ───────────────────────
-- Uma única tabela serve o ciclo de vida completo:
--   done=false, due_at no futuro → atividade agendada (chamada/reunião a fazer)
--   done=true                    → atividade realizada (chamada feita, proposta
--                                  enviada, etc.) — o histórico do cliente.
-- "Em atraso" = done=false AND due_at < agora.
CREATE TABLE IF NOT EXISTS public.eot_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato text NOT NULL REFERENCES public.eot_contracts(contrato) ON DELETE CASCADE,
  tipo text NOT NULL DEFAULT 'chamada'
    CHECK (tipo IN ('chamada','email','reuniao','visita','proposta_feita','proposta_enviada','outro')),
  descricao text,
  due_at timestamptz,                      -- agendado para (quando aplicável)
  done boolean NOT NULL DEFAULT false,
  done_at timestamptz,
  autor text,                              -- nome/email de quem registou
  owner_email text,                        -- vendedor dono da atividade
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS eot_activities_contrato_idx ON public.eot_activities (contrato, created_at DESC);
CREATE INDEX IF NOT EXISTS eot_activities_open_idx     ON public.eot_activities (done, due_at);
CREATE INDEX IF NOT EXISTS eot_activities_owner_idx    ON public.eot_activities (owner_email);

ALTER TABLE public.eot_activities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_only" ON public.eot_activities;
CREATE POLICY "auth_only" ON public.eot_activities
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── updated_at automático (reutiliza a função partilhada crm_set_updated_at) ──
CREATE OR REPLACE FUNCTION public.crm_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS eot_contracts_updated_at ON public.eot_contracts;
CREATE TRIGGER eot_contracts_updated_at
  BEFORE UPDATE ON public.eot_contracts
  FOR EACH ROW EXECUTE FUNCTION public.crm_set_updated_at();

DROP TRIGGER IF EXISTS eot_activities_updated_at ON public.eot_activities;
CREATE TRIGGER eot_activities_updated_at
  BEFORE UPDATE ON public.eot_activities
  FOR EACH ROW EXECUTE FUNCTION public.crm_set_updated_at();
