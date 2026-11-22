-- Permissões por equipa dentro de uma função.
--
-- app_roles.permissions_equipa: { "BMW VN": { tab: nível, … }, "BMW VU": { … } }. É uma camada
-- POR CIMA da matriz da função (base e por local): o acesso efetivo de quem tem app_users.equipa = E
-- é `permissions || permissions_equipa->E` (e, em cada local com matriz própria, `permissions_local->L
-- || permissions_equipa->E`). Uma chave presente na camada substitui a da base, incluindo 'none'.
--
-- Sem equipa (nula) ou sem camada para essa equipa: nada muda — vale só a matriz da função. Por isso
-- esta migração, sozinha, não altera o acesso de ninguém (todas as funções têm a camada vazia).
-- O administrador não passa por aqui (is_app_admin → edit em tudo). Idempotente.

alter table public.app_roles add column if not exists permissions_equipa jsonb not null default '{}'::jsonb;
alter table public.app_roles drop constraint if exists app_roles_permissions_equipa_obj;
alter table public.app_roles add constraint app_roles_permissions_equipa_obj
  check (jsonb_typeof(permissions_equipa) = 'object');

-- Camada de uma equipa (objeto vazio se não existir).
create or replace function public.role_equipa_layer(p_equipa_perms jsonb, p_equipa text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when p_equipa is not null and jsonb_typeof(p_equipa_perms -> p_equipa) = 'object'
      then p_equipa_perms -> p_equipa
    else '{}'::jsonb
  end;
$$;

-- Matrizes por local com a camada da equipa aplicada (as entradas que não são objeto ficam como estão).
create or replace function public.role_local_with_equipa(p_perms_local jsonb, p_layer jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when p_layer = '{}'::jsonb or jsonb_typeof(p_perms_local) <> 'object' then p_perms_local
    else coalesce((
      select jsonb_object_agg(t.k, case when jsonb_typeof(t.v) = 'object' then t.v || p_layer else t.v end)
      from jsonb_each(p_perms_local) as t(k, v)
    ), '{}'::jsonb)
  end;
$$;
revoke all on function public.role_equipa_layer(jsonb, text) from public, anon;
revoke all on function public.role_local_with_equipa(jsonb, jsonb) from public, anon;
grant execute on function public.role_equipa_layer(jsonb, text) to authenticated;
grant execute on function public.role_local_with_equipa(jsonb, jsonb) to authenticated;

create or replace function public.access_rank(p_tab text)
returns integer
language sql
stable
security definer
set search_path to ''
as $function$
  select case
    when (select public.is_app_admin()) then 2
    else coalesce((
      select max(case lvl when 'edit' then 2 when 'view' then 1 else 0 end)
      from (
        select public.role_tab_level(
                 r.permissions || public.role_equipa_layer(r.permissions_equipa, u.equipa),
                 public.role_local_with_equipa(r.permissions_local, public.role_equipa_layer(r.permissions_equipa, u.equipa)),
                 u.local, p_tab,
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
$function$;

create or replace function public.has_any_tab()
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select (select public.is_app_admin())
    or exists (
      select 1
      from public.app_users u
      join public.app_roles r on r.name = u.perfil
      cross join lateral jsonb_each_text(r.permissions || public.role_equipa_layer(r.permissions_equipa, u.equipa)) p
      where lower(u.email) = lower(auth.jwt() ->> 'email')
        and p.value in ('view', 'edit')
    )
    or exists (
      select 1
      from public.app_users u
      join public.app_roles r on r.name = u.perfil
      cross join lateral jsonb_each(public.role_local_with_equipa(r.permissions_local, public.role_equipa_layer(r.permissions_equipa, u.equipa))) l
      cross join lateral jsonb_each_text(case when jsonb_typeof(l.value) = 'object' then l.value else '{}'::jsonb end) p
      where lower(u.email) = lower(auth.jwt() ->> 'email')
        and p.value in ('view', 'edit')
    )
    or exists (
      select 1 from public.app_access_exceptions e
      where e.email = lower(auth.jwt() ->> 'email')
    );
$function$;
