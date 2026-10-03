-- Políticas que existem em PRODUÇÃO mas não no baseline do repositório (migração
-- remota 20260930141317 acesso_salesforce_sem_crm): a Caetano Sales Force, que
-- partilha o projeto, acede a três tabelas se o seu email estiver em
-- `utilizadores`. Reproduzidas aqui para provar que a RLS por perfil as preserva.
-- Corre depois do baseline e antes da migração rls_por_perfil.
create function public.is_salesforce_user() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(exists (
    select 1 from public.utilizadores u where lower(u.email) = lower(auth.jwt() ->> 'email')
  ), false);
$$;
revoke all on function public.is_salesforce_user() from public, anon;
grant execute on function public.is_salesforce_user() to authenticated;

create policy salesforce_users on public.historico for all to authenticated
  using (public.is_salesforce_user()) with check (public.is_salesforce_user());
create policy salesforce_users on public.viaturas for all to authenticated
  using (public.is_salesforce_user()) with check (public.is_salesforce_user());
create policy salesforce_users_read on public.utilizadores for select to authenticated
  using (public.is_salesforce_user());
