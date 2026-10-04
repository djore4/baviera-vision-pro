-- Testes das políticas RLS por perfil (migração 20261003100000_rls_por_perfil).
-- Corre em supabase/tests/run.sh, depois de baseline + migrações + seed.
-- Falha (exit != 0) se qualquer verificação falhar.
\set ON_ERROR_STOP on

-- ── Helpers ─────────────────────────────────────────────────────────────────
create schema t;
grant usage on schema t to anon, authenticated;

create function t.as_user(p_email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('email', p_email)::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

create function t.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'anon', true);
end $$;

create function t.back() returns void language plpgsql as $$
begin execute 'reset role'; end $$;

-- Linhas visíveis na tabela para o utilizador atual.
create function t.n(tbl text) returns bigint language plpgsql as $$
declare c bigint;
begin
  execute format('select count(*) from public.%I', tbl) into c;
  return c;
end $$;

-- INSERT com a política em causa: 42501 = negado; qualquer outro resultado
-- (sucesso, NOT NULL, FK…) significa que o with check deixou passar — o Postgres
-- avalia o with check antes das restrições.
create function t.can_insert(tbl text) returns boolean language plpgsql as $$
begin
  execute format('insert into public.%I default values', tbl);
  return true;
exception
  when insufficient_privilege then return false;
  when others then return true;
end $$;

create function t.can_insert_obj(bkt text, nm text) returns boolean language plpgsql as $$
begin
  insert into storage.objects (bucket_id, name) values (bkt, nm);
  return true;
exception when insufficient_privilege then return false;
end $$;

-- Linhas afetadas por um UPDATE/DELETE (a RLS filtra em silêncio).
create function t.dml(sql text) returns bigint language plpgsql as $$
declare c bigint;
begin
  execute sql;
  get diagnostics c = row_count;
  return c;
exception when insufficient_privilege then return -1;
end $$;

create table t.results (label text, ok boolean);
grant insert on t.results to anon, authenticated;

create function t.check(label text, ok boolean) returns void language plpgsql as $$
begin
  insert into t.results values (label, ok is true);
  if ok is not true then raise warning 'FALHOU: %', label; end if;
end $$;

grant execute on all functions in schema t to anon, authenticated;

-- ── Dados de teste ──────────────────────────────────────────────────────────
insert into public.platform_admins (email) values ('admin_pa@x.pt');
insert into public.app_users (nome, email, perfil) values
  ('Admin função', 'admin_role@x.pt', 'Administrador'),
  ('Vendedor VN',  'VN@x.pt',         'Vendedor VN'),      -- maiúsculas de propósito
  ('Vendedor VU',  'vu@x.pt',         'Vendedor VU'),
  ('CV VU',        'cv@x.pt',         'CV VU'),
  ('Finance',      'fin@x.pt',        'Finance'),
  ('Lavador',      'lav@x.pt',        'Lavador'),
  ('Preparador',   'prep@x.pt',       'Preparador'),
  ('Tiago',        'tiago@x.pt',      'Vendedor VU'),
  ('Sem perfil',   'norole@x.pt',     null);
insert into public.app_access_exceptions (email, tab, level) values ('tiago@x.pt', 'stock', 'edit');

-- Uma linha em cada tabela de negócio (como superuser), com valores genéricos
-- para as colunas NOT NULL sem default. FKs desligadas só para este seed.
set session_replication_role = replica;
do $$
declare
  r record; cols text; vals text; seeded text[] := '{}'; skipped text[] := '{}';
begin
  for r in
    select c.relname as t from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and c.relname not in ('platform_admins', 'app_users', 'app_roles', 'app_access_exceptions',
                            'notifications', 'notification_reads', 'penalty_cycles')
  loop
    select string_agg(format('%I', column_name), ', '),
           string_agg(case
             when column_name = 'tipo' and table_name = 'objetivos_orcamento' then '''BMW'''
             when column_name = 'tipo' and table_name = 'demo_emprestimos' then '''interno'''
             when column_name = 'wash_type' then '''simples'''
             when column_name = 'action' then '''create'''
             when column_name = 'fim' then 'now() + interval ''1 day'''
             when data_type = 'uuid' then 'gen_random_uuid()'
             when data_type in ('integer','bigint','smallint','numeric') then '1'
             when data_type = 'boolean' then 'false'
             when data_type like 'timestamp%' or data_type = 'date' then 'now()'
             when data_type = 'jsonb' then '''{}''::jsonb'
             else '''x''' end, ', ')
    into cols, vals
    from information_schema.columns
    where table_schema = 'public' and table_name = r.t and is_nullable = 'NO' and column_default is null and is_identity = 'NO';
    begin
      if cols is null then execute format('insert into public.%I default values', r.t);
      else execute format('insert into public.%I (%s) values (%s)', r.t, cols, vals); end if;
      seeded := seeded || r.t;
    exception when others then
      skipped := skipped || (r.t || ' (' || sqlerrm || ')');
    end;
  end loop;
  raise notice 'seed: % tabelas; sem linha: %', cardinality(seeded), skipped;
end $$;
reset session_replication_role;


-- Diário: dois donos, com o email do vn guardado em maiúsculas de propósito.
delete from public.prospec_interactions; delete from public.prospec_contacts;
delete from public.prospec_tasks; delete from public.prospec_accounts;
insert into public.prospec_accounts (id, nome, fase, owner_email) values
  ('00000000-0000-0000-0000-0000000000a1', 'conta do vn', 'novo', 'VN@x.pt'),
  ('00000000-0000-0000-0000-0000000000a2', 'conta do cv', 'novo', 'cv@x.pt');
insert into public.prospec_tasks (type, account_id, owner_email, descricao) values
  ('todo', '00000000-0000-0000-0000-0000000000a1', 'vn@x.pt', 'tarefa do vn'),
  ('todo', '00000000-0000-0000-0000-0000000000a2', 'cv@x.pt', 'tarefa do cv'),
  ('todo', null, null, 'tarefa sem dono');
insert into public.prospec_contacts (account_id, nome) values
  ('00000000-0000-0000-0000-0000000000a1', 'contacto do vn'),
  ('00000000-0000-0000-0000-0000000000a2', 'contacto do cv');
insert into public.prospec_interactions (account_id, tipo, occurred_at) values
  ('00000000-0000-0000-0000-0000000000a1', 'chamada', now()),
  ('00000000-0000-0000-0000-0000000000a2', 'chamada', now());


-- End-of-Term: contratos de dois donos (o do vendedor com o email em maiúsculas), um sem dono, e atividades.
delete from public.eot_activities; delete from public.eot_contracts;
insert into public.eot_contracts (contrato, cliente, owner_email) values
  ('EOT-V1', 'cliente do vendedor 1', 'EOTV@x.pt'),
  ('EOT-V2', 'cliente do vendedor 2', 'eot2@x.pt'),
  ('EOT-NONE', 'sem dono', null);
insert into public.eot_activities (contrato, tipo, descricao) values
  ('EOT-V1', 'chamada', 'atividade do contrato 1'),
  ('EOT-V2', 'chamada', 'atividade do contrato 2');
insert into public.app_roles (name, is_admin, permissions) values
  ('Vendedor EOT', false, '{"end-of-term": "edit"}'),
  ('Consulta EOT', false, '{"end-of-term": "view"}'),
  ('Importador', false, '{"dados": "edit"}'),
  ('Todos sem tab', false, '{"end-of-term:todos": "edit"}');
insert into public.app_users (nome, email, perfil) values
  ('Vend EOT 1', 'eotv@x.pt', 'Vendedor EOT'), ('Vend EOT 2', 'eot2@x.pt', 'Vendedor EOT'),
  ('Consulta', 'eotview@x.pt', 'Consulta EOT'), ('Importador', 'imp@x.pt', 'Importador'),
  ('Todos sem tab', 'todossemtab@x.pt', 'Todos sem tab');

insert into public.notifications (title, audience) values
  ('geral', 'all'), ('lavagem', 'lavagem'), ('eot', 'end-of-term');
insert into public.notification_reads (notification_id, user_email)
  select id, 'vn@x.pt' from public.notifications limit 1;
insert into public.notification_reads (notification_id, user_email)
  select id, 'cv@x.pt' from public.notifications limit 1;
insert into storage.objects (bucket_id, name) values
  ('excel-files', 'escala-teste.json'), ('excel-files', 'escala-vu.json'),
  ('excel-files', 'bmw-business-control.xlsx'), ('demo-capas', 'cover.png');

-- ── Funções de acesso ───────────────────────────────────────────────────────
begin;
select t.as_user('VN@X.PT');   -- o email do token vem em qualquer capitalização
select t.check('rank: vn lavagem=view',  public.access_rank('lavagem') = 1);
select t.check('rank: vn funil=view',    public.access_rank('funil') = 1);
select t.check('rank: vn stock=none',    public.access_rank('stock') = 0);
select t.back();
commit;
begin;
select t.as_user('tiago@x.pt');
select t.check('rank: tiago stock=edit (exceção)', public.access_rank('stock') = 2);
select t.check('rank: tiago wip=view (perfil)',    public.access_rank('wip') = 1);
select t.back();
commit;
begin;
select t.as_user('admin_pa@x.pt');
select t.check('rank: platform admin = edit em tudo', public.access_rank('qualquer-coisa') = 2);
select t.back();
commit;
begin;
select t.as_user('admin_role@x.pt');
select t.check('rank: perfil is_admin = edit em tudo', public.has_access('database', 'edit'));
select t.back();
commit;
begin;
select t.as_user('outsider@x.pt');
select t.check('rank: estranho = none', public.access_rank('lavagem') = 0 and not public.has_any_tab());
select t.back();
commit;
begin;
select t.as_user('norole@x.pt');
select t.check('rank: sem perfil = none', not public.has_any_tab());
select t.back();
commit;

-- Funções não executáveis por anon.
begin;
select t.as_anon();
select t.check('anon não executa my_access_exceptions',
  t.dml($q$ select public.my_access_exceptions() $q$) = -1);
select t.check('anon não executa has_access',
  t.dml($q$ select public.has_access('lavagem') $q$) = -1);
select t.back();
commit;

-- ── Estranho (autenticado, fora da plataforma) e anon: nada ─────────────────
begin;
select t.as_user('outsider@x.pt');
select t.check('estranho: não lê control_records', t.n('control_records') = 0);
select t.check('estranho: não lê app_users',       t.n('app_users') = 0);
select t.check('estranho: não lê notifications',   t.n('notifications') = 0);
select t.check('estranho: não escreve',            not t.can_insert('control_records') and not t.can_insert('retomas'));
select t.check('estranho: storage vazio',          not t.can_insert_obj('excel-files', 'escala-teste.json'));
select t.back();
commit;
begin;
select t.as_anon();
select t.check('anon: não lê control_records', t.n('control_records') = 0);
select t.check('anon: não escreve',            not t.can_insert('control_records'));
select t.back();
commit;

-- ── Utilizador gerido mas sem perfil ────────────────────────────────────────
begin;
select t.as_user('norole@x.pt');
select t.check('sem perfil: lê app_users/app_roles (precisa para resolver permissões)',
  t.n('app_users') > 0 and t.n('app_roles') > 0);
select t.check('sem perfil: não lê dados de negócio',
  t.n('control_records') = 0 and t.n('retomas') = 0 and t.n('notifications') = 0);
select t.back();
commit;

-- ── Vendedor VN ─────────────────────────────────────────────────────────────
-- perfil: funil, escala, lavagem, retails, carteira, producao, prospecao,
-- vendedores, ficha-margem (todos view)
begin;
select t.as_user('vn@x.pt');
select t.check('vn: lê control_records',        t.n('control_records') > 0);
select t.check('vn: lê objetivos',              t.n('objetivos_orcamento') > 0 and t.n('objetivos_resp') > 0);
select t.check('vn: lê quality_scores',         t.n('quality_scores') > 0);
select t.check('vn: lê retomas (vendedores)',   t.n('retomas') > 0);
select t.check('vn: lê prospec',                t.n('prospec_accounts') > 0 and t.n('prospec_tasks') > 0);
select t.check('vn: lê lavagem',                t.n('car_wash_cycles') > 0);
select t.check('vn: NÃO lê eot',                t.n('eot_contracts') = 0 and t.n('eot_activities') = 0);
select t.check('vn: NÃO lê multas',             t.n('penalties') = 0 and t.n('infractions') = 0);
select t.check('vn: NÃO lê angariação',         t.n('angariacoes_vu') = 0);
select t.check('vn: NÃO lê demos/empréstimos',  t.n('demos') = 0 and t.n('demo_emprestimos') = 0);
select t.check('vn: NÃO lê tabelas só-admin',   t.n('crm_notes') = 0 and t.n('utilizadores') = 0 and t.n('demo_pessoas') = 0);
select t.check('vn: NÃO lê platform_admins/push', t.n('platform_admins') = 0 and t.n('prospec_push_subs') = 0);
select t.check('vn: notificações = gerais + lavagem (não eot)',
  (select count(*) from public.notifications) = 2
  and not exists (select 1 from public.notifications where audience = 'end-of-term'));
select t.check('vn: só vê o seu estado de leitura',
  (select count(*) from public.notification_reads) = 1
  and not exists (select 1 from public.notification_reads where user_email <> 'vn@x.pt'));
-- escritas negadas
select t.check('vn: NÃO escreve control_records',
  not t.can_insert('control_records')
  and t.dml($q$ update public.control_records set obs = 'hack' $q$) = 0
  and t.dml($q$ delete from public.control_records $q$) = 0);
select t.check('vn: NÃO escreve objetivos',      not t.can_insert('objetivos_resp') and not t.can_insert('objetivos_orcamento'));
select t.check('vn: NÃO escreve retomas',        not t.can_insert('retomas'));
select t.check('vn: NÃO escreve quality_scores', not t.can_insert('quality_scores'));
select t.check('vn: NÃO publica notificações',   not t.can_insert('notifications'));
select t.check('vn: NÃO apaga notificações',     t.dml($q$ delete from public.notifications $q$) = 0);
select t.check('vn: NÃO altera app_users/app_roles',
  not t.can_insert('app_users') and not t.can_insert('app_roles')
  and t.dml($q$ update public.app_roles set is_admin = true $q$) = 0
  and t.dml($q$ update public.app_users set perfil = 'Administrador' $q$) = 0);
select t.check('vn: NÃO escreve eot/multas',     not t.can_insert('eot_contracts') and not t.can_insert('penalties'));
-- escritas permitidas
select t.check('vn: escreve o seu Diário',
  t.dml($q$ update public.prospec_tasks set done = true $q$) > 0);
select t.check('vn: NÃO cria, atualiza nem apaga lavagens (só consulta)',
  not t.can_insert('car_wash_cycles')
  and t.dml($q$ update public.car_wash_cycles set notes = 'n' $q$) = 0
  and t.dml($q$ delete from public.car_wash_cycles $q$) = 0);
select t.check('vn: NÃO apaga lavagens (exige edit)',
  t.dml($q$ delete from public.car_wash_cycles $q$) = 0);
select t.check('vn: NÃO lê nem escreve a auditoria de lavagens',
  t.n('car_wash_events') = 0 and not t.can_insert('car_wash_events'));
select t.check('vn: marca como lida só em seu nome',
  t.can_insert('notification_reads') is not null
  and t.dml($q$ insert into public.notification_reads (notification_id, user_email)
                select id, 'outro@x.pt' from public.notifications limit 1 $q$) = -1
  and t.dml($q$ insert into public.notification_reads (notification_id, user_email)
                select id, 'vn@x.pt' from public.notifications offset 1 limit 1 $q$) = 1);
select t.check('vn: não altera estado de leitura alheio',
  t.dml($q$ update public.notification_reads set read_at = now() where user_email = 'cv@x.pt' $q$) = 0
  and t.dml($q$ delete from public.notification_reads where user_email = 'cv@x.pt' $q$) = 0);
-- storage
select t.check('vn: escreve escala VN (editável por todos com acesso)',
  t.can_insert_obj('excel-files', 'escala-teste.json'));
select t.check('vn: NÃO escreve escala VU',      not t.can_insert_obj('excel-files', 'escala-vu.json'));
select t.check('vn: NÃO escreve backup do Excel',not t.can_insert_obj('excel-files', 'bmw-business-control.xlsx'));
select t.check('vn: lê o bucket excel-files',
  (select count(*) from storage.objects where bucket_id = 'excel-files') >= 3);
select t.check('vn: NÃO apaga do excel-files',
  t.dml($q$ delete from storage.objects where bucket_id = 'excel-files' $q$) = 0);
select t.check('vn: NÃO escreve demo-capas',     not t.can_insert_obj('demo-capas', 'x.png'));
select t.back();
commit;

-- ── CV VU ───────────────────────────────────────────────────────────────────
-- wip/stock/escala-vu/angariacao = edit; dados = view; vários = view
begin;
select t.as_user('cv@x.pt');
select t.check('cv: lê angariação e retomas',    t.n('angariacoes_vu') > 0 and t.n('retomas') > 0);
select t.check('cv: escreve retomas (stock edit)', t.can_insert('retomas') and t.dml($q$ update public.retomas set updated_at = now() $q$) is not null);
select t.check('cv: dados=view → NÃO importa control/VU/angariação',
  not t.can_insert('control_records') and not t.can_insert('control_records_vu')
  and not t.can_insert('angariacoes_vu') and not t.can_insert('vu_objetivos')
  and t.dml($q$ delete from public.control_records_vu $q$) = 0);
select t.check('cv: escreve escala VU, não o backup',
  t.can_insert_obj('excel-files', 'escala-vu.json') and not t.can_insert_obj('excel-files', 'bmw-business-control.xlsx'));
select t.check('cv: NÃO lê eot',                 t.n('eot_contracts') = 0);
select t.back();
commit;

-- ── Finance ─────────────────────────────────────────────────────────────────
begin;
select t.as_user('fin@x.pt');
select t.check('fin: lê e escreve eot (end-of-term:todos)',
  t.n('eot_contracts') > 0 and t.n('eot_activities') > 0
  and t.dml($q$ insert into public.eot_activities (contrato, tipo) values ('EOT-V1', 'chamada') $q$) = 1
  and t.dml($q$ update public.eot_contracts set cliente = 'c' $q$) > 0);
select t.check('fin: NÃO lê prospeção nem lavagem', t.n('prospec_accounts') = 0 and t.n('car_wash_cycles') = 0);
select t.check('fin: NÃO escreve control_records',  not t.can_insert('control_records'));
select t.check('fin: vê notificações gerais + eot', (select count(*) from public.notifications) = 2
  and exists (select 1 from public.notifications where audience = 'end-of-term'));
select t.back();
commit;

-- ── Lavador (view) e Preparador (edit) ──────────────────────────────────────
begin;
select t.as_user('lav@x.pt');
select t.check('lavador: só lavagem + dados-base',
  t.n('car_wash_cycles') > 0 and t.n('control_records') > 0 and t.n('prospec_accounts') = 0);
select t.check('lavador: cria e inicia lavagens',
  t.can_insert('car_wash_cycles') and t.dml($q$ update public.car_wash_cycles set started_at = now() $q$) > 0);
select t.check('lavador: NÃO apaga lavagens', t.dml($q$ delete from public.car_wash_cycles $q$) = 0);
select t.check('lavador: regista eventos mas não lê a auditoria nem a altera',
  t.can_insert('car_wash_events') and t.n('car_wash_events') = 0
  and t.dml($q$ update public.car_wash_events set detail = 'x' $q$) = 0);
select t.back();
commit;
begin;
select t.as_user('prep@x.pt');
select t.check('preparador: apaga lavagens (edit)', t.dml($q$ delete from public.car_wash_cycles $q$) > 0);
select t.back();
commit;

-- Permissões finas da Lavagem (funções com chaves 'lavagem:<ação>')
insert into public.app_roles (name, is_admin, permissions) values
  ('APV', false, '{"lavagem": "edit", "lavagem:registos": "edit"}'),
  ('Qualidade', false, '{"lavagem": "view", "lavagem:qualidade": "edit"}'),
  ('Reagendador', false, '{"lavagem": "view", "lavagem:reagendar": "edit"}'),
  ('Sem acesso lavagem', false, '{"lavagem:iniciar": "edit"}');
insert into public.app_users (nome, email, perfil) values
  ('APV', 'apv@x.pt', 'APV'), ('QC', 'qc@x.pt', 'Qualidade'),
  ('Reag', 'reag@x.pt', 'Reagendador'), ('SemTab', 'semtab@x.pt', 'Sem acesso lavagem');
insert into public.car_wash_cycles (plate, wash_type, duration_min)
  values ('ZZ-00-ZZ', 'simples', 10), ('ZZ-00-ZY', 'simples', 10);
begin;
select t.as_user('apv@x.pt');
select t.check('apv: lê a auditoria (lavagem:registos) e gere lavagens (edit do tab)',
  t.n('car_wash_events') > 0 and t.can_insert('car_wash_cycles')
  and t.dml($q$ update public.car_wash_cycles set notes = 'a' where plate = 'ZZ-00-ZZ' $q$) = 1
  and t.dml($q$ delete from public.car_wash_cycles where plate = 'ZZ-00-ZY' $q$) = 1);
select t.check('apv: NÃO altera nem apaga a auditoria',
  t.dml($q$ update public.car_wash_events set detail = 'x' $q$) = 0
  and t.dml($q$ delete from public.car_wash_events $q$) = 0);
select t.back();
commit;
begin;
select t.as_user('qc@x.pt');
select t.check('qualidade: atribui qualidade (update) mas NÃO cria nem apaga lavagens',
  t.dml($q$ update public.car_wash_cycles set quality_score = 8 $q$) > 0
  and not t.can_insert('car_wash_cycles')
  and t.dml($q$ delete from public.car_wash_cycles $q$) = 0);
select t.check('qualidade: regista o evento mas NÃO lê a auditoria',
  t.can_insert('car_wash_events') and t.n('car_wash_events') = 0);
select t.back();
commit;
begin;
select t.as_user('reag@x.pt');
select t.check('reagendar (view no tab): edita e apaga lavagens existentes',
  t.dml($q$ update public.car_wash_cycles set notes = 'r' where plate = 'ZZ-00-ZZ' $q$) = 1
  and t.dml($q$ delete from public.car_wash_cycles where plate = 'ZZ-00-ZZ' $q$) = 1);
select t.back();
commit;
begin;
select t.as_user('semtab@x.pt');
select t.check('permissão fina sem acesso ao tab não lê as lavagens',
  t.n('car_wash_cycles') = 0);
select t.back();
commit;


-- ── Exceção por email ───────────────────────────────────────────────────────
begin;
select t.as_user('vu@x.pt');
select t.check('my_access_exceptions: sem exceções devolve {} (não vê as dos outros)',
  public.my_access_exceptions() = '{}'::jsonb);
select t.check('vu sem exceção: NÃO escreve retomas', not t.can_insert('retomas'));
select t.check('vu (escala-vu=view): lê mas NÃO escreve a escala VU',
  not t.can_insert_obj('excel-files', 'escala-vu.json') and not t.can_insert_obj('excel-files', 'escala-repsol.json'));
select t.check('vu: NÃO escreve angariação (view)', not t.can_insert('angariacoes_vu') and t.n('angariacoes_vu') > 0);
select t.back();
commit;
begin;
select t.as_user('tiago@x.pt');
select t.check('my_access_exceptions: devolve as exceções do próprio',
  public.my_access_exceptions() = '{"stock": "edit"}'::jsonb);
select t.check('tiago com exceção: escreve retomas', t.can_insert('retomas'));
select t.check('tiago: exceção não dá mais nada',    not t.can_insert('control_records_vu') and t.n('eot_contracts') = 0);
select t.back();
commit;

-- ── Administradores (platform_admins e perfil is_admin) ─────────────────────
begin;
select t.as_user('admin_pa@x.pt');
select t.check('admin(pa): lê tudo',
  t.n('crm_notes') > 0 and t.n('utilizadores') > 0 and t.n('eot_contracts') > 0 and t.n('penalties') > 0
  and t.n('angariacoes_vu') > 0 and t.n('demos') > 0);
select t.check('admin(pa): escreve tudo',
  t.can_insert('control_records') and t.can_insert('objetivos_resp') and t.can_insert('quality_scores')
  and t.can_insert('notifications') and t.can_insert('crm_notes') and t.can_insert('penalties')
  and t.can_insert('control_records_vu') and t.can_insert('demos') and t.can_insert('viaturas'));
select t.check('admin(pa): storage — escreve tudo e apaga do excel-files',
  t.can_insert_obj('excel-files', 'bmw-business-control.xlsx') and t.can_insert_obj('excel-files', 'escala-vu.json')
  and t.can_insert_obj('demo-capas', 'x.png')
  and t.dml($q$ delete from storage.objects where name = 'bmw-business-control.xlsx' $q$) > 0);
select t.check('admin(pa): mesmo admin não escreve app_users/app_roles (só edge function)',
  not t.can_insert('app_users') and not t.can_insert('app_roles'));
select t.check('admin(pa): platform_admins e push continuam fechados',
  t.n('platform_admins') = 0 and not t.can_insert('platform_admins') and not t.can_insert('prospec_push_subs'));
select t.back();
commit;
begin;
select t.as_user('admin_role@x.pt');
select t.check('admin(perfil): lê e escreve tudo',
  t.n('crm_notes') > 0 and t.can_insert('control_records') and t.can_insert('notifications')
  and (select count(*) from public.notifications where title in ('geral', 'lavagem', 'eot')) = 3);
select t.back();
commit;

-- ── Diário: cada vendedor só vê e altera o que é seu ────────────────────────
begin;
select t.as_user('vn@x.pt');
select t.check('diário/vn: só vê a sua conta, tarefa, contacto e interação',
  t.n('prospec_accounts') = 1 and t.n('prospec_tasks') = 1
  and t.n('prospec_contacts') = 1 and t.n('prospec_interactions') = 1
  and (select nome from public.prospec_accounts) = 'conta do vn');
select t.check('diário/vn: não vê a conta, tarefa nem contacto do colega nem tarefas sem dono',
  not exists (select 1 from public.prospec_accounts where nome = 'conta do cv')
  and not exists (select 1 from public.prospec_tasks where descricao in ('tarefa do cv', 'tarefa sem dono'))
  and not exists (select 1 from public.prospec_contacts where nome = 'contacto do cv'));
select t.check('diário/vn: cria conta e tarefa em seu nome',
  t.dml($q$ insert into public.prospec_accounts (nome, fase, owner_email) values ('nova', 'novo', 'vn@x.pt') $q$) = 1
  and t.dml($q$ insert into public.prospec_tasks (type, descricao, owner_email) values ('todo', 'nova', 'vn@x.pt') $q$) = 1);
select t.check('diário/vn: NÃO cria conta nem tarefa para outro dono nem sem dono',
  t.dml($q$ insert into public.prospec_accounts (nome, fase, owner_email) values ('x', 'novo', 'cv@x.pt') $q$) = -1
  and t.dml($q$ insert into public.prospec_accounts (nome, fase) values ('x', 'novo') $q$) = -1
  and t.dml($q$ insert into public.prospec_tasks (type, descricao, owner_email) values ('todo', 'x', 'cv@x.pt') $q$) = -1);
select t.check('diário/vn: altera a sua conta mas NÃO a passa para outro dono',
  t.dml($q$ update public.prospec_accounts set setor = 's' where nome = 'conta do vn' $q$) = 1
  and t.dml($q$ update public.prospec_accounts set owner_email = 'cv@x.pt' where nome = 'conta do vn' $q$) = -1);
select t.check('diário/vn: NÃO altera nem apaga o que é do colega',
  t.dml($q$ update public.prospec_accounts set setor = 'hack' where nome = 'conta do cv' $q$) = 0
  and t.dml($q$ delete from public.prospec_accounts where nome = 'conta do cv' $q$) = 0
  and t.dml($q$ update public.prospec_tasks set done = true where descricao = 'tarefa do cv' $q$) = 0);
select t.check('diário/vn: contactos e interações só na sua conta',
  t.dml($q$ insert into public.prospec_contacts (account_id, nome) values ('00000000-0000-0000-0000-0000000000a1', 'novo') $q$) = 1
  and t.dml($q$ insert into public.prospec_contacts (account_id, nome) values ('00000000-0000-0000-0000-0000000000a2', 'intruso') $q$) = -1
  and t.dml($q$ insert into public.prospec_interactions (account_id, tipo, occurred_at) values ('00000000-0000-0000-0000-0000000000a2', 'chamada', now()) $q$) = -1
  and t.dml($q$ delete from public.prospec_contacts where nome = 'contacto do cv' $q$) = 0);
select t.back();
commit;
begin;
select t.as_user('cv@x.pt');
select t.check('diário/cv: vê só o seu (a conta do vn, com email em maiúsculas, não)',
  t.n('prospec_accounts') = 1 and (select nome from public.prospec_accounts) = 'conta do cv'
  and t.n('prospec_tasks') = 1 and t.n('prospec_contacts') = 1);
select t.back();
commit;
begin;
select t.as_user('fin@x.pt');   -- sem acesso ao tab
select t.check('diário/fin: sem acesso ao tab não vê nem escreve nada',
  t.n('prospec_accounts') = 0 and t.n('prospec_tasks') = 0 and t.n('prospec_contacts') = 0
  and t.dml($q$ insert into public.prospec_accounts (nome, fase, owner_email) values ('x', 'novo', 'fin@x.pt') $q$) = -1);
select t.back();
commit;
begin;
select t.as_user('admin_role@x.pt');   -- o diretor vê tudo e reatribui
select t.check('diário/admin: vê todos os donos',
  t.n('prospec_accounts') >= 3 and t.n('prospec_tasks') >= 4 and t.n('prospec_contacts') >= 3);
select t.check('diário/admin: reatribui uma conta a outro vendedor',
  t.dml($q$ update public.prospec_accounts set owner_email = 'cv@x.pt' where nome = 'nova' $q$) = 1);
select t.back();
commit;

-- ── End-of-Term: cada vendedor só vê e altera os seus contratos ──────────────
begin;
select t.as_user('eotv@x.pt');   -- 'edit' no tab, sem end-of-term:todos
select t.check('eot/vendedor: só vê o seu contrato e as atividades dele',
  t.n('eot_contracts') = 1 and (select contrato from public.eot_contracts) = 'EOT-V1'
  and t.n('eot_activities') >= 1
  and (select count(distinct contrato) from public.eot_activities) = 1
  and (select min(contrato) from public.eot_activities) = 'EOT-V1');
select t.check('eot/vendedor: não vê o contrato do colega nem os sem dono',
  not exists (select 1 from public.eot_contracts where contrato in ('EOT-V2', 'EOT-NONE'))
  and not exists (select 1 from public.eot_activities where contrato = 'EOT-V2'));
select t.check('eot/vendedor: altera o seu contrato (fase, temperatura, observações)',
  t.dml($q$ update public.eot_contracts set fase = 'contactado', temperatura = 'quente', obs = 'x' where contrato = 'EOT-V1' $q$) = 1);
select t.check('eot/vendedor: NÃO altera nem apaga o contrato do colega nem o sem dono',
  t.dml($q$ update public.eot_contracts set fase = 'perdido' where contrato = 'EOT-V2' $q$) = 0
  and t.dml($q$ update public.eot_contracts set fase = 'perdido' where contrato = 'EOT-NONE' $q$) = 0
  and t.dml($q$ delete from public.eot_contracts where contrato in ('EOT-V2', 'EOT-NONE') $q$) = 0);
select t.check('eot/vendedor: NÃO passa o seu contrato a outro dono, nem o larga sem dono',
  t.dml($q$ update public.eot_contracts set owner_email = 'eot2@x.pt' where contrato = 'EOT-V1' $q$) = -1
  and t.dml($q$ update public.eot_contracts set owner_email = null where contrato = 'EOT-V1' $q$) = -1);
select t.check('eot/vendedor: NÃO se atribui um contrato que não é seu',
  t.dml($q$ update public.eot_contracts set owner_email = 'eotv@x.pt' where contrato = 'EOT-NONE' $q$) = 0);
select t.check('eot/vendedor: NÃO cria contratos (importação é do administrador)',
  t.dml($q$ insert into public.eot_contracts (contrato, owner_email) values ('EOT-NOVO', 'eotv@x.pt') $q$) = 1
  and t.dml($q$ insert into public.eot_contracts (contrato, owner_email) values ('EOT-NOVO2', 'eot2@x.pt') $q$) = -1);
select t.check('eot/vendedor: regista atividades no seu contrato, não no do colega',
  t.dml($q$ insert into public.eot_activities (contrato, tipo) values ('EOT-V1', 'email') $q$) = 1
  and t.dml($q$ insert into public.eot_activities (contrato, tipo) values ('EOT-V2', 'email') $q$) = -1
  and t.dml($q$ insert into public.eot_activities (contrato, tipo) values ('EOT-INEXISTENTE', 'email') $q$) = -1);
select t.check('eot/vendedor: conclui e apaga atividades do seu contrato, não as do colega',
  t.dml($q$ update public.eot_activities set done = true where contrato = 'EOT-V1' $q$) >= 1
  and t.dml($q$ update public.eot_activities set done = true where contrato = 'EOT-V2' $q$) = 0
  and t.dml($q$ delete from public.eot_activities where contrato = 'EOT-V2' $q$) = 0
  and t.dml($q$ delete from public.eot_activities where contrato = 'EOT-V1' $q$) >= 1);
select t.back();
commit;
begin;
select t.as_user('eot2@x.pt');
select t.check('eot/vendedor 2: vê só o dele (o dono do 1.º, em maiúsculas, não lhe aparece)',
  t.n('eot_contracts') = 1 and (select contrato from public.eot_contracts) = 'EOT-V2');
select t.back();
commit;
begin;
select t.as_user('eotview@x.pt');   -- só consulta
select t.check('eot/consulta: não tem contratos (não é dono de nenhum) e não escreve',
  t.n('eot_contracts') = 0
  and t.dml($q$ update public.eot_contracts set fase = 'perdido' $q$) = 0
  and t.dml($q$ insert into public.eot_activities (contrato, tipo) values ('EOT-V1', 'email') $q$) = -1);
select t.back();
commit;
begin;
select t.as_user('fin@x.pt');   -- Finance: end-of-term:todos
select t.check('eot/finance: vê todos os contratos, incluindo os sem dono, e as atividades',
  t.n('eot_contracts') >= 3 and exists (select 1 from public.eot_contracts where contrato = 'EOT-NONE')
  and t.n('eot_activities') >= 1);
select t.check('eot/finance: atribui um contrato sem dono e reatribui outro',
  t.dml($q$ update public.eot_contracts set owner_email = 'eotv@x.pt', owner_nome = 'Vend EOT 1' where contrato = 'EOT-NONE' $q$) = 1
  and t.dml($q$ update public.eot_contracts set owner_email = 'eot2@x.pt' where contrato = 'EOT-V1' $q$) = 1);
select t.back();
commit;
begin;
select t.as_user('imp@x.pt');   -- dados = edit: importa o mapa
select t.check('eot/importador (dados=edit): vê tudo e faz upsert por contrato',
  t.n('eot_contracts') >= 3
  and t.dml($q$ insert into public.eot_contracts (contrato, cliente) values ('EOT-V2', 'reimportado')
                on conflict (contrato) do update set cliente = excluded.cliente $q$) = 1
  and t.dml($q$ insert into public.eot_contracts (contrato, cliente) values ('EOT-IMPORTADO', 'novo')
                on conflict (contrato) do update set cliente = excluded.cliente $q$) = 1);
select t.back();
commit;
begin;
select t.as_user('todossemtab@x.pt');   -- tem end-of-term:todos mas não o tab
select t.check('eot: a permissão "todos" sem acesso ao tab não dá nada',
  t.n('eot_contracts') = 0 and t.n('eot_activities') = 0);
select t.back();
commit;
begin;
select t.as_user('admin_role@x.pt');
select t.check('eot/admin: vê tudo e atribui donos',
  t.n('eot_contracts') >= 4
  and t.dml($q$ update public.eot_contracts set owner_email = 'eotv@x.pt' where contrato = 'EOT-IMPORTADO' $q$) = 1);
select t.back();
commit;
begin;
select t.as_user('cv@x.pt');   -- dados = view
select t.check('eot/dados=view: não vê nem importa contratos',
  t.n('eot_contracts') = 0
  and t.dml($q$ insert into public.eot_contracts (contrato) values ('EOT-HACK') $q$) = -1);
select t.back();
commit;
begin;
select t.as_anon();
select t.check('eot/anon: nada', t.n('eot_contracts') = 0 and t.n('eot_activities') = 0);
select t.back();
commit;

-- ── Sales Force (outra aplicação no mesmo projeto) ──────────────────────────
-- As suas políticas têm de sobreviver à migração e continuar a funcionar; e quem
-- só é da Sales Force não ganha acesso a nada do resto.
select t.check('sales force: as 3 políticas continuam lá',
  (select count(*) from pg_policies where schemaname = 'public'
     and ((tablename = 'historico' and policyname = 'salesforce_users')
       or (tablename = 'viaturas' and policyname = 'salesforce_users')
       or (tablename = 'utilizadores' and policyname = 'salesforce_users_read'))) = 3);
select t.check('plataforma: as políticas legadas foram substituídas',
  not exists (select 1 from pg_policies where schemaname = 'public' and policyname in ('platform_users', 'platform_users_read')));
insert into public.utilizadores (email) values ('sf@x.pt');
begin;
select t.as_user('sf@x.pt');
select t.check('sales force: lê e escreve historico e viaturas',
  t.n('historico') > 0 and t.n('viaturas') > 0 and t.can_insert('historico') and t.can_insert('viaturas'));
select t.check('sales force: lê utilizadores mas não escreve',
  t.n('utilizadores') > 0 and not t.can_insert('utilizadores')
  and t.dml($q$ update public.utilizadores set email = email $q$) = 0);
select t.check('sales force: sem acesso ao resto da plataforma',
  t.n('control_records') = 0 and t.n('eot_contracts') = 0 and t.n('app_users') = 0
  and not t.can_insert('control_records') and not t.can_insert('retomas')
  and not t.can_insert('notifications') and not t.can_insert('prospec_accounts'));
select t.back();
commit;

-- ── Resultado ───────────────────────────────────────────────────────────────
do $$
declare total int := (select count(*) from t.results);
        fails int := (select count(*) from t.results where not ok);
begin
  raise notice '% verificações, % falhas', total, fails;
  if fails > 0 then raise exception 'RLS: % verificações falharam', fails; end if;
end $$;
