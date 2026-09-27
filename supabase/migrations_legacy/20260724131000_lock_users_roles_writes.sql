-- Escritas em utilizadores/app_roles passam a ser exclusivas do service role
-- (via edge function admin-users, que valida admin). Autenticados só leem.
DROP POLICY IF EXISTS "auth_only" ON public.utilizadores;
DROP POLICY IF EXISTS "read_authenticated" ON public.utilizadores;
CREATE POLICY "read_authenticated" ON public.utilizadores
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_only" ON public.app_roles;
DROP POLICY IF EXISTS "read_authenticated" ON public.app_roles;
CREATE POLICY "read_authenticated" ON public.app_roles
  FOR SELECT TO authenticated USING (true);
