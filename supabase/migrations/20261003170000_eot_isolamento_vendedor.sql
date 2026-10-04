-- End-of-Term: cada vendedor só vê e altera os contratos que lhe estão afetos,
-- imposto pela base de dados.
--
-- Até aqui, quem tinha acesso ao tab lia e escrevia TODOS os contratos: o filtro
-- por owner_email estava só em src/lib/eot.ts. Os vendedores têm 'edit' no tab,
-- por isso podiam também alterar a fase, a temperatura e o responsável dos
-- contratos dos colegas (ou passar-lhes os seus) através da consola do browser.
--
-- Regra (espelha o `scope` da aplicação):
--   * quem tem a permissão 'end-of-term:todos' (o administrador e o Finance) vê e
--     altera todos os contratos, incluindo os que ainda não têm dono, e atribui donos;
--   * os restantes (vendedores) só os contratos com owner_email = o próprio (sem
--     distinguir maiúsculas) — e não os passam para outro dono;
--   * quem importa o mapa (edição do tab 'dados') vê e escreve tudo, porque o
--     upsert por contrato avalia as políticas de select e de update;
--   * as atividades (agenda e histórico) herdam do contrato a que pertencem.
-- Continua a ser preciso ter acesso ao tab 'end-of-term'.
--
-- Antes desta migração o código decidia por NOME ('Finance'); passa a ser uma
-- permissão da função, como na Lavagem (ver app_capabilities, mais abaixo).

-- ── 1. Migração dos dados: o Finance mantém a visão total que tinha por nome ────
-- (só toca na função com este nome, se existir; idempotente)
update public.app_roles
   set permissions = permissions || '{"end-of-term:todos": "edit"}'::jsonb
 where name = 'Finance';

-- ── 2. RLS ─────────────────────────────────────────────────────────────────────
do $$
declare
  me  constant text := 'lower((select auth.jwt() ->> ''email''))';
  t   constant text := '(select public.has_access(''end-of-term''))';
  e   constant text := '(select public.has_access(''end-of-term'', ''edit''))';
  tod constant text := '(select public.has_access(''end-of-term:todos''))';
  imp constant text := '(select public.has_access(''dados'', ''edit''))';
  can_read  text := '((' || t || ' and (' || tod || ' or lower(owner_email) = ' || me || ')) or ' || imp || ')';
  can_write text := '((' || e || ' and (' || tod || ' or lower(owner_email) = ' || me || ')) or ' || imp || ')';
  of_contract constant text := 'exists (select 1 from public.eot_contracts c where c.contrato = eot_activities.contrato)';
  tbl text;
  op text;
begin
  foreach tbl in array array['eot_contracts', 'eot_activities'] loop
    foreach op in array array['select', 'insert', 'update', 'delete'] loop
      execute format('drop policy if exists %I on public.%I', tbl || '_' || op, tbl);
    end loop;
  end loop;

  execute format('create policy eot_contracts_select on public.eot_contracts for select to authenticated using (%s)', can_read);
  execute format('create policy eot_contracts_insert on public.eot_contracts for insert to authenticated with check (%s)', can_write);
  execute format('create policy eot_contracts_update on public.eot_contracts for update to authenticated using (%s) with check (%s)', can_write, can_write);
  execute format('create policy eot_contracts_delete on public.eot_contracts for delete to authenticated using (%s)', can_write);

  -- A subconsulta passa pela política de select dos contratos: só se veem e
  -- escrevem atividades de contratos visíveis.
  execute format('create policy eot_activities_select on public.eot_activities for select to authenticated using (%s and %s)', t, of_contract);
  execute format('create policy eot_activities_insert on public.eot_activities for insert to authenticated with check (%s and %s)', e, of_contract);
  execute format('create policy eot_activities_update on public.eot_activities for update to authenticated using (%s and %s) with check (%s and %s)', e, of_contract, e, of_contract);
  execute format('create policy eot_activities_delete on public.eot_activities for delete to authenticated using (%s and %s)', e, of_contract);
end $$;

-- ── 3. Marcador para a interface ────────────────────────────────────────────────
-- A interface só usa a permissão 'end-of-term:todos' depois desta migração
-- (antes, mantém a regra por nome 'Finance'). Estende app_capabilities, que a
-- migração da Lavagem criou.
create or replace function public.app_capabilities()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select '{"lavagem_granular": true, "eot_granular": true}'::jsonb;
$$;

revoke all on function public.app_capabilities() from public, anon;
grant execute on function public.app_capabilities() to authenticated;
