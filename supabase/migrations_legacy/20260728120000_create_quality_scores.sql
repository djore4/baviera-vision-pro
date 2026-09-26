-- Qualidade — notas mensais do serviço (tab admin "Qualidade").
-- Uma linha por mês; cada coluna é uma dimensão do gráfico de aranha.
CREATE TABLE IF NOT EXISTS public.quality_scores (
  year         integer NOT NULL,
  month        integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  retails      numeric NOT NULL DEFAULT 0,
  contratos    numeric NOT NULL DEFAULT 0,
  atitude      numeric NOT NULL DEFAULT 0,
  atendimento  numeric NOT NULL DEFAULT 0,
  assiduidade  numeric NOT NULL DEFAULT 0,
  equipa       numeric NOT NULL DEFAULT 0,
  nps100       numeric NOT NULL DEFAULT 0,
  updated_by   text,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (year, month)
);

ALTER TABLE public.quality_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_only" ON public.quality_scores;
CREATE POLICY "auth_only" ON public.quality_scores
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- updated_at automático (reutiliza a função partilhada).
CREATE OR REPLACE FUNCTION public.crm_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS quality_scores_updated_at ON public.quality_scores;
CREATE TRIGGER quality_scores_updated_at
  BEFORE UPDATE ON public.quality_scores
  FOR EACH ROW EXECUTE FUNCTION public.crm_set_updated_at();
