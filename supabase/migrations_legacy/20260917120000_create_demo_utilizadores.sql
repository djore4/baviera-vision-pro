-- Utilizadores atuais de cada viatura demonstradora (por chassis). Vários por
-- viatura. Própria desta plataforma (não toca no schema partilhado `viaturas`).
-- RLS ativo mas permissivo (auth_only), como as restantes tabelas da app.
CREATE TABLE IF NOT EXISTS public.demo_utilizadores (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chassis    text NOT NULL,
  nome       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS demo_utilizadores_chassis_idx ON public.demo_utilizadores (chassis);

ALTER TABLE public.demo_utilizadores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_only" ON public.demo_utilizadores;
CREATE POLICY "auth_only" ON public.demo_utilizadores
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
