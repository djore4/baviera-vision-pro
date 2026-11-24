-- Permissões em matriz explícita: Perfil → Local → Equipa → Tab.
--
-- Antes: o acesso de uma conta resultava de camadas sobrepostas (matriz base, matriz por local, camada
-- por equipa que atravessa os locais, regra fixa para locais sem matriz, exceções por email). Difícil de
-- ler e de gerir; a equipa não estava "dentro" do local.
-- Agora cada perfil tem UMA matriz explícita em app_roles.permissions_matriz:
--     { "<local>": { "<equipa>": { "<tab>": "none" | "view" | "edit", … }, … }, … }
-- com os locais de app_locais() mais "_" (conta sem local reconhecido) e as equipas de app_equipas() mais
-- "_" (conta sem equipa). Uma célula ausente é "sem acesso". Uma conta com vários locais fica com o nível
-- mais alto entre eles; uma exceção por email continua a só elevar o acesso.
--
-- Convivência: modelo_matriz falso = o perfil segue o modelo antigo (nada muda); verdadeiro = a matriz.
-- migrar_permissoes_matriz() preenche cada célula chamando o MOTOR ANTIGO para esse local e essa equipa,
-- por isso o acesso de cada conta fica exatamente igual. Os perfis não se dividem. Cópia de segurança em
-- app_roles_backup_matriz antes de converter. Idempotente.

alter table public.app_roles add column if not exists permissions_matriz jsonb not null default '{}'::jsonb;
alter table public.app_roles drop constraint if exists app_roles_permissions_matriz_obj;
alter table public.app_roles add constraint app_roles_permissions_matriz_obj check (jsonb_typeof(permissions_matriz) = 'object');
alter table public.app_roles add column if not exists modelo_matriz boolean not null default false;

-- Manter sincronizada com EQUIPAS (src/lib/cartao-go.ts).
create or replace function public.app_equipas()
returns text[]
language sql
immutable
set search_path = ''
as $$ select array['BMW VN', 'BMW VU', 'Motorrad', 'APV']::text[]; $$;

-- Nível que a matriz dá a quem opera nos locais p_user_local, na equipa p_equipa.
create or replace function public.role_tab_level_matriz(p_matriz jsonb, p_user_local jsonb, p_equipa text, p_tab text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select x.lvl
    from (
      select coalesce(p_matriz -> l -> (case when p_equipa = any (public.app_equipas()) then p_equipa else '_' end) ->> p_tab, 'none') as lvl
      from unnest(
        case when exists (select 1 from unnest(public.app_locais()) q where coalesce(p_user_local ? q, false))
             then array(select q from unnest(public.app_locais()) q where coalesce(p_user_local ? q, false))
             else array['_']::text[] end
      ) l
    ) x
    order by case x.lvl when 'edit' then 2 when 'view' then 1 else 0 end desc
    limit 1
  ), 'none');
$$;
revoke all on function public.role_tab_level_matriz(jsonb, jsonb, text, text) from public, anon;
grant execute on function public.role_tab_level_matriz(jsonb, jsonb, text, text) to authenticated;

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
        select case when r.modelo_matriz then
                 public.role_tab_level_matriz(r.permissions_matriz, u.local, u.equipa, p_tab)
               else
                 public.role_tab_level(
                   r.permissions || public.role_equipa_layer(r.permissions_equipa, u.equipa),
                   public.role_local_with_equipa(r.permissions_local, public.role_equipa_layer(r.permissions_equipa, u.equipa)),
                   u.local, p_tab,
                   exists (select 1 from public.app_access_exceptions x
                           where x.email = lower(auth.jwt() ->> 'email') and x.tab = p_tab))
               end as lvl
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
      select 1
      from public.app_users u
      join public.app_roles r on r.name = u.perfil and r.modelo_matriz
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

-- Conversão: cada célula (local, equipa, tab) vem do motor antigo.
create or replace function public.migrar_permissoes_matriz()
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  r record; chaves text[]; matriz jsonb; por_equipa jsonb; celula jsonb;
  l text; e text; k text; lvl text; layer jsonb; perms jsonb; locs jsonb;
begin
  for r in select * from public.app_roles where not is_admin and not modelo_matriz order by name loop
    chaves := array(
      select distinct s.k from (
        select jsonb_object_keys(r.permissions) as k
        union all select jsonb_object_keys(m.value) from jsonb_each(r.permissions_local) m where jsonb_typeof(m.value) = 'object'
        union all select jsonb_object_keys(m.value) from jsonb_each(r.permissions_equipa) m where jsonb_typeof(m.value) = 'object'
      ) s);
    matriz := '{}'::jsonb;
    foreach l in array public.app_locais() || array['_']::text[] loop
      por_equipa := '{}'::jsonb;
      foreach e in array public.app_equipas() || array['_']::text[] loop
        layer := public.role_equipa_layer(r.permissions_equipa, case when e = '_' then null else e end);
        perms := r.permissions || layer;
        locs  := public.role_local_with_equipa(r.permissions_local, layer);
        celula := '{}'::jsonb;
        foreach k in array chaves loop
          lvl := case when l = '_' then coalesce(perms ->> k, 'none')
                      else public.role_tab_level(perms, locs, jsonb_build_array(l), k, false) end;
          if lvl in ('view', 'edit') then celula := celula || jsonb_build_object(k, lvl); end if;
        end loop;
        if celula <> '{}'::jsonb then por_equipa := por_equipa || jsonb_build_object(e, celula); end if;
      end loop;
      if por_equipa <> '{}'::jsonb then matriz := matriz || jsonb_build_object(l, por_equipa); end if;
    end loop;
    update public.app_roles
       set permissions_matriz = matriz, modelo_matriz = true,
           permissions = '{}'::jsonb, permissions_local = '{}'::jsonb, permissions_equipa = '{}'::jsonb
     where name = r.name;
  end loop;
end
$fn$;
revoke all on function public.migrar_permissoes_matriz() from public, anon, authenticated;

-- Gravar e renomear perfis (só administradores): atómico e sem depender da edge function.
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
  -- estrutura: local → equipa → tab → nível; só locais e equipas conhecidos (mais "_") e níveis view/edit
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
  if exists (select 1 from public.app_roles where name = n and not modelo_matriz) then raise exception 'perfil_por_migrar'; end if;
  insert into public.app_roles (name, is_admin, permissions_matriz, modelo_matriz)
    values (n, false, p_matriz, true)
  on conflict (name) do update set permissions_matriz = excluded.permissions_matriz, modelo_matriz = true;
end
$$;

create or replace function public.renomear_perfil(p_nome text, p_novo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare novo text := btrim(coalesce(p_novo, ''));
begin
  if not (select public.is_app_admin()) then raise exception 'sem_acesso' using errcode = '42501'; end if;
  if novo = '' or coalesce(p_nome, '') = '' then raise exception 'nome_em_falta'; end if;
  if novo = p_nome then raise exception 'nome_igual'; end if;
  if not exists (select 1 from public.app_roles where name = p_nome) then raise exception 'perfil_inexistente'; end if;
  if exists (select 1 from public.app_roles where name <> p_nome and lower(name) = lower(novo)) then raise exception 'nome_repetido'; end if;
  -- O nome é a chave do perfil e é o que as contas guardam em `perfil`.
  update public.app_roles set name = novo where name = p_nome;
  update public.app_users set perfil = novo where perfil = p_nome;
end
$$;

revoke all on function public.guardar_perfil(text, jsonb), public.renomear_perfil(text, text) from public, anon;
grant execute on function public.guardar_perfil(text, jsonb), public.renomear_perfil(text, text) to authenticated;

-- Cópia de segurança dos perfis (só para o administrador da base de dados) e conversão.
create table if not exists public.app_roles_backup_matriz as select * from public.app_roles;
alter table public.app_roles_backup_matriz enable row level security;
select public.migrar_permissoes_matriz();
