-- Perfis de acesso (RBAC) — permissões por função sobre os vários tabs.
-- A função de cada utilizador é dada por public.utilizadores.perfil (texto),
-- que corresponde a app_roles.name. As permissões são um mapa
-- { <tab>: 'none' | 'view' | 'edit' }. Funções com is_admin têm acesso total.

CREATE TABLE IF NOT EXISTS public.app_roles (
  name text PRIMARY KEY,
  is_admin boolean NOT NULL DEFAULT false,
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_only" ON public.app_roles;
CREATE POLICY "auth_only" ON public.app_roles
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.crm_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS app_roles_updated_at ON public.app_roles;
CREATE TRIGGER app_roles_updated_at
  BEFORE UPDATE ON public.app_roles
  FOR EACH ROW EXECUTE FUNCTION public.crm_set_updated_at();

-- Seed das funções existentes (permissões iniciais; ajustáveis no tab Utilizadores).
INSERT INTO public.app_roles (name, is_admin, permissions) VALUES
  ('Administrador', true, '{}'::jsonb),
  ('Chefe de Vendas', false, '{
     "retails":"view","funil":"edit","producao":"view","carteira":"edit",
     "pendentes":"edit","ficha-margem":"edit","escala":"edit","emprestimos":"edit",
     "vendedores":"view","fidelizacao":"edit","lavagem":"edit"
   }'::jsonb),
  ('Vendedor', false, '{
     "retails":"view","funil":"view","carteira":"view","pendentes":"view",
     "ficha-margem":"view","escala":"view","emprestimos":"view","lavagem":"edit"
   }'::jsonb)
ON CONFLICT (name) DO NOTHING;

-- Endurecer a tabela de utilizadores: passa a exigir autenticação (estava exposta).
ALTER TABLE public.utilizadores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_only" ON public.utilizadores;
CREATE POLICY "auth_only" ON public.utilizadores
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
