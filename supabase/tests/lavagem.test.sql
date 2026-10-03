-- Migração de dados da Lavagem: funções "antigas" (sem chaves 'lavagem:*') passam
-- a ter as permissões que o código antigo lhes dava pelo nome. Corre a migração
-- 20261003140000 sobre dados de teste (é idempotente). Precisa de -v ROOT=<repo>.
\set ON_ERROR_STOP on

delete from t.results;
delete from public.app_users where perfil in ('Preparador', 'Lavador', 'APV', 'Vendedor VN', 'BPS + Motorrad');
delete from public.app_roles where name in ('Preparador', 'Lavador', 'APV', 'Vendedor VN', 'BPS + Motorrad');
insert into public.app_roles (name, is_admin, permissions) values
  ('Preparador',     false, '{"lavagem": "edit", "retails": "view"}'),
  ('Lavador',        false, '{"lavagem": "view"}'),
  ('APV',            false, '{"lavagem": "edit", "carteira": "view"}'),
  ('Vendedor VN',    false, '{"lavagem": "view", "funil": "view"}'),
  ('BPS + Motorrad', false, '{"lavagem": "view"}');

\i :ROOT/supabase/migrations/20261003140000_lavagem_permissoes_granulares.sql
\i :ROOT/supabase/migrations/20261003140000_lavagem_permissoes_granulares.sql

select t.check('migração: Preparador ganha reagendar e qualidade, e mantém o resto',
  (select permissions from public.app_roles where name = 'Preparador')
  = '{"lavagem": "edit", "retails": "view", "lavagem:reagendar": "edit", "lavagem:qualidade": "edit"}'::jsonb);
select t.check('migração: Lavador ganha iniciar',
  (select permissions from public.app_roles where name = 'Lavador')
  = '{"lavagem": "view", "lavagem:iniciar": "edit"}'::jsonb);
select t.check('migração: APV ganha registos',
  (select permissions from public.app_roles where name = 'APV')
  = '{"lavagem": "edit", "carteira": "view", "lavagem:registos": "edit"}'::jsonb);
select t.check('migração: Vendedor VN e BPS + Motorrad ficam como estavam (sem QC: nunca o tiveram)',
  (select permissions from public.app_roles where name = 'Vendedor VN') = '{"lavagem": "view", "funil": "view"}'::jsonb
  and (select permissions from public.app_roles where name = 'BPS + Motorrad') = '{"lavagem": "view"}'::jsonb);
select t.check('migração: idempotente (2.ª execução não duplica nem estraga)',
  (select count(*) from public.app_roles where permissions ? 'lavagem:iniciar') >= 1
  and (select jsonb_object_keys(permissions) from public.app_roles where name = 'Lavador' order by 1 limit 1) is not null);

begin;
select t.as_user('vn@x.pt');
select t.check('app_capabilities: marca a Lavagem granular para um utilizador autenticado',
  public.app_capabilities() = '{"lavagem_granular": true}'::jsonb);
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
  raise notice 'lavagem: % verificações, % falhas', total, fails;
  if fails > 0 then raise exception 'lavagem: % verificações falharam', fails; end if;
end $$;
