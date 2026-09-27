-- Objetivos (metas) de faturas das Viaturas Usadas, por mês (MÊS1 = 'AAAA/MM').
-- Editável na WIP VU; alimenta o gauge de Realização vs Objetivo (só faturas).
CREATE TABLE IF NOT EXISTS public.vu_objetivos (
  mes        text PRIMARY KEY,
  faturas    numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.vu_objetivos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_only" ON public.vu_objetivos;
CREATE POLICY "auth_only" ON public.vu_objetivos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
