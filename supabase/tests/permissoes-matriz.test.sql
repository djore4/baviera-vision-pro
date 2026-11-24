-- Matriz Perfil → Local → Equipa → Tab (migração 20261124100000): a conversão não muda o acesso de NINGUÉM.
-- Os perfis são cópias dos reais; testam-se todas as combinações local × equipa (e alguns multi-local).
\set ON_ERROR_STOP on
delete from t.results;

insert into public.app_tabs_por_local (tab) values ('demos') on conflict do nothing;
delete from public.app_users where perfil in ('APV','Chefe de Vendas','Finance','Genius','Supervisor EoT','Vendedor') or email like 'fx%@x.pt';
delete from public.app_roles where name in ('APV','Chefe de Vendas','Finance','Genius','Supervisor EoT','Vendedor');

insert into public.app_roles (name, is_admin, permissions, permissions_local, permissions_equipa) values
 ('APV', false, '{}',
  '{"Gaia":{},"Maia":{},"Feira":{},"Porto":{},"Aveiro":{"lavagem":"edit","produto":"view","marketing":"view","instalacoes":"edit","lavagem:iniciar":"edit","lavagem:registos":"edit","lavagem:qualidade":"edit","lavagem:reagendar":"edit"}}', '{}'),
 ('Chefe de Vendas', false, '{}',
  '{"Gaia":{"end-of-term":"edit","end-of-term:local":"edit","end-of-term:todos":"edit"},"Maia":{},"Feira":{},"Porto":{"end-of-term":"view","end-of-term:local":"edit","end-of-term:todos":"edit"},"Aveiro":{}}',
  '{"BMW VN":{},"BMW VU":{"wip":"edit","dados":"edit","demos":"edit","funil":"view","stock":"edit","escala":"view","produto":"view","retails":"view","seguros":"edit","carteira":"view","funil-vu":"view","producao":"view","escala-vu":"edit","marketing":"view","objetivos":"edit","prospecao":"view","angariacao":"edit","vendedores":"view","end-of-term":"edit","instalacoes":"edit","demos:precos":"edit","ficha-margem":"view","objetivos-vu":"edit","demos:reservar":"edit","end-of-term:local":"edit","end-of-term:todos":"edit","demos:inserir-viaturas":"edit"}}'),
 ('Finance', false, '{"wip":"view","escala":"view","retails":"view","carteira":"view","producao":"view","escala-vu":"view","objetivos":"view","end-of-term":"edit","instalacoes":"view","end-of-term:todos":"edit","resultados-finance":"view"}', '{}', '{}'),
 ('Genius', false, '{"demos":"edit","escala":"view","lavagem":"edit","produto":"view","retails":"view","carteira":"view","producao":"view","marketing":"view","prospecao":"none","instalacoes":"view","demos:precos":"edit","lavagem:iniciar":"edit","lavagem:qualidade":"edit","lavagem:reagendar":"edit","demos:inserir-viaturas":"edit"}', '{}', '{}'),
 ('Supervisor EoT', false, '{"dados":"view","produto":"view","end-of-term":"edit","end-of-term:local":"edit","end-of-term:todos":"edit"}', '{}', '{}'),
 ('Vendedor', false, '{"demos":"view","lavagem":"view","produto":"view","end-of-term":"edit","instalacoes":"view","ficha-margem":"edit"}',
  '{"Gaia":{"demos":"view","end-of-term":"edit"},"Maia":{"demos":"view","end-of-term":"edit"},"Feira":{"demos":"view","end-of-term":"edit"},"Porto":{"demos":"view","end-of-term":"edit"},"Aveiro":{"demos":"view","funil":"edit","lavagem":"view","produto":"view","end-of-term":"edit","instalacoes":"view","ficha-margem":"edit"}}',
  '{"BMW VN":{"funil":"view","escala":"edit","multas":"edit","retails":"view","carteira":"view","producao":"view","marketing":"view","prospecao":"edit","vendedores":"view","campanha-i3":"edit"},"BMW VU":{"wip":"view","stock":"view","funil-vu":"view","escala-vu":"view","prospecao":"none","angariacao":"view"}}');

create temp table fx (n serial, email text, perfil text, local jsonb, equipa text);
insert into fx (perfil, local, equipa)
  select p.n, l.v::jsonb, e.v
  from (values ('APV'),('Chefe de Vendas'),('Finance'),('Genius'),('Vendedor'),('Supervisor EoT')) p(n)
  cross join (values (null),('["Maia"]'),('["Porto"]'),('["Gaia"]'),('["Feira"]'),('["Aveiro"]'),('["Todas"]'),('["Porto", "Gaia"]'),('["Feira", "Aveiro"]'),('["Maia", "Porto"]')) l(v)
  cross join (values (null),('BMW VN'),('BMW VU'),('Motorrad'),('APV')) e(v);
update fx set email = 'fx' || n || '@x.pt';
insert into public.app_users (nome, email, perfil, local, equipa)
  select 'fx' || n, email, perfil, local, equipa from fx on conflict (email) do update set perfil = excluded.perfil, local = excluded.local, equipa = excluded.equipa;

create temp table chaves as
  select distinct k from (
    select jsonb_object_keys(permissions) k from public.app_roles where name in (select perfil from fx)
    union select jsonb_object_keys(m.value) from public.app_roles r, jsonb_each(r.permissions_local) m where r.name in (select perfil from fx) and jsonb_typeof(m.value) = 'object'
    union select jsonb_object_keys(m.value) from public.app_roles r, jsonb_each(r.permissions_equipa) m where r.name in (select perfil from fx) and jsonb_typeof(m.value) = 'object'
    union select 'painel') s;

create function t.rank_de(p_email text, p_tab text) returns int language plpgsql as $$
declare v int;
begin perform t.as_user(p_email); v := public.access_rank(p_tab); perform t.back(); return v; end $$;

create temp table antes as select f.n, c.k, t.rank_de(f.email, c.k) as r from fx f cross join chaves c;
select public.migrar_permissoes_matriz();
select public.migrar_permissoes_matriz();   -- idempotente
create temp table depois as select f.n, c.k, t.rank_de(f.email, c.k) as r from fx f cross join chaves c;

create temp table dif as
  select f.perfil, f.local::text as local, f.equipa, a.k as tab, a.r as antes, d.r as depois
  from antes a join depois d using (n, k) join fx f using (n) where a.r <> d.r order by 1, 2, 3, 4;
do $$ declare x record; begin
  for x in select * from dif limit 40 loop raise notice 'DIF % | % | % | % : % -> %', x.perfil, x.local, x.equipa, x.tab, x.antes, x.depois; end loop;
end $$;

select t.check('migração: todos os perfis ficam em matriz', not exists (select 1 from public.app_roles where not is_admin and name in (select perfil from fx) and not modelo_matriz));
select t.check('migração: os perfis não se dividem nem as contas mudam de perfil', (select count(*) from public.app_users where email like 'fx%@x.pt' and perfil in (select perfil from fx)) = (select count(*) from fx));
select t.check('migração: acesso IDÊNTICO em todas as contas (local × equipa) e tabs (ver DIF acima)', (select count(*) from dif) = 0);
select t.check('migração: as camadas antigas ficam vazias (cópia em app_roles_backup_matriz)',
  (select permissions_local = '{}' and permissions_equipa = '{}' from public.app_roles where name = 'Vendedor')
  and exists (select 1 from public.app_roles_backup_matriz where name = 'Vendedor' and permissions_equipa <> '{}'::jsonb));
select t.check('matriz: Vendedor em Porto / BMW VN tem o Funil em consulta e em Aveiro / BMW VN também (a equipa mandava)',
  (select permissions_matriz -> 'Porto' -> 'BMW VN' ->> 'funil' = 'view' and permissions_matriz -> 'Aveiro' -> 'BMW VN' ->> 'funil' = 'view' from public.app_roles where name = 'Vendedor'));

-- Motor novo: cada célula manda; vários locais = o mais alto; equipa desconhecida/ausente = "_"; sem local = "_".
delete from public.app_users where email like 'ps\_%@x.pt';
insert into public.app_roles (name, is_admin, permissions_matriz, modelo_matriz) values
  ('Matriz T', false, '{"Aveiro":{"BMW VN":{"retails":"edit","funil":"edit"},"_":{"retails":"view"}},"Porto":{"BMW VN":{"retails":"view"},"BMW VU":{"stock":"edit"}},"_":{"_":{"wip":"view"}}}', true)
  on conflict (name) do update set permissions_matriz = excluded.permissions_matriz, modelo_matriz = true;
insert into public.app_users (nome, email, perfil, local, equipa) values
  ('a', 'ps_av_vn@x.pt', 'Matriz T', '["Aveiro"]', 'BMW VN'), ('b', 'ps_av_s@x.pt', 'Matriz T', '["Aveiro"]', null),
  ('c', 'ps_po_vn@x.pt', 'Matriz T', '["Porto"]', 'BMW VN'), ('d', 'ps_po_vu@x.pt', 'Matriz T', '["Porto"]', 'BMW VU'),
  ('e', 'ps_pa@x.pt', 'Matriz T', '["Porto","Aveiro"]', 'BMW VN'), ('f', 'ps_sl@x.pt', 'Matriz T', null, 'BMW VN'),
  ('g', 'ps_mo@x.pt', 'Matriz T', '["Aveiro"]', 'Motorrad');
begin; select t.as_user('ps_av_vn@x.pt');
select t.check('matriz: Aveiro / BMW VN', public.access_rank('retails') = 2 and public.access_rank('funil') = 2 and public.access_rank('stock') = 0);
select t.back(); commit;
begin; select t.as_user('ps_av_s@x.pt');
select t.check('matriz: Aveiro sem equipa usa a coluna "_"', public.access_rank('retails') = 1 and public.access_rank('funil') = 0);
select t.back(); commit;
begin; select t.as_user('ps_po_vn@x.pt');
select t.check('matriz: Porto / BMW VN', public.access_rank('retails') = 1 and public.access_rank('funil') = 0);
select t.back(); commit;
begin; select t.as_user('ps_po_vu@x.pt');
select t.check('matriz: Porto / BMW VU', public.access_rank('stock') = 2 and public.access_rank('retails') = 0);
select t.back(); commit;
begin; select t.as_user('ps_pa@x.pt');
select t.check('matriz: vários locais = nível mais alto (Porto e Aveiro / BMW VN)', public.access_rank('retails') = 2 and public.access_rank('funil') = 2);
select t.back(); commit;
begin; select t.as_user('ps_sl@x.pt');
select t.check('matriz: sem local e com equipa BMW VN: coluna "_" do local "_" não tem a equipa', public.access_rank('retails') = 0);
select t.back(); commit;
begin; select t.as_user('ps_mo@x.pt');
select t.check('matriz: equipa sem células = sem acesso', public.access_rank('retails') = 0);
select t.back(); commit;

-- RPC de gravação: só administradores, valida a estrutura, não toca em perfis por migrar nem de administrador.
insert into public.app_roles (name, is_admin, permissions) values ('Legado T', false, '{"retails":"view"}') on conflict (name) do update set modelo_matriz = false;
begin; select t.as_user('ps_av_vn@x.pt');
select t.check('rpc: um utilizador normal não grava perfis', t.state($q$ select public.guardar_perfil('Matriz T', '{}') $q$) = '42501');
select t.check('rpc: nem renomeia', t.state($q$ select public.renomear_perfil('Matriz T', 'Outro') $q$) = '42501');
select t.back(); commit;
insert into public.platform_admins (email) values ('ps_admin@x.pt') on conflict do nothing;
begin; select t.as_user('ps_admin@x.pt');
select public.guardar_perfil('Matriz T', '{"Maia":{"_":{"retails":"edit"}}}');
select t.check('rpc: o administrador grava a matriz', (select permissions_matriz = '{"Maia":{"_":{"retails":"edit"}}}'::jsonb and modelo_matriz from public.app_roles where name = 'Matriz T'));
select public.guardar_perfil('Novo T', '{"Porto":{"BMW VN":{"funil":"view"}}}');
select t.check('rpc: cria um perfil novo já em matriz', (select modelo_matriz from public.app_roles where name = 'Novo T'));
select t.check('rpc: recusa níveis inválidos', t.state($q$ select public.guardar_perfil('Matriz T', '{"Maia":{"_":{"retails":"none"}}}') $q$) <> '00000');
select t.check('rpc: recusa locais desconhecidos', t.state($q$ select public.guardar_perfil('Matriz T', '{"Lisboa":{"_":{"retails":"view"}}}') $q$) <> '00000');
select t.check('rpc: recusa equipas desconhecidas', t.state($q$ select public.guardar_perfil('Matriz T', '{"Maia":{"XPTO":{"retails":"view"}}}') $q$) <> '00000');
select t.check('rpc: recusa perfis por migrar', t.state($q$ select public.guardar_perfil('Legado T', '{}') $q$) <> '00000');
select t.check('rpc: recusa perfis de administrador', t.state($q$ select public.guardar_perfil('Administrador', '{}') $q$) <> '00000');
select public.renomear_perfil('Matriz T', 'Matriz T2');
select t.check('rpc: renomear leva as contas e a matriz', (select count(*) from public.app_users where perfil = 'Matriz T2') = 7
  and (select permissions_matriz ? 'Maia' from public.app_roles where name = 'Matriz T2') and not exists (select 1 from public.app_roles where name = 'Matriz T'));
select t.check('rpc: recusa um nome repetido (sem distinguir maiúsculas)', t.state($q$ select public.renomear_perfil('Novo T', 'matriz t2') $q$) <> '00000');
select t.back(); commit;

do $$
declare total int := (select count(*) from t.results);
        fails int := (select count(*) from t.results where not ok);
begin
  raise notice 'permissoes-matriz: % verificações, % falhas', total, fails;
  if fails > 0 then raise exception 'permissoes-matriz: % verificações falharam', fails; end if;
end $$;
