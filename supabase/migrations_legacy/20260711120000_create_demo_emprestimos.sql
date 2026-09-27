-- Empréstimos / alocações de viaturas de demonstração (linha cronológica)
CREATE TABLE IF NOT EXISTS public.demo_emprestimos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  demo_id uuid NOT NULL REFERENCES public.demos(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('interno', 'cliente')),
  utilizador_id bigint REFERENCES public.utilizadores(id) ON DELETE SET NULL,
  alocado_nome text NOT NULL,
  notas text,
  inicio timestamptz NOT NULL,
  fim timestamptz NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT demo_emprestimos_periodo_valido CHECK (fim > inicio)
);

CREATE INDEX IF NOT EXISTS demo_emprestimos_demo_id_idx ON public.demo_emprestimos (demo_id);
CREATE INDEX IF NOT EXISTS demo_emprestimos_periodo_idx ON public.demo_emprestimos (inicio, fim);

ALTER TABLE public.demo_emprestimos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_only" ON public.demo_emprestimos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
