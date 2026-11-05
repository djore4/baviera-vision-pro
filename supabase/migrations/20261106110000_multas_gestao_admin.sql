-- Multas: quem tem o tab (função/exceção) consulta e lança multas; só o administrador
-- gere o catálogo de infrações, reinicia o ciclo e apaga/corrige multas lançadas.
--  * infractions    : ler = ver o tab; escrever = admin
--  * penalty_cycles : ler = ver o tab; escrever = admin (reset de ciclo)
--  * penalties      : ler = ver o tab; inserir = editar o tab; alterar/apagar = admin
-- Substitui as políticas de 20261003100000_rls_por_perfil (que davam escrita a quem edita o tab).

do $$
declare
  t text; p record;
begin
  foreach t in array array['infractions', 'penalty_cycles', 'penalties'] loop
    execute format('alter table public.%I enable row level security', t);
    for p in select policyname from pg_policies
             where schemaname = 'public' and tablename = t
               and (policyname in ('platform_users', 'platform_users_read')
                    or left(policyname, length(t) + 1) = t || '_') loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
    execute format('create policy %I on public.%I for select to authenticated using ((select public.has_access(%L)))',
      t || '_select', t, 'multas');
  end loop;

  create policy infractions_insert on public.infractions for insert to authenticated
    with check ((select public.is_app_admin()));
  create policy infractions_update on public.infractions for update to authenticated
    using ((select public.is_app_admin())) with check ((select public.is_app_admin()));
  create policy infractions_delete on public.infractions for delete to authenticated
    using ((select public.is_app_admin()));

  create policy penalty_cycles_insert on public.penalty_cycles for insert to authenticated
    with check ((select public.is_app_admin()));
  create policy penalty_cycles_update on public.penalty_cycles for update to authenticated
    using ((select public.is_app_admin())) with check ((select public.is_app_admin()));
  create policy penalty_cycles_delete on public.penalty_cycles for delete to authenticated
    using ((select public.is_app_admin()));

  create policy penalties_insert on public.penalties for insert to authenticated
    with check ((select public.has_access('multas', 'edit')));
  create policy penalties_update on public.penalties for update to authenticated
    using ((select public.is_app_admin())) with check ((select public.is_app_admin()));
  create policy penalties_delete on public.penalties for delete to authenticated
    using ((select public.is_app_admin()));
end $$;
