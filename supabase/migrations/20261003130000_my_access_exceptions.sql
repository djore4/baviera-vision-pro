-- Exceções de acesso do utilizador atual, para a interface.
--
-- app_access_exceptions é a única fonte das exceções por email (a RLS usa-a em
-- access_rank). Antes a UI lia uma cópia em src/clients/<cliente>/config.ts, e
-- as duas tinham de ser mantidas em sincronia à mão. A tabela não tem políticas
-- de leitura (só o service role), por isso a UI pergunta através desta função.

create or replace function public.my_access_exceptions()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(e.tab, e.level), '{}'::jsonb)
  from public.app_access_exceptions e
  where e.email = lower(auth.jwt() ->> 'email');
$$;

revoke all on function public.my_access_exceptions() from public, anon;
grant execute on function public.my_access_exceptions() to authenticated;
