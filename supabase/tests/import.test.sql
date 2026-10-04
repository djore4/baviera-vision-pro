-- Testes da RPC replace_rows (importação atómica). Corre depois de rls.test.sql,
-- que cria o schema t (helpers), os utilizadores de teste e os dados-base.
\set ON_ERROR_STOP on

-- Executa uma instrução e devolve o SQLSTATE do erro (ou 'ok').
create function t.state(sql text) returns text language plpgsql as $$
begin execute sql; return 'ok';
exception when others then return sqlstate; end $$;
grant execute on function t.state(text) to authenticated;

delete from t.results;  -- só os resultados desta suite
delete from public.control_records;
insert into public.control_records (status, resp) values ('antigo', 'A'), ('antigo', 'B');

-- ── Admin: caminho feliz ────────────────────────────────────────────────────
begin;
select t.as_user('admin_pa@x.pt');
select t.check('admin: devolve o nº de linhas',
  public.replace_rows('control_records', '[{"status":"novo","resp":"X","qor":1,"neg":"2026-09-30"},
                                           {"status":"novo","resp":"Y","qor":0,"neg":null}]') = 2);
select t.check('admin: a tabela fica só com as linhas novas',
  (select count(*) from public.control_records) = 2
  and not exists (select 1 from public.control_records where status = 'antigo'));
select t.check('admin: id e defaults vêm da base de dados',
  not exists (select 1 from public.control_records where id is null)
  and (select count(distinct id) from public.control_records) = 2);
select t.check('admin: tipos convertidos (date, numeric)',
  (select neg from public.control_records where resp = 'X') = date '2026-09-30');
select t.back();
commit;

-- ── Atomicidade: uma linha má a meio não deixa a tabela a meio ──────────────
begin;
select t.as_user('admin_pa@x.pt');
select t.check('linha inválida (data) → erro 22007',
  t.state($q$ select public.replace_rows('control_records',
     '[{"status":"a","neg":"2026-01-01"},{"status":"b","neg":"isto-nao-e-data"},{"status":"c","neg":"2026-01-02"}]') $q$) = '22007');
select t.back();
commit;
select t.check('após o erro, os dados anteriores estão intactos',
  (select count(*) from public.control_records) = 2
  and exists (select 1 from public.control_records where resp = 'X'));

-- ── Validações ──────────────────────────────────────────────────────────────
begin;
select t.as_user('admin_pa@x.pt');
select t.check('vazio é rejeitado e nada é apagado',
  t.state($q$ select public.replace_rows('control_records', '[]') $q$) = '22023'
  and (select count(*) from public.control_records) = 2);
select t.check('vazio permitido só com p_allow_empty (angariações): devolve 0',
  public.replace_rows('angariacoes_vu', '[]', true) = 0);
select t.check('... e esvazia a tabela', (select count(*) from public.angariacoes_vu) = 0);
select t.check('tabela fora da lista é rejeitada',
  t.state($q$ select public.replace_rows('app_roles', '[{"name":"x"}]') $q$) = '22023'
  and t.state($q$ select public.replace_rows('control_records; drop table public.retomas', '[{"status":"x"}]') $q$) = '22023'
  and t.state($q$ select public.replace_rows(null, '[{"status":"x"}]') $q$) = '22023');
select t.check('coluna inexistente é rejeitada (sem SQL injection pelas chaves)',
  t.state($q$ select public.replace_rows('control_records', '[{"status\") values (1); drop table public.retomas; --":"x"}]') $q$) = '22023'
  and t.state($q$ select public.replace_rows('control_records', '[{"nao_existe":"x"}]') $q$) = '22023');
select t.check('id não é aceite no payload',
  t.state($q$ select public.replace_rows('control_records', '[{"id":"00000000-0000-0000-0000-000000000001","status":"x"}]') $q$) = '22023');
select t.check('payload que não é array / linhas que não são objetos',
  t.state($q$ select public.replace_rows('control_records', '{"status":"x"}') $q$) = '22023'
  and t.state($q$ select public.replace_rows('control_records', '[1,2]') $q$) = '22023');
select t.check('nenhuma das tentativas acima mexeu nos dados ou na tabela retomas',
  (select count(*) from public.control_records) = 2 and t.n('retomas') > 0);
select t.back();
commit;

-- ── Permissões (a RLS continua a mandar) ────────────────────────────────────
begin;
select t.as_user('vn@x.pt');
select t.check('vn: NÃO importa (RLS) e nada muda',
  t.state($q$ select public.replace_rows('control_records', '[{"status":"hack"}]') $q$) = '42501'
  and (select count(*) from public.control_records) = 2);
select t.back();
commit;
begin;
select t.as_user('cv@x.pt');   -- dados = view
select t.check('cv (dados=view): NÃO importa VU nem angariações',
  t.state($q$ select public.replace_rows('control_records_vu', '[{"status":"hack"}]') $q$) = '42501'
  and t.state($q$ select public.replace_rows('angariacoes_vu', '[{"resp":"hack"}]') $q$) = '42501');
select t.back();
commit;
begin;
select t.as_anon();
select t.check('anon: sem acesso à função', t.state($q$ select public.replace_rows('control_records', '[{"status":"x"}]') $q$) = '42501');
select t.back();
commit;
begin;
select t.as_user('outsider@x.pt');
select t.check('estranho: NÃO importa', t.state($q$ select public.replace_rows('control_records', '[{"status":"x"}]') $q$) = '42501');
select t.back();
commit;

-- Utilizador com dados=edit importa as três tabelas
-- (o perfil Importador e o utilizador imp@x.pt já podem existir, criados por rls.test.sql)
insert into public.app_roles (name, is_admin, permissions) values ('Importador', false, '{"dados":"edit"}') on conflict (name) do nothing;
insert into public.app_users (nome, email, perfil) values ('Imp', 'imp@x.pt', 'Importador') on conflict (email) do nothing;
begin;
select t.as_user('imp@x.pt');
select t.check('dados=edit: importa control, VU e angariações',
  public.replace_rows('control_records', '[{"status":"i"}]') = 1
  and public.replace_rows('control_records_vu', '[{"status":"i","dt_fecho":"2026-09-01"}]') = 1
  and public.replace_rows('angariacoes_vu', '[{"resp":"i","dt_ang":"2026-09-01","ano":2020,"kms":1000,"v_compra":12345.5}]') = 1);
select t.back();
commit;

-- ── import_control_excel: registos + objetivos numa só transação ─────────────
delete from public.control_records;
insert into public.control_records (status, resp) values ('antigo', 'A'), ('antigo', 'B');
delete from public.objetivos_orcamento; delete from public.objetivos_resp;
insert into public.objetivos_orcamento (ano, mes, tipo, orcamento) values (2025, 1, 'GSC', 5), (2026, 9, 'GSC', 1);
insert into public.objetivos_resp (ano, mes, responsavel, objetivo) values (2025, 1, 'Ana', 3);

-- falha nos objetivos (valor não inteiro) depois de os orçamentos já terem sido gravados
begin;
select t.as_user('imp@x.pt');
select t.check('excel: objetivo inválido → erro 22P02',
  t.state($q$ select public.import_control_excel(
    '[{"status":"novo","resp":"X"}]',
    '[{"ano":2026,"mes":9,"tipo":"GSC","orcamento":100}]',
    '[{"ano":2026,"mes":9,"responsavel":"Rui","objetivo":"abc"}]') $q$) = '22P02');
select t.back();
commit;
select t.check('excel: a falha desfaz TUDO — registos antigos intactos',
  (select count(*) from public.control_records) = 2
  and not exists (select 1 from public.control_records where status = 'novo'));
select t.check('excel: a falha desfaz TUDO — orçamentos e objetivos como estavam',
  (select orcamento from public.objetivos_orcamento where ano = 2026 and mes = 9 and tipo = 'GSC') = 1
  and (select count(*) from public.objetivos_orcamento) = 2
  and (select count(*) from public.objetivos_resp) = 1);

begin;
select t.as_user('imp@x.pt');
select t.check('excel: importa registos e devolve o nº de registos',
  public.import_control_excel(
    '[{"status":"novo","resp":"X"},{"status":"novo","resp":"Y"},{"status":"novo","resp":"Z"}]',
    '[{"ano":2026,"mes":9,"tipo":"GSC","orcamento":100},{"ano":2026,"mes":9,"tipo":"BMW","orcamento":200}]',
    '[{"ano":2026,"mes":9,"responsavel":"Rui","objetivo":7},{"ano":2025,"mes":1,"responsavel":"Ana","objetivo":4}]') = 3);
select t.back();
commit;
select t.check('excel: substitui os registos',
  (select count(*) from public.control_records) = 3 and not exists (select 1 from public.control_records where status = 'antigo'));
select t.check('excel: faz upsert dos orçamentos e mantém os meses que não vêm no ficheiro',
  (select orcamento from public.objetivos_orcamento where ano = 2026 and mes = 9 and tipo = 'GSC') = 100
  and (select orcamento from public.objetivos_orcamento where ano = 2026 and mes = 9 and tipo = 'BMW') = 200
  and (select orcamento from public.objetivos_orcamento where ano = 2025 and mes = 1 and tipo = 'GSC') = 5);
select t.check('excel: faz upsert dos objetivos por vendedor',
  (select objetivo from public.objetivos_resp where ano = 2026 and mes = 9 and responsavel = 'Rui') = 7
  and (select objetivo from public.objetivos_resp where ano = 2025 and mes = 1 and responsavel = 'Ana') = 4
  and (select count(*) from public.objetivos_resp) = 2);

begin;
select t.as_user('imp@x.pt');
select t.check('excel: sem registos é recusado e nada é apagado',
  t.state($q$ select public.import_control_excel('[]', '[{"ano":2026,"mes":9,"tipo":"GSC","orcamento":1}]') $q$) = '22023');
select t.check('excel: orçamentos que não são array são recusados',
  t.state($q$ select public.import_control_excel('[{"status":"x"}]', '{"a":1}') $q$) = '22023');
select t.back();
commit;
select t.check('excel: as recusas não mexeram em nada',
  (select count(*) from public.control_records) = 3
  and (select orcamento from public.objetivos_orcamento where ano = 2026 and mes = 9 and tipo = 'GSC') = 100);

begin;
select t.as_user('vn@x.pt');
select t.check('excel: vn NÃO importa (RLS) e nada muda',
  t.state($q$ select public.import_control_excel('[{"status":"hack"}]', '[{"ano":2030,"mes":1,"tipo":"GSC","orcamento":1}]') $q$) = '42501');
select t.back();
commit;
begin;
select t.as_user('cv@x.pt');   -- dados = view
select t.check('excel: cv (dados=view) NÃO importa', 
  t.state($q$ select public.import_control_excel('[{"status":"hack"}]') $q$) = '42501');
select t.back();
commit;
begin;
select t.as_anon();
select t.check('excel: anon sem acesso à função',
  t.state($q$ select public.import_control_excel('[{"status":"x"}]') $q$) = '42501');
select t.back();
commit;
select t.check('excel: as tentativas negadas não alteraram nada',
  (select count(*) from public.control_records where status = 'hack') = 0
  and (select count(*) from public.objetivos_orcamento where ano = 2030) = 0);

do $$
declare total int := (select count(*) from t.results);
        fails int := (select count(*) from t.results where not ok);
begin
  raise notice 'import: % verificações, % falhas', total, fails;
  if fails > 0 then raise exception 'replace_rows: % verificações falharam', fails; end if;
end $$;
