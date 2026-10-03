-- Diário (prospeção): isolamento por vendedor imposto pela base de dados.
--
-- Até aqui, quem tinha acesso ao tab lia e escrevia as contas, tarefas,
-- contactos e interações de TODOS: o filtro por owner_email estava só em
-- src/lib/prospec.ts, e qualquer vendedor com a consola do browser aberta via
-- o carteira de clientes dos colegas.
--
-- Agora (espelha o `scope` da aplicação: diretor = administrador vê tudo; os
-- restantes só o que é seu):
--   * prospec_accounts, prospec_tasks: só as linhas com owner_email = o próprio
--     (sem distinguir maiúsculas), ou todas para o administrador. O mesmo vale
--     para escrever: um vendedor não cria nem passa linhas para outro dono.
--   * prospec_contacts, prospec_interactions: herdam da conta a que pertencem
--     (a subconsulta passa pela política de prospec_accounts).
-- Continua a ser preciso ter acesso ao tab 'prospecao'.

do $$
declare
  me      constant text := 'lower((select auth.jwt() ->> ''email''))';
  tab_ok  constant text := '(select public.has_access(''prospecao''))';
  adm     constant text := '(select public.is_app_admin())';
  by_owner text := tab_ok || ' and (' || adm || ' or lower(owner_email) = ' || me || ')';
  by_account text := tab_ok || ' and exists (select 1 from public.prospec_accounts a where a.id = account_id)';
  t text;
  op text;
  expr text;
begin
  foreach t in array array['prospec_accounts', 'prospec_tasks', 'prospec_contacts', 'prospec_interactions'] loop
    expr := case when t in ('prospec_accounts', 'prospec_tasks') then by_owner else by_account end;
    foreach op in array array['select', 'insert', 'update', 'delete'] loop
      execute format('drop policy if exists %I on public.%I', t || '_' || op, t);
    end loop;
    execute format('create policy %I on public.%I for select to authenticated using (%s)', t || '_select', t, expr);
    execute format('create policy %I on public.%I for insert to authenticated with check (%s)', t || '_insert', t, expr);
    execute format('create policy %I on public.%I for update to authenticated using (%s) with check (%s)', t || '_update', t, expr, expr);
    execute format('create policy %I on public.%I for delete to authenticated using (%s)', t || '_delete', t, expr);
  end loop;
end $$;
