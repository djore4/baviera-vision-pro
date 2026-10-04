-- Migração de dados do End-of-Term: o Finance, que via tudo por NOME, passa a ter a
-- permissão explícita 'end-of-term:todos'; as outras funções ficam como estavam.
-- Corre a migração 20261003170000 sobre dados de teste (é idempotente). Precisa de -v ROOT=<repo>.
\set ON_ERROR_STOP on

delete from t.results;
delete from public.app_users where perfil in ('Finance', 'Vendedor VN', 'Secretaria');
delete from public.app_roles where name in ('Finance', 'Vendedor VN', 'Secretaria');
insert into public.app_roles (name, is_admin, permissions) values
  ('Finance',     false, '{"carteira": "view", "producao": "view", "end-of-term": "edit"}'),
  ('Vendedor VN', false, '{"funil": "view", "end-of-term": "edit"}'),
  ('Secretaria',  false, '{"retails": "view"}');

\i :ROOT/supabase/migrations/20261003170000_eot_isolamento_vendedor.sql
\i :ROOT/supabase/migrations/20261003170000_eot_isolamento_vendedor.sql

select t.check('migração: o Finance ganha end-of-term:todos e mantém o resto',
  (select permissions from public.app_roles where name = 'Finance')
  = '{"carteira": "view", "producao": "view", "end-of-term": "edit", "end-of-term:todos": "edit"}'::jsonb);
select t.check('migração: Vendedor VN e Secretaria ficam como estavam (vendedores só veem os seus)',
  (select permissions from public.app_roles where name = 'Vendedor VN') = '{"funil": "view", "end-of-term": "edit"}'::jsonb
  and (select permissions from public.app_roles where name = 'Secretaria') = '{"retails": "view"}'::jsonb);
select t.check('migração: idempotente (2.ª execução não altera o resultado)',
  (select count(*) from public.app_roles where permissions ? 'end-of-term:todos' and name = 'Finance') = 1);
select t.check('migração: app_capabilities anuncia o End-of-Term e mantém a Lavagem',
  public.app_capabilities() = '{"lavagem_granular": true, "eot_granular": true}'::jsonb);
begin;
select t.as_user('vn@x.pt');
select t.check('app_capabilities: acessível a um utilizador autenticado',
  (public.app_capabilities() ->> 'eot_granular')::boolean is true);
select t.back();
commit;
begin;
select t.as_anon();
select t.check('app_capabilities: anon sem acesso', t.state($q$ select public.app_capabilities() $q$) = '42501');
select t.back();
commit;

do $$
declare total int := (select count(*) from t.results);
        fails int := (select count(*) from t.results where not ok);
begin
  raise notice 'eot: % verificações, % falhas', total, fails;
  if fails > 0 then raise exception 'eot: % verificações falharam', fails; end if;
end $$;
