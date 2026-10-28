-- Sugestões (migração 20261028120000): qualquer utilizador regista e vê as suas;
-- a gestão (tab 'sugestoes') vê todas e responde. Corre depois das restantes suites.
\set ON_ERROR_STOP on

delete from t.results;
delete from public.sugestoes;   -- a suite rls.test.sql semeia uma linha em cada tabela
insert into public.app_roles (name, is_admin, permissions) values
  ('Sug Gestor', false, '{"sugestoes": "edit"}'),
  ('Sug Leitor', false, '{"sugestoes": "view"}'),
  ('Sug Normal', false, '{"funil": "view"}')
  on conflict (name) do update set permissions = excluded.permissions;
insert into public.app_users (nome, email, perfil) values
  ('Gestor', 'sug_gestor@x.pt', 'Sug Gestor'), ('Leitor', 'sug_leitor@x.pt', 'Sug Leitor'),
  ('Ana', 'sug_ana@x.pt', 'Sug Normal'), ('Rui', 'sug_rui@x.pt', 'Sug Normal')
  on conflict (email) do update set perfil = excluded.perfil;

-- ── Qualquer utilizador regista ─────────────────────────────────────────────────
begin;
select t.as_user('sug_ana@x.pt');
select t.check('qualquer utilizador regista uma sugestão',
  t.dml($q$ insert into public.sugestoes (tipo, titulo, descricao, pagina)
            values ('ideia', '  Exportar para Excel ', 'Em todas as tabelas', '/funil') $q$) = 1);
-- tenta forçar o autor, o estado e a resposta
select t.check('tenta registar em nome de outro, já respondida e feita',
  t.dml($q$ insert into public.sugestoes (tipo, titulo, autor_email, estado, resposta)
            values ('problema', 'Lento', 'sug_rui@x.pt', 'feita', 'ok') $q$) = 1);
select t.back();
commit;

select t.check('trigger: autor vem do token, nome do perfil, título limpo',
  (select count(*) from public.sugestoes
    where titulo = 'Exportar para Excel' and autor_email = 'sug_ana@x.pt' and autor_nome = 'Ana') = 1);
select t.check('trigger: nasce nova e sem resposta, mesmo que o browser diga o contrário',
  (select count(*) from public.sugestoes
    where titulo = 'Lento' and autor_email = 'sug_ana@x.pt' and estado = 'nova' and resposta is null) = 1);

-- ── Cada um vê as suas; a gestão vê todas ───────────────────────────────────────
begin;
select t.as_user('sug_ana@x.pt');
select t.check('autor: vê as suas', t.n('sugestoes') = 2);
select t.check('autor: não altera nem apaga as suas',
  t.dml($q$ update public.sugestoes set estado = 'feita' $q$) = 0
  and t.dml($q$ delete from public.sugestoes $q$) = 0);
select t.back();
commit;

begin;
select t.as_user('sug_rui@x.pt');
select t.check('outro utilizador: não vê as dos colegas', t.n('sugestoes') = 0);
select t.back();
commit;

begin;
select t.as_user('sug_leitor@x.pt');
select t.check('tab em consulta: vê todas', t.n('sugestoes') = 2);
select t.check('tab em consulta: não altera', t.dml($q$ update public.sugestoes set estado = 'feita' $q$) = 0);
select t.back();
commit;

begin;
select t.as_anon();
select t.check('anon: sem acesso', t.dml($q$ select 1 from public.sugestoes $q$) <= 0 and not t.can_insert('sugestoes'));
select t.back();
commit;

-- ── A gestão responde ───────────────────────────────────────────────────────────
begin;
select t.as_user('sug_gestor@x.pt');
select t.check('gestor: vê todas', t.n('sugestoes') = 2);
select t.check('gestor: muda estado e responde',
  t.dml($q$ update public.sugestoes set estado = 'planeada', resposta = '  Entra em dezembro ',
            titulo = 'adulterado', autor_email = 'sug_gestor@x.pt' where titulo = 'Exportar para Excel' $q$) = 1);
select t.back();
commit;
select t.check('trigger: só estado e resposta mudam (título e autor ficam), resposta limpa',
  (select count(*) from public.sugestoes
    where titulo = 'Exportar para Excel' and autor_email = 'sug_ana@x.pt'
      and estado = 'planeada' and resposta = 'Entra em dezembro') = 1);

begin;
select t.as_user('sug_ana@x.pt');
select t.check('autor: vê a resposta e o estado novos',
  (select count(*) from public.sugestoes where estado = 'planeada' and resposta = 'Entra em dezembro') = 1);
select t.back();
commit;

begin;
select t.as_user('sug_gestor@x.pt');
select t.check('gestor: apaga', t.dml($q$ delete from public.sugestoes where titulo = 'Lento' $q$) = 1);
select t.back();
commit;

begin;
select t.as_user('admin_role@x.pt');
select t.check('administrador: vê e gere sem ter o tab na matriz', t.n('sugestoes') = 1
  and t.dml($q$ update public.sugestoes set estado = 'feita' $q$) = 1);
select t.back();
commit;

do $$
declare
  total int := (select count(*) from t.results);
  fails int := (select count(*) from t.results where not ok);
begin
  raise notice 'sugestoes: % verificações, % falhas', total, fails;
  if fails > 0 then raise exception 'sugestoes: % verificações falharam', fails; end if;
end $$;
