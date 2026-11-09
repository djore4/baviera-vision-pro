-- Demos por local (migração 20261109140000): fora de Aveiro vê-se o tab Demos, só do próprio local.
\set ON_ERROR_STOP on
delete from t.results;
insert into public.app_roles (name, is_admin, permissions) values
  ('Genius Dem', false, '{"demos": "edit", "retails": "view", "lavagem": "edit"}'),
  ('Vend Dem',   false, '{"demos": "view"}')
  on conflict (name) do update set permissions = excluded.permissions;
insert into public.app_users (nome, email, perfil, local) values
  ('Feira',  'dem_feira@x.pt',  'Genius Dem', '["Feira"]'),
  ('Duplo',  'dem_duplo@x.pt',  'Genius Dem', '["Feira", "Gaia"]'),
  ('Aveiro', 'dem_aveiro@x.pt', 'Genius Dem', '["Aveiro"]'),
  ('Sem local', 'dem_sem@x.pt', 'Genius Dem', null),
  ('Porto view', 'dem_porto@x.pt', 'Vend Dem', '["Porto"]')
  on conflict (email) do update set perfil = excluded.perfil, local = excluded.local;
delete from public.viaturas where chassis like 'DEM%';
insert into public.viaturas (chassis, modelo, local) values
  ('DEM-AVR', 'Aveiro', '["Aveiro"]'), ('DEM-FEI', 'Feira', '["Feira"]'),
  ('DEM-GAI', 'Gaia', '["Gaia"]'), ('DEM-PRT', 'Porto', '["Porto"]');

begin;
select t.as_user('dem_feira@x.pt');
select t.check('feira: tem Demos com a função; o resto continua barrado',
  public.access_rank('demos') = 2 and public.access_rank('retails') = 0 and public.access_rank('lavagem') = 0);
select t.check('feira: demos_viaturas só devolve as da Feira',
  (select count(*) from public.demos_viaturas() where chassis like 'DEM%') = 1
  and exists (select 1 from public.demos_viaturas() where chassis = 'DEM-FEI'));
select t.check('feira: capa só de viatura da Feira',
  t.dml($q$ insert into public.demo_capas (chassis, url) values ('DEM-FEI', 'http://x/f.jpg') $q$) = 1
  and t.dml($q$ insert into public.demo_capas (chassis, url) values ('DEM-AVR', 'http://x/a.jpg') $q$) = -1);
select t.check('feira: não vê empréstimos', (select count(*) from public.demos) = 0);
select t.back();
commit;

begin;
select t.as_user('dem_duplo@x.pt');
select t.check('feira+gaia: vê as dos dois locais, não Aveiro nem Porto',
  (select count(*) from public.demos_viaturas() where chassis like 'DEM%') = 2
  and not exists (select 1 from public.demos_viaturas() where chassis in ('DEM-AVR', 'DEM-PRT')));
select t.back();
commit;

begin;
select t.as_user('dem_porto@x.pt');
select t.check('porto (só consulta): vê as do Porto e não escreve capas',
  (select count(*) from public.demos_viaturas() where chassis like 'DEM%') = 1
  and public.access_rank('demos') = 1
  and t.dml($q$ insert into public.demo_capas (chassis, url) values ('DEM-PRT', 'http://x/p.jpg') $q$) = -1);
select t.back();
commit;

begin;
select t.as_user('dem_aveiro@x.pt');
select t.check('aveiro: vê todas (comportamento anterior)',
  (select count(*) from public.demos_viaturas() where chassis like 'DEM%') = 4 and public.access_rank('retails') = 1);
select t.back();
commit;

begin;
select t.as_user('dem_sem@x.pt');
select t.check('sem local: vê todas (comportamento anterior)',
  (select count(*) from public.demos_viaturas() where chassis like 'DEM%') = 4);
select t.back();
commit;

-- Parametrização: abrir outro tab a outros locais é um insert na tabela.
insert into public.app_tabs_por_local (tab) values ('retails') on conflict do nothing;
begin;
select t.as_user('dem_feira@x.pt');
select t.check('tab acrescentado a app_tabs_por_local passa a seguir a função', public.access_rank('retails') = 1);
select t.back();
commit;
delete from public.app_tabs_por_local where tab = 'retails';

do $$ declare f int := (select count(*) from t.results where not ok); begin raise notice $m$demos-local: % falhas$m$, f; if f > 0 then raise exception $m$demos-local falhou$m$; end if; end $$;
