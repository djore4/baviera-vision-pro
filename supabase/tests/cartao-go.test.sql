-- Cartão Caetano Go (migração 20261102120000): só o administrador regista e apaga;
-- cada vendedor lê apenas os seus. Corre depois das restantes suites.
\set ON_ERROR_STOP on

delete from t.results;
delete from public.cartao_go_registos;
insert into public.app_roles (name, is_admin, permissions) values
  ('Vendedor VN', false, '{"funil": "view"}')
  on conflict (name) do nothing;
insert into public.app_users (nome, email, perfil) values
  ('Ana VN', 'cg_ana@x.pt', 'Vendedor VN'), ('Rui VN', 'cg_rui@x.pt', 'Vendedor VN')
  on conflict (email) do update set perfil = excluded.perfil;

-- ── O vendedor não se dá o cartão como feito ────────────────────────────────────
begin;
select t.as_user('cg_ana@x.pt');
select t.check('vendedor: não regista cartões (nem os seus)',
  not t.can_insert('cartao_go_registos'));
select t.back();
commit;

-- ── O administrador regista ─────────────────────────────────────────────────────
begin;
select t.as_user('admin_role@x.pt');
select t.check('administrador: regista dois cartões à Ana e um ao Rui',
  t.dml($q$ insert into public.cartao_go_registos (vendedor_email, data) values
            ('CG_Ana@x.pt ', current_date), ('cg_ana@x.pt', current_date), ('cg_rui@x.pt', current_date) $q$) = 3);
select t.back();
commit;

select t.check('trigger: email em minúsculas e sem espaços; quem registou vem do token',
  (select count(*) from public.cartao_go_registos
    where vendedor_email = 'cg_ana@x.pt' and registado_por = 'admin_role@x.pt') = 2);

begin;
select t.as_user('admin_role@x.pt');
select t.check('administrador: não regista no futuro',
  t.state($q$ insert into public.cartao_go_registos (vendedor_email, data)
              values ('cg_ana@x.pt', current_date + 1) $q$) <> 'ok');
select t.check('administrador: não regista a quem não existe na plataforma',
  t.state($q$ insert into public.cartao_go_registos (vendedor_email) values ('fantasma@x.pt') $q$) <> 'ok');
select t.back();
commit;

-- ── Cada vendedor lê só os seus ─────────────────────────────────────────────────
begin;
select t.as_user('cg_ana@x.pt');
select t.check('vendedor: vê os seus (2), não os do colega', t.n('cartao_go_registos') = 2);
select t.check('vendedor: não apaga nem altera',
  t.dml($q$ delete from public.cartao_go_registos $q$) = 0
  and t.dml($q$ update public.cartao_go_registos set vendedor_email = 'cg_rui@x.pt' $q$) <= 0);
select t.back();
commit;

begin;
select t.as_user('cg_rui@x.pt');
select t.check('outro vendedor: vê só o seu (1)', t.n('cartao_go_registos') = 1);
select t.back();
commit;

begin;
select t.as_anon();
select t.check('anon: sem acesso',
  t.dml($q$ select 1 from public.cartao_go_registos $q$) <= 0 and not t.can_insert('cartao_go_registos'));
select t.back();
commit;

-- ── Corrigir = apagar ───────────────────────────────────────────────────────────
begin;
select t.as_user('admin_role@x.pt');
select t.check('administrador: vê todos e apaga um', t.n('cartao_go_registos') = 3
  and t.dml($q$ delete from public.cartao_go_registos
                where id = (select id from public.cartao_go_registos where vendedor_email = 'cg_ana@x.pt' limit 1) $q$) = 1);
select t.check('administrador: não altera (sem update)',
  t.dml($q$ update public.cartao_go_registos set vendedor_email = 'cg_rui@x.pt' $q$) <= 0);
select t.back();
commit;


-- ── CCGo (migração 20261121100000): permissão do tab `ccgo` ─────────────────────
insert into public.app_roles (name, is_admin, permissions) values
  ('CCGo Gestor', false, '{"ccgo": "edit"}'), ('CCGo Leitor', false, '{"ccgo": "view"}')
  on conflict (name) do update set permissions = excluded.permissions;
insert into public.app_users (nome, email, perfil) values
  ('Gestor', 'cg_gestor@x.pt', 'CCGo Gestor'), ('Leitor', 'cg_leitor@x.pt', 'CCGo Leitor')
  on conflict (email) do update set perfil = excluded.perfil;

begin;
select t.as_user('cg_gestor@x.pt');
select t.check('gestor (edit no tab): regista e apaga cartões',
  t.dml($q$ insert into public.cartao_go_registos (vendedor_email) values ('cg_rui@x.pt') $q$) = 1
  and t.dml($q$ delete from public.cartao_go_registos where vendedor_email = 'cg_rui@x.pt' and registado_por = 'cg_gestor@x.pt' $q$) = 1);
select t.check('gestor: define objetivo por equipa',
  t.dml($q$ insert into public.ccgo_objetivos (equipa, objetivo) values ('APV', 4)
            on conflict (equipa) do update set objetivo = excluded.objetivo $q$) = 1);
select t.back();
commit;

begin;
select t.as_user('cg_leitor@x.pt');
select t.check('leitor (view no tab): vê os cartões de todos mas não regista nem apaga',
  t.n('cartao_go_registos') >= 2
  and not t.can_insert('cartao_go_registos')
  and t.dml($q$ delete from public.cartao_go_registos $q$) <= 0);
select t.check('leitor: lê objetivos mas não os altera',
  t.n('ccgo_objetivos') = 1
  and t.state($q$ update public.ccgo_objetivos set objetivo = 9 $q$) <> 'ok' or t.dml($q$ update public.ccgo_objetivos set objetivo = 9 $q$) <= 0);
select t.back();
commit;

select t.check('equipa só aceita as 4 unidades',
  t.state($q$ update public.app_users set equipa = 'Outra' where email = 'cg_ana@x.pt' $q$) <> 'ok');

do $$
declare
  total int := (select count(*) from t.results);
  fails int := (select count(*) from t.results where not ok);
begin
  raise notice 'cartao-go: % verificações, % falhas', total, fails;
  if fails > 0 then raise exception 'cartao-go: % verificações falharam', fails; end if;
end $$;
