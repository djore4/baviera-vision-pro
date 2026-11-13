-- Matriz função × local (migração 20261113100000).
\set ON_ERROR_STOP on
delete from t.results;
insert into public.app_roles (name, is_admin, permissions, permissions_local) values
  ('Matriz Loc', false,
   '{"retails": "view", "lavagem": "edit", "end-of-term": "view", "demos": "view"}',
   '{"Porto": {"retails": "edit", "lavagem": "view"}, "Gaia": {}}')
  on conflict (name) do update set permissions = excluded.permissions, permissions_local = excluded.permissions_local;
insert into public.app_users (nome, email, perfil, local) values
  ('Porto', 'pl_porto@x.pt', 'Matriz Loc', '["Porto"]'),
  ('Gaia vazio', 'pl_gaia@x.pt', 'Matriz Loc', '["Gaia"]'),
  ('Feira legado', 'pl_feira@x.pt', 'Matriz Loc', '["Feira"]'),
  ('Aveiro legado', 'pl_aveiro@x.pt', 'Matriz Loc', '["Aveiro"]'),
  ('Porto e Feira', 'pl_pf@x.pt', 'Matriz Loc', '["Porto", "Feira"]'),
  ('Sem local', 'pl_sem@x.pt', 'Matriz Loc', null),
  ('Porto com exceção', 'pl_exc@x.pt', 'Matriz Loc', '["Gaia"]')
  on conflict (email) do update set perfil = excluded.perfil, local = excluded.local;
insert into public.app_access_exceptions (email, tab, level) values ('pl_exc@x.pt', 'lavagem', 'view')
  on conflict (email, tab) do nothing;

begin;
select t.as_user('pl_porto@x.pt');
select t.check('porto: manda a entrada do local', public.access_rank('retails') = 2 and public.access_rank('lavagem') = 1);
select t.check('porto: o que falta na entrada é sem acesso (mesmo o EoT)', public.access_rank('end-of-term') = 0 and public.access_rank('demos') = 0);
select t.check('porto: has_access acompanha', public.has_access('retails', 'edit') and not public.has_access('lavagem', 'edit'));
select t.back();
commit;
begin;
select t.as_user('pl_gaia@x.pt');
select t.check('gaia: entrada vazia = sem acesso a nada', public.access_rank('retails') = 0 and public.access_rank('end-of-term') = 0);
select t.back();
commit;
begin;
select t.as_user('pl_feira@x.pt');
select t.check('feira sem entrada: regra anterior (EoT e Demos)', public.access_rank('end-of-term') = 1 and public.access_rank('demos') = 1);
select t.check('feira sem entrada: o resto barrado', public.access_rank('retails') = 0 and public.access_rank('lavagem') = 0);
select t.back();
commit;
begin;
select t.as_user('pl_aveiro@x.pt');
select t.check('aveiro sem entrada: matriz base', public.access_rank('retails') = 1 and public.access_rank('lavagem') = 2);
select t.back();
commit;
begin;
select t.as_user('pl_pf@x.pt');
select t.check('porto+feira: máximo dos locais', public.access_rank('retails') = 2 and public.access_rank('end-of-term') = 1 and public.access_rank('lavagem') = 1);
select t.back();
commit;
begin;
select t.as_user('pl_sem@x.pt');
select t.check('sem local: matriz base', public.access_rank('retails') = 1 and public.access_rank('lavagem') = 2);
select t.back();
commit;
begin;
select t.as_user('pl_exc@x.pt');
select t.check('exceção por email eleva sobre a entrada vazia', public.access_rank('lavagem') = 1 and public.access_rank('retails') = 0);
select t.back();
commit;
do $$ declare f int := (select count(*) from t.results where not ok); begin raise notice $m$permissoes-por-local: % falhas$m$, f; if f > 0 then raise exception $m$permissoes-por-local falhou$m$; end if; end $$;
