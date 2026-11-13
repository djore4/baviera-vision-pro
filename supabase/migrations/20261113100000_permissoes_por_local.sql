-- Matriz de permissões função × local.
-- Até aqui cada função tinha UMA matriz (app_roles.permissions) e o local só restringia: fora de
-- Aveiro valiam apenas o End-of-Term e os tabs de app_tabs_por_local (regra fixa em access_rank).
-- Passa a haver uma matriz por local em app_roles.permissions_local:
--     { "Aveiro": { "retails": "edit", … }, "Porto": { "end-of-term": "view", … }, … }
--
-- Regras (espelhadas em src/lib/permissions.ts: nivelDaFuncao):
--   * Pessoa com locais reconhecidos: o nível é o MÁXIMO dos níveis dos seus locais.
--   * Pessoa sem nenhum local reconhecido: vale a matriz base (app_roles.permissions), como até aqui.
--   * Local SEM entrada na função: segue a regra anterior (Aveiro = matriz base; os outros só o
--     End-of-Term, demos:inserir-viaturas e os tabs de app_tabs_por_local; uma exceção por email
--     também abre o tab). Por isso esta migração não altera nenhum acesso existente: só passa a
--     mandar o que um administrador gravar em Utilizadores → Funções.
--   * Local COM entrada (mesmo vazia): manda a entrada; o que não está lá é 'sem acesso'.
-- Exceções por email (app_access_exceptions) continuam a só elevar o acesso.
-- Não muda o âmbito por LINHA (demos_viaturas, local_restrito): continua a seguir o local da pessoa.
-- Manter app_locais() sincronizada com client.locais (src/clients/baviera/config.ts).

alter table public.app_roles
  add column if not exists permissions_local jsonb not null default '{}'::jsonb;

alter table public.app_roles drop constraint if exists app_roles_permissions_local_obj;
alter table public.app_roles add constraint app_roles_permissions_local_obj
  check (jsonb_typeof(permissions_local) = 'object');

create or replace function public.app_locais()
returns text[]
language sql
immutable
set search_path = ''
as $$ select array['Maia', 'Porto', 'Gaia', 'Feira', 'Aveiro']::text[]; $$;

-- Nível ('none' | 'view' | 'edit') que uma função dá a quem opera nos locais p_user_local.
create or replace function public.role_tab_level(
  p_perms jsonb, p_perms_local jsonb, p_user_local jsonb, p_tab text, p_has_exception boolean default false
) returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not exists (select 1 from unnest(public.app_locais()) l where coalesce(p_user_local ? l, false))
      then coalesce(p_perms ->> p_tab, 'none')
    else coalesce((
      select x.lvl
      from (
        select
          case
            when jsonb_typeof(p_perms_local -> l) = 'object'
              then coalesce(p_perms_local -> l ->> p_tab, 'none')
            when l = 'Aveiro'
              or p_has_exception
              or p_tab = 'end-of-term' or p_tab like 'end-of-term:%'
              or p_tab = 'demos:inserir-viaturas'
              or split_part(p_tab, ':', 1) in (select t.tab from public.app_tabs_por_local t)
              then coalesce(p_perms ->> p_tab, 'none')
            else 'none'
          end as lvl
        from unnest(public.app_locais()) l
        where coalesce(p_user_local ? l, false)
      ) x
      order by case x.lvl when 'edit' then 2 when 'view' then 1 else 0 end desc
      limit 1
    ), 'none')
  end;
$$;

revoke all on function public.role_tab_level(jsonb, jsonb, jsonb, text, boolean) from public, anon;
grant execute on function public.role_tab_level(jsonb, jsonb, jsonb, text, boolean) to authenticated;

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
        select public.role_tab_level(
                 r.permissions, r.permissions_local, u.local, p_tab,
                 exists (
                   select 1 from public.app_access_exceptions x
                   where x.email = lower(auth.jwt() ->> 'email') and x.tab = p_tab
                 )
               ) as lvl
        from public.app_users u
        join public.app_roles r on r.name = u.perfil
        where lower(u.email) = lower(auth.jwt() ->> 'email')
        union all
        select e.level
        from public.app_access_exceptions e
        where e.email = lower(auth.jwt() ->> 'email') and e.tab = p_tab
      ) levels
    ), 0)
  end;
$$;

-- has_any_tab: a função também conta se só tiver acesso através de uma matriz por local.
create or replace function public.has_any_tab()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select public.is_app_admin())
    or exists (
      select 1
      from public.app_users u
      join public.app_roles r on r.name = u.perfil
      cross join lateral jsonb_each_text(r.permissions) p
      where lower(u.email) = lower(auth.jwt() ->> 'email')
        and p.value in ('view', 'edit')
    )
    or exists (
      select 1
      from public.app_users u
      join public.app_roles r on r.name = u.perfil
      cross join lateral jsonb_each(r.permissions_local) l
      cross join lateral jsonb_each_text(case when jsonb_typeof(l.value) = 'object' then l.value else '{}'::jsonb end) p
      where lower(u.email) = lower(auth.jwt() ->> 'email')
        and p.value in ('view', 'edit')
    )
    or exists (
      select 1 from public.app_access_exceptions e
      where e.email = lower(auth.jwt() ->> 'email')
    );
$$;
