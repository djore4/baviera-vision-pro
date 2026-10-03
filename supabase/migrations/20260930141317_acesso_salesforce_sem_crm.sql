-- Acesso da Caetano Sales Force a três tabelas partilhadas.
--
-- Este projeto Supabase é partilhado com a Caetano Sales Force (outra
-- aplicação). Esta migração já estava aplicada em produção, criada fora do
-- repositório; foi copiada tal e qual do histórico remoto
-- (supabase_migrations.schema_migrations, versão 20260930141317) para que o
-- repositório volte a reproduzir a produção.
--
-- Utilizador da Sales Force = email em `utilizadores`. Tem acesso total a
-- viaturas e historico e leitura de utilizadores — e a nada mais desta
-- plataforma. As políticas somam-se (OR) às da plataforma, por isso a migração
-- rls_por_perfil NÃO as pode apagar (ver pg_temp.apply_rls).

create or replace function public.is_salesforce_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    exists (
      select 1 from public.utilizadores u
      where lower(u.email) = lower(auth.jwt() ->> 'email')
    ),
    false
  );
$$;

revoke all on function public.is_salesforce_user() from public, anon;
grant execute on function public.is_salesforce_user() to authenticated;

drop policy if exists salesforce_users on public.viaturas;
create policy salesforce_users on public.viaturas
  for all to authenticated
  using (public.is_salesforce_user()) with check (public.is_salesforce_user());

drop policy if exists salesforce_users on public.historico;
create policy salesforce_users on public.historico
  for all to authenticated
  using (public.is_salesforce_user()) with check (public.is_salesforce_user());

drop policy if exists salesforce_users_read on public.utilizadores;
create policy salesforce_users_read on public.utilizadores
  for select to authenticated
  using (public.is_salesforce_user());
