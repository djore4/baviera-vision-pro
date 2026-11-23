-- Modelo de permissões simples: perfil × tab, com duas colunas.
--
-- Antes: o acesso resultava de 4 camadas sobrepostas (matriz base, matriz por local, camada por equipa,
-- exceções por email) mais uma regra fixa para locais sem matriz. Difícil de ler e de gerir.
-- Agora, por perfil, só duas matrizes planas (nível por tab: none | view | edit):
--     permissions          "completo": Aveiro e contas sem local reconhecido
--     permissions_outros   os restantes locais (Maia, Porto, Gaia, Feira)
-- Quem opera em vários locais fica com o nível mais alto entre eles; uma exceção por email abre o tab
-- ao nível "completo" (como até aqui). A equipa deixa de ser uma camada: um perfil por equipa
-- ("Vendedor BMW VN", "Vendedor BMW VU"); app_users.equipa mantém-se (Cartão Caetano Go).
--
-- Convivência: cada perfil tem o marcador modelo_simples. Falso = segue o modelo antigo (nada muda);
-- verdadeiro = modelo simples. migrar_permissoes_simples() converte os perfis calculando as duas
-- matrizes com o MOTOR ANTIGO, ou seja, o acesso de cada utilizador mantém-se (a única exceção possível
-- é uma pessoa com matrizes diferentes em locais "outros": passa a valer o nível mais alto deles).
-- Os perfis com camadas de equipa dão origem a um perfil por equipa e as contas passam para ele.
-- Guarda-se uma cópia dos perfis em app_roles_backup_simples antes de converter. Idempotente.

alter table public.app_roles add column if not exists permissions_outros jsonb not null default '{}'::jsonb;
alter table public.app_roles drop constraint if exists app_roles_permissions_outros_obj;
alter table public.app_roles add constraint app_roles_permissions_outros_obj
  check (jsonb_typeof(permissions_outros) = 'object');
alter table public.app_roles add column if not exists modelo_simples boolean not null default false;

-- Nível que um perfil em modelo simples dá a quem opera nos locais p_user_local.
create or replace function public.role_tab_level_simples(
  p_perms jsonb, p_outros jsonb, p_user_local jsonb, p_tab text, p_has_exception boolean default false
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
        select case
                 when l = 'Aveiro' or p_has_exception then coalesce(p_perms ->> p_tab, 'none')
                 else coalesce(p_outros ->> p_tab, 'none')
               end as lvl
        from unnest(public.app_locais()) l
        where coalesce(p_user_local ? l, false)
      ) x
      order by case x.lvl when 'edit' then 2 when 'view' then 1 else 0 end desc
      limit 1
    ), 'none')
  end;
$$;
revoke all on function public.role_tab_level_simples(jsonb, jsonb, jsonb, text, boolean) from public, anon;
grant execute on function public.role_tab_level_simples(jsonb, jsonb, jsonb, text, boolean) to authenticated;

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
        select case when r.modelo_simples then
                 public.role_tab_level_simples(
                   r.permissions, r.permissions_outros, u.local, p_tab,
                   exists (select 1 from public.app_access_exceptions x
                           where x.email = lower(auth.jwt() ->> 'email') and x.tab = p_tab))
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
      join public.app_roles r on r.name = u.perfil and r.modelo_simples
      cross join lateral jsonb_each_text(r.permissions_outros) p
      where lower(u.email) = lower(auth.jwt() ->> 'email')
        and p.value in ('view', 'edit')
    )
    or exists (
      select 1 from public.app_access_exceptions e
      where e.email = lower(auth.jwt() ->> 'email')
    );
$function$;

-- Conversão dos perfis do modelo antigo para o simples (ver o cabeçalho).
create or replace function public.migrar_permissoes_simples()
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  r record; v text; variantes text[]; chaves text[];
  layer jsonb; perms jsonb; locs jsonb; completo jsonb; outros jsonb;
  k text; l text; lvl text; melhor text; novo text;
  fora_aveiro text[] := array(select x from unnest(public.app_locais()) x where x <> 'Aveiro');
begin
  for r in select * from public.app_roles where not is_admin and not modelo_simples order by name loop
    chaves := array(
      select distinct s.k from (
        select jsonb_object_keys(r.permissions) as k
        union all select jsonb_object_keys(m.value) from jsonb_each(r.permissions_local) m where jsonb_typeof(m.value) = 'object'
        union all select jsonb_object_keys(m.value) from jsonb_each(r.permissions_equipa) m where jsonb_typeof(m.value) = 'object'
      ) s);
    -- a função em si (sem camada) e uma variante por equipa com camada não vazia
    variantes := array[null]::text[] || array(
      select e from jsonb_object_keys(r.permissions_equipa) e
      where jsonb_typeof(r.permissions_equipa -> e) = 'object' and (r.permissions_equipa -> e) <> '{}'::jsonb order by e);

    foreach v in array variantes loop
      layer := public.role_equipa_layer(r.permissions_equipa, v);
      perms := r.permissions || layer;
      locs  := public.role_local_with_equipa(r.permissions_local, layer);
      completo := '{}'::jsonb; outros := '{}'::jsonb;
      foreach k in array chaves loop
        lvl := public.role_tab_level(perms, locs, '["Aveiro"]'::jsonb, k, false);
        if lvl in ('view', 'edit') then completo := completo || jsonb_build_object(k, lvl); end if;
        melhor := 'none';
        foreach l in array fora_aveiro loop
          lvl := public.role_tab_level(perms, locs, jsonb_build_array(l), k, false);
          if lvl = 'edit' or (lvl = 'view' and melhor = 'none') then melhor := lvl; end if;
        end loop;
        if melhor <> 'none' then outros := outros || jsonb_build_object(k, melhor); end if;
      end loop;

      if v is not null then
        novo := r.name || ' ' || v;
        insert into public.app_roles (name, is_admin, permissions, permissions_outros, modelo_simples)
          values (novo, false, completo, outros, true)
          on conflict (name) do nothing;
        update public.app_users set perfil = novo where perfil = r.name and equipa = v;
      else
        update public.app_roles
           set permissions = completo, permissions_outros = outros,
               permissions_local = '{}'::jsonb, permissions_equipa = '{}'::jsonb, modelo_simples = true
         where name = r.name;
      end if;
    end loop;
  end loop;
end
$fn$;
revoke all on function public.migrar_permissoes_simples() from public, anon, authenticated;

-- Gravar e renomear perfis (só administradores): atómico e sem depender da edge function.
create or replace function public.guardar_perfil(p_nome text, p_permissions jsonb, p_outros jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare n text := btrim(coalesce(p_nome, ''));
begin
  if not (select public.is_app_admin()) then raise exception 'sem_acesso' using errcode = '42501'; end if;
  if n = '' then raise exception 'nome_em_falta'; end if;
  if jsonb_typeof(p_permissions) is distinct from 'object' or jsonb_typeof(p_outros) is distinct from 'object' then
    raise exception 'matriz_invalida';
  end if;
  if exists (select 1 from jsonb_each_text(p_permissions) x where x.value not in ('view', 'edit'))
     or exists (select 1 from jsonb_each_text(p_outros) x where x.value not in ('view', 'edit')) then
    raise exception 'nivel_invalido';
  end if;
  if exists (select 1 from public.app_roles where name = n and is_admin) then raise exception 'perfil_admin'; end if;
  if exists (select 1 from public.app_roles where name = n and not modelo_simples) then raise exception 'perfil_por_migrar'; end if;
  insert into public.app_roles (name, is_admin, permissions, permissions_outros, modelo_simples)
    values (n, false, p_permissions, p_outros, true)
  on conflict (name) do update
    set permissions = excluded.permissions, permissions_outros = excluded.permissions_outros, modelo_simples = true;
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

revoke all on function public.guardar_perfil(text, jsonb, jsonb), public.renomear_perfil(text, text) from public, anon;
grant execute on function public.guardar_perfil(text, jsonb, jsonb), public.renomear_perfil(text, text) to authenticated;

-- Cópia de segurança dos perfis (só para o administrador da base de dados) e conversão.
create table if not exists public.app_roles_backup_simples as select * from public.app_roles;
alter table public.app_roles_backup_simples enable row level security;
select public.migrar_permissoes_simples();
