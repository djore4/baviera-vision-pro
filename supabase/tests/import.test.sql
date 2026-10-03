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
insert into public.app_roles (name, is_admin, permissions) values ('Importador', false, '{"dados":"edit"}');
insert into public.app_users (nome, email, perfil) values ('Imp', 'imp@x.pt', 'Importador');
begin;
select t.as_user('imp@x.pt');
select t.check('dados=edit: importa control, VU e angariações',
  public.replace_rows('control_records', '[{"status":"i"}]') = 1
  and public.replace_rows('control_records_vu', '[{"status":"i","dt_fecho":"2026-09-01"}]') = 1
  and public.replace_rows('angariacoes_vu', '[{"resp":"i","dt_ang":"2026-09-01","ano":2020,"kms":1000,"v_compra":12345.5}]') = 1);
select t.back();
commit;

do $$
declare total int := (select count(*) from t.results);
        fails int := (select count(*) from t.results where not ok);
begin
  raise notice 'import: % verificações, % falhas', total, fails;
  if fails > 0 then raise exception 'replace_rows: % verificações falharam', fails; end if;
end $$;
