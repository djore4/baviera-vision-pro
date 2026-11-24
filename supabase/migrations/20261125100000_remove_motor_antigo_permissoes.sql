-- Remove o motor antigo de permissões (matriz base + matriz por local + camada de equipa + regra fixa).
--
-- Desde a migração 20261124100000 todos os perfis usam a matriz explícita Perfil → Local → Equipa → Tab
-- (app_roles.permissions_matriz). Aqui apaga-se o que ficou sem uso:
--   * funções role_tab_level, role_equipa_layer, role_local_with_equipa, migrar_permissoes_matriz;
--   * as colunas permissions, permissions_local, permissions_equipa e modelo_matriz de app_roles;
--   * os ramos do motor antigo em access_rank e has_any_tab.
-- Pré-requisito: a interface que só lê permissions_matriz já está publicada (as colunas apagadas deixam de
-- ser lidas). A cópia dos perfis antigos mantém-se em app_roles_backup_matriz.

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
        select public.role_tab_level_matriz(r.permissions_matriz, u.local, u.equipa, p_tab) as lvl
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
      cross join lateral jsonb_each(r.permissions_matriz) l
      cross join lateral jsonb_each(case when jsonb_typeof(l.value) = 'object' then l.value else '{}'::jsonb end) e
      cross join lateral jsonb_each_text(case when jsonb_typeof(e.value) = 'object' then e.value else '{}'::jsonb end) p
      where lower(u.email) = lower(auth.jwt() ->> 'email')
        and p.value in ('view', 'edit')
    )
    or exists (
      select 1 from public.app_access_exceptions e
      where e.email = lower(auth.jwt() ->> 'email')
    );
$function$;

create or replace function public.guardar_perfil(p_nome text, p_matriz jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare n text := btrim(coalesce(p_nome, ''));
begin
  if not (select public.is_app_admin()) then raise exception 'sem_acesso' using errcode = '42501'; end if;
  if n = '' then raise exception 'nome_em_falta'; end if;
  if jsonb_typeof(p_matriz) is distinct from 'object' then raise exception 'matriz_invalida'; end if;
  if exists (
    select 1 from jsonb_each(p_matriz) l
    where not (l.key = any (public.app_locais() || array['_']::text[])) or jsonb_typeof(l.value) is distinct from 'object'
  ) or exists (
    select 1 from jsonb_each(p_matriz) l, jsonb_each(l.value) e
    where not (e.key = any (public.app_equipas() || array['_']::text[])) or jsonb_typeof(e.value) is distinct from 'object'
  ) then raise exception 'matriz_invalida'; end if;
  if exists (
    select 1 from jsonb_each(p_matriz) l, jsonb_each(l.value) e, jsonb_each(e.value) t
    where jsonb_typeof(t.value) is distinct from 'string' or (t.value #>> '{}') not in ('view', 'edit')
  ) then raise exception 'nivel_invalido'; end if;
  if exists (select 1 from public.app_roles where name = n and is_admin) then raise exception 'perfil_admin'; end if;
  insert into public.app_roles (name, is_admin, permissions_matriz)
    values (n, false, p_matriz)
  on conflict (name) do update set permissions_matriz = excluded.permissions_matriz;
end
$$;

drop function if exists public.migrar_permissoes_matriz();
drop function if exists public.role_tab_level(jsonb, jsonb, jsonb, text, boolean);
drop function if exists public.role_local_with_equipa(jsonb, jsonb);
drop function if exists public.role_equipa_layer(jsonb, text);

alter table public.app_roles
  drop column if exists permissions,
  drop column if exists permissions_local,
  drop column if exists permissions_equipa,
  drop column if exists modelo_matriz;
