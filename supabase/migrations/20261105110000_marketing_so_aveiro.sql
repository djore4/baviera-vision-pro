-- Marketing: só acede quem opera em Aveiro (app_users.local), além de administradores e de
-- quem tenha uma exceção explícita por email (app_access_exceptions) para o tab.
--
-- A interface já escondia todos os tabs (menos o End-of-Term) a quem não é de Aveiro
-- (src/lib/permissions.ts: LOCAL_ACESSO_COMPLETO). Aqui a mesma regra passa a valer também na
-- base de dados para o Marketing, para que dar o tab a uma função (p.ex. Vendedor VN / VU) não
-- abra os dados a quem trabalha noutro local: a API não segue a interface.
-- Manter 'Aveiro' sincronizado com LOCAL_ACESSO_COMPLETO.

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
    );
$$;

-- Acesso ao tab no nível pedido E do local certo.
create or replace function public.marketing_acesso(p_level text default 'view')
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_access('marketing', p_level) and public.marketing_local_ok();
$$;

revoke all on function public.marketing_local_ok() from public, anon;
revoke all on function public.marketing_acesso(text) from public, anon;
grant execute on function public.marketing_local_ok() to authenticated;
grant execute on function public.marketing_acesso(text) to authenticated;

-- ── Policies: as mesmas de antes, com o local ──────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['marketing_categorias', 'marketing_eventos', 'marketing_viaturas', 'marketing_anexos'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select public.marketing_acesso()))',
                   t || '_select', t);
    execute format('create policy %I on public.%I for all to authenticated '
                   'using ((select public.marketing_acesso(''edit''))) '
                   'with check ((select public.marketing_acesso(''edit'')))',
                   t || '_write', t);
  end loop;
end $$;

drop policy if exists marketing_orcamentos_edit on public.marketing_orcamentos;
create policy marketing_orcamentos_edit on public.marketing_orcamentos
  for all to authenticated
  using ((select public.marketing_acesso('edit')))
  with check ((select public.marketing_acesso('edit')));

drop policy if exists marketing_convidados_acesso on public.marketing_convidados;
create policy marketing_convidados_acesso on public.marketing_convidados
  for all to authenticated
  using (
    (select public.marketing_acesso('edit'))
    or ((select public.marketing_acesso()) and vendedor_email = lower(auth.jwt() ->> 'email'))
  )
  with check (
    (select public.marketing_acesso('edit'))
    or ((select public.marketing_acesso()) and vendedor_email = lower(auth.jwt() ->> 'email'))
  );

drop policy if exists marketing_obj_select on storage.objects;
drop policy if exists marketing_obj_insert on storage.objects;
drop policy if exists marketing_obj_delete on storage.objects;

create policy marketing_obj_select on storage.objects
  for select to authenticated
  using (bucket_id = 'marketing' and (select public.marketing_acesso()));
create policy marketing_obj_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'marketing' and (select public.marketing_acesso('edit')));
create policy marketing_obj_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'marketing' and (select public.marketing_acesso('edit')));
