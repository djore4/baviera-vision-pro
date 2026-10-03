-- RLS por perfil: a matriz de permissões (app_roles.permissions) passa a ser
-- imposta pela base de dados, não só escondida na interface.
--
-- Antes: qualquer utilizador da plataforma (email em app_users/platform_admins)
-- lia e escrevia as 31 tabelas de negócio. A matriz view/edit por tab só
-- filtrava a UI — quem abrisse a consola do browser com o seu token escrevia
-- onde quisesse.
--
-- Agora: cada tabela tem uma política de leitura e de escrita expressa em
-- termos dos mesmos tabs da matriz. A lógica espelha PermissionsContext.access():
--   admin (platform_admins ou perfil is_admin)  -> edit em tudo
--   senão: máximo entre o nível do perfil e a exceção por email
--   (app_access_exceptions, o equivalente em BD de client.tabAccessExceptions)
--
-- Princípio de rollout: a BD nunca é mais permissiva do que a UI pretende, mas
-- também não é mais restritiva do que aquilo que a UI legitimamente permite
-- (ex.: o Lavador, com 'view' em lavagem, cria e inicia lavagens).
--
-- Limitações conhecidas (ver supabase/README.md):
--  * lavagem: a UI decide algumas ações pelo NOME do perfil (Lavador, Preparador,
--    APV…); a BD só distingue view/edit do tab.
--  * prospecao: escreve quem tem acesso ao tab; o isolamento por vendedor (cada
--    um só vê as suas contas) continua a ser da aplicação.

-- ── Exceções de acesso por email ────────────────────────────────────────────
create table if not exists public.app_access_exceptions (
  email text not null,
  tab text not null,
  level text not null,
  created_at timestamp with time zone default now() not null,
  constraint app_access_exceptions_pkey primary key (email, tab),
  constraint app_access_exceptions_level_check check (level in ('view', 'edit')),
  constraint app_access_exceptions_email_lower check (email = lower(email))
);
-- Sem políticas: só o service role escreve; as funções abaixo (security definer) leem.
alter table public.app_access_exceptions enable row level security;

-- Migra a exceção que existia em src/clients/baviera/config.ts
-- (tabAccessExceptions). Só entra se o utilizador existir neste projeto, para
-- não deixar rasto da Baviera noutros clientes.
insert into public.app_access_exceptions (email, tab, level)
select 'tiago.santos@caetano.pt', 'stock', 'edit'
where exists (select 1 from public.app_users where lower(email) = 'tiago.santos@caetano.pt')
on conflict (email, tab) do nothing;

-- ── Funções de acesso ───────────────────────────────────────────────────────
-- Todas stable + security definer + search_path vazio, como is_platform_user().

create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    exists (
      select 1 from public.platform_admins p
      where p.email = lower(auth.jwt() ->> 'email')
    ) or exists (
      select 1
      from public.app_users u
      join public.app_roles r on r.name = u.perfil
      where lower(u.email) = lower(auth.jwt() ->> 'email')
        and r.is_admin
    ),
    false
  );
$$;

-- Nível de acesso ao tab: 0 = none, 1 = view, 2 = edit.
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
        union all
        select e.level
        from public.app_access_exceptions e
        where e.email = lower(auth.jwt() ->> 'email') and e.tab = p_tab
      ) levels
    ), 0)
  end;
$$;

create or replace function public.has_access(p_tab text, p_level text default 'view')
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.access_rank(p_tab) >= case p_level when 'edit' then 2 else 1 end;
$$;

-- Verdadeiro se tiver o nível pedido em pelo menos um dos tabs.
create or replace function public.has_any_access(p_tabs text[], p_level text default 'view')
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(bool_or(public.access_rank(t) >= case p_level when 'edit' then 2 else 1 end), false)
  from unnest(p_tabs) as t;
$$;

-- Verdadeiro se tiver acesso a pelo menos um tab (base para dados partilhados
-- por quase todas as áreas, como control_records).
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
      select 1 from public.app_access_exceptions e
      where e.email = lower(auth.jwt() ->> 'email')
    );
$$;

-- Escrita nos ficheiros do bucket excel-files, por nome de ficheiro.
create or replace function public.can_write_excel_file(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_name
    when 'escala-teste.json'  then public.has_access('escala')            -- escala VN: editável por todos com acesso
    when 'escala-vu.json'     then public.has_access('escala-vu', 'edit')
    when 'escala-repsol.json' then public.has_access('escala-repsol', 'edit')
    else public.has_access('dados', 'edit')                               -- backup do Excel de control, etc.
  end;
$$;

revoke all on function
  public.is_app_admin(), public.access_rank(text), public.has_access(text, text),
  public.has_any_access(text[], text), public.has_any_tab(), public.can_write_excel_file(text)
from public, anon;
grant execute on function
  public.is_app_admin(), public.access_rank(text), public.has_access(text, text),
  public.has_any_access(text[], text), public.has_any_tab(), public.can_write_excel_file(text)
to authenticated;

-- ── Políticas por tabela ────────────────────────────────────────────────────
-- Helper descartável: ativa RLS, remove as políticas existentes e cria uma por
-- operação. Cada expressão é aplicada tal como está (using / with check).
create function pg_temp.apply_rls(t text, sel text, ins text, upd text, del text)
returns void
language plpgsql
as $fn$
declare
  p record;
begin
  execute format('alter table public.%I enable row level security', t);
  for p in select policyname from pg_policies
           where schemaname = 'public' and tablename = t loop
    execute format('drop policy %I on public.%I', p.policyname, t);
  end loop;
  if sel is not null then
    execute format('create policy %I on public.%I for select to authenticated using (%s)',
      t || '_select', t, sel);
  end if;
  if ins is not null then
    execute format('create policy %I on public.%I for insert to authenticated with check (%s)',
      t || '_insert', t, ins);
  end if;
  if upd is not null then
    execute format('create policy %I on public.%I for update to authenticated using (%s) with check (%s)',
      t || '_update', t, upd, upd);
  end if;
  if del is not null then
    execute format('create policy %I on public.%I for delete to authenticated using (%s)',
      t || '_delete', t, del);
  end if;
end;
$fn$;

do $$
declare
  -- Atalhos. O `select` à volta de cada chamada faz o Postgres avaliá-la uma só
  -- vez por consulta (initplan) em vez de uma vez por linha.
  any_tab  text := '(select public.has_any_tab())';
  adm      text := '(select public.is_app_admin())';
  w        text;
begin
  -- Dados-base lidos por quase todas as áreas; só se escrevem na importação
  -- (tab dados) ou na edição direta (tab database).
  w := '(select public.has_any_access(array[''dados'', ''database''], ''edit''))';
  perform pg_temp.apply_rls('control_records', any_tab, w, w, w);

  w := '(select public.has_access(''dados'', ''edit''))';
  perform pg_temp.apply_rls('control_records_vu', any_tab, w, w, w);
  perform pg_temp.apply_rls('vu_objetivos',       any_tab, w, w, w);
  -- (quem importa precisa de ler: o upsert/delete avalia a política de select)
  perform pg_temp.apply_rls('angariacoes_vu',
    '((select public.has_access(''angariacao'')) or ' || w || ')', w, w, w);

  w := '(select public.has_any_access(array[''objetivos'', ''dados''], ''edit''))';
  perform pg_temp.apply_rls('objetivos_orcamento', any_tab, w, w, w);
  perform pg_temp.apply_rls('objetivos_resp',      any_tab, w, w, w);

  -- End-of-Term
  w := '(select public.has_any_access(array[''end-of-term'', ''dados''], ''edit''))';
  perform pg_temp.apply_rls('eot_contracts',
    '((select public.has_access(''end-of-term'')) or ' || w || ')', w, w, w);
  w := '(select public.has_access(''end-of-term'', ''edit''))';
  perform pg_temp.apply_rls('eot_activities',
    '(select public.has_access(''end-of-term''))', w, w, w);

  -- Lavagem: quem tem acesso ao tab cria/inicia/atualiza (o Lavador só tem
  -- 'view'); apagar exige 'edit'. Os eventos são um registo de auditoria:
  -- qualquer um acrescenta, só o admin altera ou apaga.
  w := '(select public.has_access(''lavagem''))';
  perform pg_temp.apply_rls('car_wash_cycles', w, w, w,
    '(select public.has_access(''lavagem'', ''edit''))');
  perform pg_temp.apply_rls('car_wash_events', w, w, adm, adm);

  -- Qualidade: leitura geral (radar nos dashboards), escrita só admin.
  perform pg_temp.apply_rls('quality_scores', any_tab, adm, adm, adm);

  -- Stock / retomas
  w := '(select public.has_access(''stock'', ''edit''))';
  perform pg_temp.apply_rls('retomas',
    '(select public.has_any_access(array[''stock'', ''vendedores'', ''wip'']))', w, w, w);

  -- Diário (prospeção): tudo o que o tab usa, com acesso ao tab.
  w := '(select public.has_access(''prospecao''))';
  perform pg_temp.apply_rls('prospec_accounts',     w, w, w, w);
  perform pg_temp.apply_rls('prospec_contacts',     w, w, w, w);
  perform pg_temp.apply_rls('prospec_interactions', w, w, w, w);
  perform pg_temp.apply_rls('prospec_tasks',        w, w, w, w);
  perform pg_temp.apply_rls('historico',            w, w, w, w);

  -- Demos / empréstimos
  w := '(select public.has_access(''emprestimos'', ''edit''))';
  perform pg_temp.apply_rls('demos',
    '(select public.has_any_access(array[''demos'', ''emprestimos'']))', w, w, w);
  perform pg_temp.apply_rls('demo_emprestimos',
    '(select public.has_any_access(array[''demos'', ''emprestimos'']))', w, w, w);
  w := '(select public.has_access(''demos'', ''edit''))';
  perform pg_temp.apply_rls('demo_capas',
    '(select public.has_any_access(array[''demos'', ''emprestimos'']))', w, w, w);
  -- viaturas é partilhada com outra aplicação (sem escrita aqui).
  perform pg_temp.apply_rls('viaturas', any_tab, adm, adm, adm);

  -- Multas
  w := '(select public.has_access(''multas'', ''edit''))';
  perform pg_temp.apply_rls('infractions',    '(select public.has_access(''multas''))', w, w, w);
  perform pg_temp.apply_rls('penalties',      '(select public.has_access(''multas''))', w, w, w);
  perform pg_temp.apply_rls('penalty_cycles', '(select public.has_access(''multas''))', w, w, w);

  -- Notificações: lê as gerais ('all') e as dirigidas a um tab a que tenha
  -- acesso (antes isto era só um filtro na UI); só o admin publica.
  perform pg_temp.apply_rls('notifications',
    '((audience = ''all'' and ' || any_tab || ') or (audience <> ''all'' and (select public.has_access(audience))))',
    adm, adm, adm);
  -- Estado de leitura: cada um só vê e altera o seu.
  w := '(select public.is_platform_user()) and user_email = lower((select auth.jwt() ->> ''email''))';
  perform pg_temp.apply_rls('notification_reads', w, w, w, w);

  -- Contas e funções: toda a gente da plataforma lê (precisa delas para
  -- resolver as suas permissões); escritas só pela edge function admin-users.
  perform pg_temp.apply_rls('app_users', '(select public.is_platform_user())', null, null, null);
  perform pg_temp.apply_rls('app_roles', '(select public.is_platform_user())', null, null, null);

  -- Sem uso na aplicação / partilhadas com outra aplicação: só admin.
  perform pg_temp.apply_rls('crm_notes',        adm, adm, adm, adm);
  perform pg_temp.apply_rls('crm_reminders',    adm, adm, adm, adm);
  perform pg_temp.apply_rls('demo_afetacoes',   adm, adm, adm, adm);
  perform pg_temp.apply_rls('demo_pessoas',     adm, adm, adm, adm);
  perform pg_temp.apply_rls('utilizadores',     adm, adm, adm, adm);

  -- Sem políticas: só service role.
  perform pg_temp.apply_rls('platform_admins',    null, null, null, null);
  perform pg_temp.apply_rls('prospec_push_subs',  null, null, null, null);
  perform pg_temp.apply_rls('prospec_push_sent',  null, null, null, null);
end $$;

-- ── Storage ─────────────────────────────────────────────────────────────────
drop policy if exists excel_files_select on storage.objects;
drop policy if exists excel_files_insert on storage.objects;
drop policy if exists excel_files_update on storage.objects;
drop policy if exists excel_files_delete on storage.objects;
drop policy if exists demo_capas_obj_insert on storage.objects;
drop policy if exists demo_capas_obj_update on storage.objects;
drop policy if exists demo_capas_obj_delete on storage.objects;

-- excel-files: privado. Lê quem tiver acesso a algum tab (escalas, backup do
-- control); escreve consoante o ficheiro (can_write_excel_file); só o admin apaga.
create policy excel_files_select on storage.objects
  for select to authenticated
  using (bucket_id = 'excel-files' and (select public.has_any_tab()));
create policy excel_files_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'excel-files' and (select public.can_write_excel_file(name)));
create policy excel_files_update on storage.objects
  for update to authenticated
  using (bucket_id = 'excel-files' and (select public.can_write_excel_file(name)))
  with check (bucket_id = 'excel-files' and (select public.can_write_excel_file(name)));
create policy excel_files_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'excel-files' and (select public.is_app_admin()));

-- demo-capas: leitura pública (inalterada, demo_capas_obj_read); escrita só com
-- edição do tab Demos.
create policy demo_capas_obj_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'demo-capas' and (select public.has_access('demos', 'edit')));
create policy demo_capas_obj_update on storage.objects
  for update to authenticated
  using (bucket_id = 'demo-capas' and (select public.has_access('demos', 'edit')))
  with check (bucket_id = 'demo-capas' and (select public.has_access('demos', 'edit')));
create policy demo_capas_obj_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'demo-capas' and (select public.has_access('demos', 'edit')));
