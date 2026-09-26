-- Reestrutura os utilizadores dos demonstradores em dois:
--   demo_pessoas   → o roster (lançado no tab Utilizadores)
--   demo_afetacoes → que pessoa está em que viatura (afetação feita no Demos)
-- Substitui a tabela demo_utilizadores (modelo antigo chassis→nome).
DROP TABLE IF EXISTS public.demo_utilizadores;

CREATE TABLE IF NOT EXISTS public.demo_pessoas (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.demo_pessoas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_only" ON public.demo_pessoas;
CREATE POLICY "auth_only" ON public.demo_pessoas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.demo_afetacoes (
  chassis    text NOT NULL,
  pessoa_id  uuid NOT NULL REFERENCES public.demo_pessoas(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chassis, pessoa_id)
);
CREATE INDEX IF NOT EXISTS demo_afetacoes_chassis_idx ON public.demo_afetacoes (chassis);
ALTER TABLE public.demo_afetacoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_only" ON public.demo_afetacoes;
CREATE POLICY "auth_only" ON public.demo_afetacoes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
