-- Angariações de viaturas usadas (sheet ANGARIAÇÃO do ficheiro VU).
-- Snapshot da sheet: cada importação do ficheiro VU substitui o conteúdo.
-- RLS permissiva (auth_only), como as restantes tabelas da app.
CREATE TABLE IF NOT EXISTS public.angariacoes_vu (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dt_ang date,
  resp text,
  cliente text,
  angar text,          -- canal: INTERNA | EXTERNA | NET | CONSIG
  mat text,
  model text,
  version text,
  ano integer,
  kms integer,
  v_compra numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.angariacoes_vu ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_only" ON public.angariacoes_vu;
CREATE POLICY "auth_only" ON public.angariacoes_vu
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
