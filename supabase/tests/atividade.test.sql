-- Logs da administração (migração 20261030120000): qualquer utilizador regista a sua
-- atividade; só os administradores a leem, com o último login por utilizador.
-- Corre depois das restantes suites.
\set ON_ERROR_STOP on

delete from t.results;
delete from public.atividade;   -- a suite rls.test.sql semeia uma linha em cada tabela
insert into public.app_roles (name, is_admin, permissions) values
  ('Ativ Admin', true, '{}'), ('Ativ Normal', false, '{"funil": "view"}')
  on conflict (name) do update set is_admin = excluded.is_admin, permissions = excluded.permissions;
insert into public.app_users (nome, email, perfil) values
  ('Chefe', 'ativ_admin@x.pt', 'Ativ Admin'), ('Ana', 'ativ_ana@x.pt', 'Ativ Normal'),
  ('Rui', 'ativ_rui@x.pt', 'Ativ Normal'), ('Nunca', 'ativ_nunca@x.pt', 'Ativ Normal')
  on conflict (email) do update set perfil = excluded.perfil;
insert into auth.users (email, last_sign_in_at) values
  ('ATIV_ANA@x.pt', '2026-10-20 09:00+00'), ('ativ_rui@x.pt', '2026-10-25 18:30+00');

-- ── Qualquer utilizador regista ─────────────────────────────────────────────────
begin;
select t.as_user('ativ_ana@x.pt');
select t.check('utilizador regista uma sessão', t.dml($q$ insert into public.atividade (tipo, pagina) values ('sessao', '/') $q$) = 1);
select t.check('utilizador regista páginas, tentando forçar o email e a data',
  t.dml($q$ insert into public.atividade (email, tipo, pagina, created_at)
            values ('ativ_rui@x.pt', 'pagina', '/funil', '2020-01-01'),
                   ('ativ_rui@x.pt', 'pagina', '/funil', '2020-01-01'),
                   ('ativ_rui@x.pt', 'pagina', '/stock', '2020-01-01') $q$) = 3);
select t.back();
commit;
begin;
select t.as_user('ativ_rui@x.pt');
select t.check('outro utilizador regista', t.dml($q$ insert into public.atividade (tipo, pagina) values ('pagina', '/stock') $q$) = 1);
select t.back();
commit;
begin;
select t.as_anon();
select t.check('anon não regista', t.dml($q$ insert into public.atividade (tipo, pagina) values ('sessao', '/') $q$) = -1);
select t.back();
commit;

select t.check('trigger: o email vem do token e a data do servidor',
  (select count(*) from public.atividade where email = 'ativ_ana@x.pt' and created_at > now() - interval '1 minute') = 4
  and (select count(*) from public.atividade where email = 'ativ_rui@x.pt') = 1);

-- ── Só os administradores leem ──────────────────────────────────────────────────
begin;
select t.as_user('ativ_ana@x.pt');
select t.check('utilizador normal: não vê nem a sua atividade', t.n('atividade') = 0);
select t.check('utilizador normal: não apaga', t.dml($q$ delete from public.atividade $q$) = 0);
select t.check('utilizador normal: o resumo vem vazio', (select count(*) from public.admin_atividade_resumo(30)) = 0);
select t.back();
commit;

begin;
select t.as_anon();
select t.check('anon: sem execute no resumo', t.dml($q$ select * from public.admin_atividade_resumo(30) $q$) = -1);
select t.back();
commit;

begin;
select t.as_user('ativ_admin@x.pt');
select t.check('admin: vê todo o registo', t.n('atividade') = 5);
select t.check('ninguém altera registos', t.dml($q$ update public.atividade set pagina = 'x' $q$) = -1);
select t.check('admin: resumo inclui todos os utilizadores',
  (select count(*) from public.admin_atividade_resumo(30) where email like 'ativ\_%') = 4);
select t.check('resumo: último login vem de auth.users (sem distinguir maiúsculas)',
  (select ultimo_login from public.admin_atividade_resumo(30) where email = 'ativ_ana@x.pt') = '2026-10-20 09:00+00'
  and (select ultimo_login from public.admin_atividade_resumo(30) where email = 'ativ_rui@x.pt') = '2026-10-25 18:30+00');
select t.check('resumo: quem nunca entrou fica sem login nem atividade',
  (select ultimo_login is null and ultima_atividade is null and sessoes = 0 and paginas = 0 and pagina_top is null
     from public.admin_atividade_resumo(30) where email = 'ativ_nunca@x.pt'));
select t.check('resumo: contagens e página mais usada',
  (select sessoes = 1 and paginas = 3 and pagina_top = '/funil' from public.admin_atividade_resumo(30) where email = 'ativ_ana@x.pt'));
select t.check('resumo: ordenado pela atividade mais recente, sem atividade no fim',
  (select array_agg(email order by ord) from (
     select email, row_number() over () as ord from public.admin_atividade_resumo(30) where email like 'ativ\_%') r)
  = array['ativ_rui@x.pt', 'ativ_ana@x.pt', 'ativ_admin@x.pt', 'ativ_nunca@x.pt']);
select t.check('admin: limpa o registo', t.dml($q$ delete from public.atividade where email = 'ativ_rui@x.pt' $q$) = 1);
select t.back();
commit;

-- ── Resultado ───────────────────────────────────────────────────────────────────
do $$
declare total int := (select count(*) from t.results);
        fails int := (select count(*) from t.results where not ok);
begin
  raise notice '% verificações, % falhas', total, fails;
  if fails > 0 then raise exception 'Atividade: % verificações falharam', fails; end if;
end $$;
