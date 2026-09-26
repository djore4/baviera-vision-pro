-- Retomas — repositório e stock de viaturas de retoma. Domínio isolado.
-- Segue o padrão das restantes tabelas desta plataforma: RLS ativo mas
-- permissivo (auth_only USING(true)); o controlo de acesso ao tab é feito na
-- app pela matriz de permissões (app_roles.permissions['retoma']).

CREATE TABLE IF NOT EXISTS public.retomas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marca text NOT NULL,
  modelo text NOT NULL,
  -- Motorização: combustão (ice), híbrido plug-in (phev) ou 100% elétrico (bev).
  motorizacao text CHECK (motorizacao IN ('ice','phev','bev')),
  matricula text,
  data_matricula date,
  quilometragem int CHECK (quilometragem IS NULL OR quilometragem >= 0),
  importado boolean NOT NULL DEFAULT false,
  link_caetano text,
  link_maxterauto text,
  link_fotos text,
  -- Arquivada = fora da carteira ativa (venda concluída/desistência), mantida
  -- para consulta histórica.
  arquivada boolean NOT NULL DEFAULT false,
  arquivada_at timestamptz,
  created_by text,                 -- email de quem inseriu
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS retomas_arquivada_idx ON public.retomas (arquivada);
CREATE INDEX IF NOT EXISTS retomas_matricula_idx ON public.retomas (matricula);
CREATE INDEX IF NOT EXISTS retomas_created_idx   ON public.retomas (created_at DESC);

ALTER TABLE public.retomas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_only" ON public.retomas;
CREATE POLICY "auth_only" ON public.retomas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- updated_at automático (reutiliza a função partilhada crm_set_updated_at).
CREATE OR REPLACE FUNCTION public.crm_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS retomas_updated_at ON public.retomas;
CREATE TRIGGER retomas_updated_at
  BEFORE UPDATE ON public.retomas
  FOR EACH ROW EXECUTE FUNCTION public.crm_set_updated_at();
