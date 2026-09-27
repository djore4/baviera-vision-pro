-- Administrador da plataforma = email em platform_admins.
-- Substitui o email de admin que estava fixo no frontend e na edge function
-- admin-users. A tabela continua sem políticas; o frontend só pergunta, via
-- RPC, se o utilizador atual é admin.
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.platform_admins p
    where p.email = lower(auth.jwt() ->> 'email')
  );
$$;

revoke all on function public.is_platform_admin() from public, anon;
grant execute on function public.is_platform_admin() to authenticated;
