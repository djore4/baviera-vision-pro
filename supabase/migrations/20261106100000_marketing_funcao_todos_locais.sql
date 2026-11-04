-- Funções com a chave 'acesso:todos-locais' = 'edit' em app_roles.permissions ignoram a
-- restrição por local (ver src/lib/permissions.ts: TODOS_LOCAIS_KEY). O Marketing passa a
-- respeitá-la também na base de dados, para ficar igual à interface.
create or replace function public.marketing_local_ok()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select public.is_app_admin())
    or exists (
      select 1 from public.app_access_exceptions e
      where e.email = lower(auth.jwt() ->> 'email') and e.tab = 'marketing'
    )
    or exists (
      select 1 from public.app_users u
      where lower(u.email) = lower(auth.jwt() ->> 'email') and u.local ? 'Aveiro'
    )
    or exists (
      select 1 from public.app_users u
      join public.app_roles r on r.name = u.perfil
      where lower(u.email) = lower(auth.jwt() ->> 'email')
        and r.permissions ->> 'acesso:todos-locais' = 'edit'
    );
$$;
