-- Acesso por local (migração 20261109100000): fora de Aveiro, a RLS só deixa o End-of-Term.
\set ON_ERROR_STOP on
delete from t.results;
insert into public.app_roles (name, is_admin, permissions) values
  ('Genius Loc', false, '{"retails": "view", "lavagem": "edit", "end-of-term": "view", "end-of-term:local": "edit"}')
  on conflict (name) do update set permissions = excluded.permissions;
insert into public.app_users (nome, email, perfil, local) values
  ('Feira', 'loc_feira@x.pt', 'Genius Loc', '["Feira"]'),
  ('Aveiro', 'loc_aveiro@x.pt', 'Genius Loc', '["Aveiro"]'),
  ('Feira e Aveiro', 'loc_ambos@x.pt', 'Genius Loc', '["Feira", "Aveiro"]'),
  ('Sem local', 'loc_sem@x.pt', 'Genius Loc', null),
  ('Todas', 'loc_todas@x.pt', 'Genius Loc', '["Todas"]'),
  ('Feira com exceção', 'loc_exc@x.pt', 'Genius Loc', '["Feira"]')
  on conflict (email) do update set perfil = excluded.perfil, local = excluded.local;
insert into public.app_access_exceptions (email, tab, level) values ('loc_exc@x.pt', 'retails', 'view')
  on conflict (email, tab) do nothing;

begin;
select t.as_user('loc_feira@x.pt');
select t.check('feira: sem acesso a tabs fora do EoT', public.access_rank('retails') = 0 and public.access_rank('lavagem') = 0);
select t.check('feira: mantém o End-of-Term', public.access_rank('end-of-term') = 1 and public.access_rank('end-of-term:local') = 2);
select t.back();
commit;
begin;
select t.as_user('loc_aveiro@x.pt');
select t.check('aveiro: segue a função', public.access_rank('retails') = 1 and public.access_rank('lavagem') = 2);
select t.back();
commit;
begin;
select t.as_user('loc_ambos@x.pt');
select t.check('feira+aveiro: segue a função', public.access_rank('retails') = 1);
select t.back();
commit;
begin;
select t.as_user('loc_sem@x.pt');
select t.check('sem local: segue a função', public.access_rank('retails') = 1);
select t.back();
commit;
begin;
select t.as_user('loc_todas@x.pt');
select t.check('"Todas": segue a função', public.access_rank('retails') = 1);
select t.back();
commit;
begin;
select t.as_user('loc_exc@x.pt');
select t.check('exceção por email mantém-se; o resto continua barrado', public.access_rank('retails') = 1 and public.access_rank('lavagem') = 0);
select t.back();
commit;
do $$ declare f int := (select count(*) from t.results where not ok); begin raise notice $m$acesso-local: % falhas$m$, f; if f > 0 then raise exception $m$acesso-local falhou$m$; end if; end $$;
