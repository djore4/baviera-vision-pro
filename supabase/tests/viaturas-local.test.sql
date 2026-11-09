-- Viaturas por local (migração 20261109110000): 'demos:inserir-viaturas' insere/corrige só os seus locais.
\set ON_ERROR_STOP on
delete from t.results;
insert into public.app_roles (name, is_admin, permissions) values
  ('Genius Via', false, '{"demos:inserir-viaturas": "edit", "demos": "view"}'),
  ('Sem Via',    false, '{"demos": "view"}')
  on conflict (name) do update set permissions = excluded.permissions;
insert into public.app_users (nome, email, perfil, local) values
  ('Feira',  'via_feira@x.pt',  'Genius Via', '["Feira"]'),
  ('Duplo',  'via_duplo@x.pt',  'Genius Via', '["Feira", "Gaia"]'),
  ('Sem perm', 'via_sem@x.pt',  'Sem Via',    '["Feira"]')
  on conflict (email) do update set perfil = excluded.perfil, local = excluded.local;
delete from public.viaturas where chassis like 'VIA%';
insert into public.viaturas (chassis, modelo, local) values
  ('VIA-AVR', 'Aveiro', '["Aveiro"]'), ('VIA-FEI', 'Feira', '["Feira"]');

begin;
select t.as_user('via_feira@x.pt');
select t.check('feira: insere viatura da Feira',
  t.dml($q$ insert into public.viaturas (chassis, modelo, local) values ('VIA-NOVA', 'X', '["Feira"]') $q$) = 1);
select t.check('feira: não insere noutro local, em vários, nem sem local',
  t.dml($q$ insert into public.viaturas (chassis, local) values ('VIA-X1', '["Aveiro"]') $q$) = -1
  and t.dml($q$ insert into public.viaturas (chassis, local) values ('VIA-X2', '["Feira", "Aveiro"]') $q$) = -1
  and t.dml($q$ insert into public.viaturas (chassis, local) values ('VIA-X3', null) $q$) = -1
  and t.dml($q$ insert into public.viaturas (chassis, local) values ('VIA-X4', '[]') $q$) = -1);
select t.check('feira: só vê as viaturas da Feira', (select count(*) from public.viaturas where chassis like 'VIA%') = 2
  and not exists (select 1 from public.viaturas where chassis = 'VIA-AVR'));
select t.check('feira: corrige a da Feira, não a de Aveiro, nem a muda de local',
  t.dml($q$ update public.viaturas set modelo = 'Y' where chassis = 'VIA-FEI' $q$) = 1
  and t.dml($q$ update public.viaturas set modelo = 'Y' where chassis = 'VIA-AVR' $q$) = 0
  and t.dml($q$ update public.viaturas set local = '["Aveiro"]' where chassis = 'VIA-FEI' $q$) = -1);
select t.check('feira: não apaga', t.dml($q$ delete from public.viaturas where chassis = 'VIA-FEI' $q$) = 0);
select t.back();
commit;

begin;
select t.as_user('via_duplo@x.pt');
select t.check('feira+gaia: insere em qualquer dos seus locais, não em Aveiro',
  t.dml($q$ insert into public.viaturas (chassis, local) values ('VIA-G', '["Gaia"]') $q$) = 1
  and t.dml($q$ insert into public.viaturas (chassis, local) values ('VIA-FG', '["Feira", "Gaia"]') $q$) = 1
  and t.dml($q$ insert into public.viaturas (chassis, local) values ('VIA-A', '["Aveiro"]') $q$) = -1);
select t.back();
commit;

begin;
select t.as_user('via_sem@x.pt');
select t.check('sem a permissão: não insere nem vê',
  t.dml($q$ insert into public.viaturas (chassis, local) values ('VIA-S', '["Feira"]') $q$) = -1
  and (select count(*) from public.viaturas where chassis like 'VIA%') = 0);
select t.back();
commit;

begin;
select t.as_user('via_feira@x.pt');
select t.check('sf_perfil_insercao: devolve o perfil com os locais', public.sf_perfil_insercao() ->> 'email' = 'via_feira@x.pt'
  and public.sf_perfil_insercao() -> 'local' = '["Feira"]'::jsonb and public.sf_perfil_insercao() -> 'negocio' = '["VD"]'::jsonb);
select t.back();
select t.as_user('via_sem@x.pt');
select t.check('sf_perfil_insercao: sem a permissão devolve null', public.sf_perfil_insercao() is null);
select t.back();
select t.as_anon();
select t.check('sf_perfil_insercao: anónimo não executa', not has_function_privilege('anon', 'public.sf_perfil_insercao()', 'execute'));
select t.back();
commit;

do $$ declare f int := (select count(*) from t.results where not ok); begin
  raise notice 'viaturas-local: % falhas', f;
  if f > 0 then raise exception 'viaturas-local falhou'; end if; end $$;
