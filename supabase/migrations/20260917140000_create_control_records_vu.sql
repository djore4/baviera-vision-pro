-- Registos de control das Viaturas Usadas (sheet CONTROL do ficheiro VU).
-- Schema idêntico ao control_records (VN), tabela separada para não misturar
-- os dados. RLS permissiva (auth_only), como as restantes tabelas da app.
CREATE TABLE IF NOT EXISTS public.control_records_vu (LIKE public.control_records INCLUDING ALL);

ALTER TABLE public.control_records_vu ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_only" ON public.control_records_vu;
CREATE POLICY "auth_only" ON public.control_records_vu
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
