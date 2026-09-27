-- Restaurar a tabela utilizadores ao estado original (partilhada com outra
-- plataforma) — remover o RLS que tinha sido adicionado.
DROP POLICY IF EXISTS "read_authenticated" ON public.utilizadores;
DROP POLICY IF EXISTS "auth_only" ON public.utilizadores;
ALTER TABLE public.utilizadores DISABLE ROW LEVEL SECURITY;

-- Tabela de utilizadores dedicada a ESTA plataforma.
CREATE TABLE IF NOT EXISTS public.app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text,
  email text UNIQUE,
  perfil text,
  local jsonb,
  negocio jsonb,
  marca jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_authenticated" ON public.app_users;
CREATE POLICY "read_authenticated" ON public.app_users
  FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.crm_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS app_users_updated_at ON public.app_users;
CREATE TRIGGER app_users_updated_at
  BEFORE UPDATE ON public.app_users
  FOR EACH ROW EXECUTE FUNCTION public.crm_set_updated_at();

-- Seed inicial: Administrador + Vendedores (as contas que não pertencem à
-- outra plataforma). Os Chefes de Vendas não são copiados.
INSERT INTO public.app_users (nome, email, perfil, local, negocio, marca) VALUES
  ('Administrador', 'admin@caetano.pt', 'Administrador',
     '["Todas"]'::jsonb, '["VN","VU"]'::jsonb, '["BMW","MINI"]'::jsonb),
  ('Vendedores', 'caetanosalesforce@caetano.pt', 'Vendedor',
     '["Todas"]'::jsonb, '["VN"]'::jsonb, '["BMW"]'::jsonb)
ON CONFLICT (email) DO NOTHING;
