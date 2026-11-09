-- Demos por local: quem opera fora de Aveiro passa a ver e a gerir as demos DO SEU LOCAL.
-- Antes (20261109100000) quem não tem Aveiro nos locais só tinha o End-of-Term, pelo que, por
-- exemplo, um Genius da Feira entrava na plataforma e não via nada. Os tabs de negócio que
-- outros locais também usam (Demos, para já) abrem-se a esses utilizadores, mas sempre com
-- âmbito de LINHA: só as viaturas cujo `local` coincide com algum dos locais da pessoa.
--
-- Parametrizável: os tabs "abertos fora de Aveiro" já não estão no código, estão na tabela
-- app_tabs_por_local (um tab por linha; as permissões finas 'tab:ação' herdam). Abrir outro
-- tab a outros locais é um insert, mas só o faça para tabs com âmbito por linha na RLS — senão
-- fica aberto a todos os locais.
--   insert into public.app_tabs_por_local (tab) values ('lavagem');
--
-- O que muda para quem está fora de Aveiro (e não é administrador):
--   * access_rank: os tabs de app_tabs_por_local seguem a função (deixam de ser barrados).
--   * demos_viaturas(): só devolve viaturas dos seus locais (administrador e Aveiro: tudo).
--   * demo_capas e o bucket demo-capas: só escreve nas capas de viaturas dos seus locais.
--   * demos / demo_emprestimos (empréstimos): continuam sem acesso — não têm local próprio.
-- Quem tem Aveiro nos locais, quem não tem local e os administradores: sem alterações.
-- Depende de 20261012120000 (demos_viaturas) e 20261109110000 (access_rank com inserir-viaturas).

create table if not exists public.app_tabs_por_local (
  tab text primary key,
  constraint app_tabs_por_local_tab_lower check (tab = lower(tab) and position(':' in tab) = 0)
);
-- Sem políticas: só o service role escreve; as funções abaixo (security definer) leem.
alter table public.app_tabs_por_local enable row level security;
insert into public.app_tabs_por_local (tab) values ('demos') on conflict do nothing;

create or replace function public.tabs_por_local()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(tab order by tab), '{}'::text[]) from public.app_tabs_por_local;
$$;

-- Fora de Aveiro e não administrador? (mesma regra de access_rank / restritoPeloLocal)
create or replace function public.local_restrito()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not (select public.is_app_admin()) and exists (
    select 1 from public.app_users u
    where lower(u.email) = lower(auth.jwt() ->> 'email')
      and not coalesce(u.local ? 'Aveiro', false)
      and coalesce(u.local ?| array['Maia', 'Porto', 'Gaia', 'Feira'], false)
  );
$$;

-- A viatura (`local` jsonb) é de algum dos locais da pessoa? Sem restrição de local: sempre.
create or replace function public.viatura_local_visivel(p_local jsonb)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not (select public.local_restrito()) or coalesce((
    select true
    from public.app_users u
    where lower(u.email) = lower(auth.jwt() ->> 'email')
      and jsonb_typeof(u.local) = 'array'
      and jsonb_typeof(p_local) = 'array'
      and u.local ?| array(select jsonb_array_elements_text(p_local))
  ), false);
$$;

-- Idem, a partir do chassis (para demo_capas).
create or replace function public.viatura_do_meu_local(p_chassis text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not (select public.local_restrito()) or exists (
    select 1 from public.viaturas v
    where v.chassis = p_chassis and (select public.viatura_local_visivel(v.local))
  );
$$;

-- Idem, a partir da pasta do bucket demo-capas (o chassis com os caracteres especiais em '_').
create or replace function public.viatura_do_meu_local_pasta(p_pasta text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not (select public.local_restrito()) or exists (
    select 1 from public.viaturas v
    where regexp_replace(v.chassis, '[^a-zA-Z0-9._-]', '_', 'g') = p_pasta
      and (select public.viatura_local_visivel(v.local))
  );
$$;

revoke all on function public.tabs_por_local(), public.local_restrito(), public.viatura_local_visivel(jsonb),
  public.viatura_do_meu_local(text), public.viatura_do_meu_local_pasta(text) from public, anon;
grant execute on function public.tabs_por_local(), public.local_restrito(), public.viatura_local_visivel(jsonb),
  public.viatura_do_meu_local(text), public.viatura_do_meu_local_pasta(text) to authenticated;

-- access_rank: acrescenta os tabs de app_tabs_por_local (e as suas ações) às exceções da regra
-- "fora de Aveiro só o End-of-Term".
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
            or split_part(p_tab, ':', 1) in (select t.tab from public.app_tabs_por_local t)
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

-- demos_viaturas(): mesma lista branca de chaves de preço de 20261012120000, agora com âmbito de local.
create or replace function public.demos_viaturas()
returns setof public.viaturas
language sql
stable
security definer
set search_path = ''
as $$
  select (jsonb_populate_record(
    null::public.viaturas,
    case
      when (select public.is_app_admin()) then to_jsonb(v)
      else to_jsonb(v) || jsonb_build_object(
        'inputs', coalesce((
          select jsonb_object_agg(e.key, e.value)
          from jsonb_each(coalesce(v.inputs, '{}'::jsonb)) e
          where e.key = any (array['pvb', 'opc', 'bsi', 'eco', 'leg', 'isv', 'pvp_desc'])
        ), '{}'::jsonb),
        'stats', coalesce((
          select jsonb_object_agg(e.key, e.value)
          from jsonb_each(coalesce(v.stats, '{}'::jsonb)) e
          where e.key = any (array['pvp_bruto', 'pvp_final', 'idade', 'idade_dias', 'penetracao', 'iva', 's_iva'])
        ), '{}'::jsonb)
      )
    end
  )).*
  from public.viaturas v
  where (select public.is_app_admin())
     or ((select public.has_access('demos')) and (select public.viatura_local_visivel(v.local)));
$$;

-- Empréstimos: sem local próprio, ficam fora do alcance de quem está restrito por local
-- (a escrita já exigia o tab 'emprestimos', que continua barrado).
drop policy if exists demos_select on public.demos;
create policy demos_select on public.demos
  for select to authenticated
  using ((select public.has_any_access(array['demos', 'emprestimos'])) and not (select public.local_restrito()));

drop policy if exists demo_emprestimos_select on public.demo_emprestimos;
create policy demo_emprestimos_select on public.demo_emprestimos
  for select to authenticated
  using ((select public.has_any_access(array['demos', 'emprestimos'])) and not (select public.local_restrito()));

-- Capas: ler continua aberto a quem vê Demos (são URLs de um bucket público); escrever só nas
-- viaturas dos seus locais.
drop policy if exists demo_capas_insert on public.demo_capas;
create policy demo_capas_insert on public.demo_capas
  for insert to authenticated
  with check ((select public.has_access('demos', 'edit')) and (select public.viatura_do_meu_local(chassis)));

drop policy if exists demo_capas_update on public.demo_capas;
create policy demo_capas_update on public.demo_capas
  for update to authenticated
  using ((select public.has_access('demos', 'edit')) and (select public.viatura_do_meu_local(chassis)))
  with check ((select public.has_access('demos', 'edit')) and (select public.viatura_do_meu_local(chassis)));

drop policy if exists demo_capas_delete on public.demo_capas;
create policy demo_capas_delete on public.demo_capas
  for delete to authenticated
  using ((select public.has_access('demos', 'edit')) and (select public.viatura_do_meu_local(chassis)));

drop policy if exists demo_capas_obj_insert on storage.objects;
create policy demo_capas_obj_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'demo-capas' and (select public.has_access('demos', 'edit'))
    and (select public.viatura_do_meu_local_pasta(split_part(name, '/', 1))));

drop policy if exists demo_capas_obj_update on storage.objects;
create policy demo_capas_obj_update on storage.objects
  for update to authenticated
  using (bucket_id = 'demo-capas' and (select public.has_access('demos', 'edit'))
    and (select public.viatura_do_meu_local_pasta(split_part(name, '/', 1))))
  with check (bucket_id = 'demo-capas' and (select public.has_access('demos', 'edit'))
    and (select public.viatura_do_meu_local_pasta(split_part(name, '/', 1))));

drop policy if exists demo_capas_obj_delete on storage.objects;
create policy demo_capas_obj_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'demo-capas' and (select public.has_access('demos', 'edit'))
    and (select public.viatura_do_meu_local_pasta(split_part(name, '/', 1))));
