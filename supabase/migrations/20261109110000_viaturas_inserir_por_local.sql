-- Introdução de viaturas por local (permissão fina 'demos:inserir-viaturas').
-- Até aqui só escreviam em `viaturas` os administradores e quem consta de `utilizadores`
-- (Sales Force), sem âmbito por local nem separação entre inserir e apagar.
-- Agora uma função pode ter 'demos:inserir-viaturas' = edit: quem a tem insere e corrige
-- viaturas dos SEUS locais (app_users.local) — nunca de outros, e nunca apaga.
--   * insert/update: has_access('demos:inserir-viaturas','edit') e `local` não vazio e contido
--     nos locais do utilizador (nos dois lados do update: não passa a viatura para outro local).
--   * select: o mesmo âmbito, para ver o que inseriu (a leitura geral continua a ser a da
--     migração 20261012120000: administrador, ou demos_viaturas() com o tab Demos).
--   * delete: continua só do administrador.
-- As políticas somam-se (OR) às existentes, incluindo a da Sales Force.
-- Depende de 20261012120000_demos_custos_so_admin (leitura da tabela só pelo administrador).

create or replace function public.viaturas_local_ok(p_local jsonb)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_typeof(p_local) = 'array'
    and jsonb_array_length(p_local) > 0
    and exists (
      select 1 from public.app_users u
      where lower(u.email) = lower(auth.jwt() ->> 'email')
        and jsonb_typeof(u.local) = 'array'
        and p_local <@ u.local
    ),
    false
  );
$$;

revoke all on function public.viaturas_local_ok(jsonb) from public, anon;
grant execute on function public.viaturas_local_ok(jsonb) to authenticated;

drop policy if exists viaturas_select_local on public.viaturas;
create policy viaturas_select_local on public.viaturas
  for select to authenticated
  using ((select public.has_access('demos:inserir-viaturas', 'edit')) and (select public.viaturas_local_ok(local)));

drop policy if exists viaturas_insert_local on public.viaturas;
create policy viaturas_insert_local on public.viaturas
  for insert to authenticated
  with check ((select public.has_access('demos:inserir-viaturas', 'edit')) and (select public.viaturas_local_ok(local)));

drop policy if exists viaturas_update_local on public.viaturas;
create policy viaturas_update_local on public.viaturas
  for update to authenticated
  using ((select public.has_access('demos:inserir-viaturas', 'edit')) and (select public.viaturas_local_ok(local)))
  with check ((select public.has_access('demos:inserir-viaturas', 'edit')) and (select public.viaturas_local_ok(local)));

-- access_rank: a regra "fora de Aveiro só o End-of-Term" (20261109100000) não pode barrar
-- esta permissão — o seu âmbito já é o local da pessoa.
create or replace function public.access_rank(p_tab text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when (select public.is_app_admin()) then 2
    else coalesce((
      select max(case lvl when 'edit' then 2 when 'view' then 1 else 0 end)
      from (
        select r.permissions ->> p_tab as lvl
        from public.app_users u
        join public.app_roles r on r.name = u.perfil
        where lower(u.email) = lower(auth.jwt() ->> 'email')
          and (
            p_tab = 'end-of-term' or p_tab like 'end-of-term:%'
            or p_tab = 'demos:inserir-viaturas'
            or u.local ? 'Aveiro'
            or not coalesce(u.local ?| array['Maia', 'Porto', 'Gaia', 'Feira'], false)
            or exists (
              select 1 from public.app_access_exceptions x
              where x.email = lower(auth.jwt() ->> 'email') and x.tab = p_tab
            )
          )
        union all
        select e.level
        from public.app_access_exceptions e
        where e.email = lower(auth.jwt() ->> 'email') and e.tab = p_tab
      ) levels
    ), 0)
  end;
$$;

create or replace function public.app_capabilities()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select '{"lavagem_granular": true, "eot_granular": true, "eot_responsaveis": true, "viaturas_local": true}'::jsonb;
$$;

revoke all on function public.app_capabilities() from public, anon;
grant execute on function public.app_capabilities() to authenticated;
