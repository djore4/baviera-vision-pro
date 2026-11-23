-- Modelo simples (migração 20261123120000): a conversão mantém o acesso de cada utilizador.
-- Os perfis e as combinações perfil/local/equipa são cópias dos reais; compara-se o acesso de cada
-- conta a cada tab ANTES (motor antigo) e DEPOIS (modelo simples).
\set ON_ERROR_STOP on
delete from t.results;

insert into public.app_tabs_por_local (tab) values ('demos') on conflict do nothing;
-- Perfis do fixture: parte-se de um estado limpo (a migração já converteu os perfis de semente).
delete from public.app_users where perfil in ('APV','Chefe de Vendas','Finance','Genius','Supervisor EoT','Vendedor') or perfil like 'Vendedor BMW%' or perfil like 'Chefe de Vendas BMW%' or email like 'fx%@x.pt';
delete from public.app_roles where name in ('APV','Chefe de Vendas','Finance','Genius','Supervisor EoT','Vendedor') or name like 'Vendedor BMW%' or name like 'Chefe de Vendas BMW%';

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
insert into fx (perfil, local, equipa) values
 ('APV','["Aveiro"]','APV'), ('APV','["Maia", "Porto"]','BMW VU'),
 ('Chefe de Vendas','["Aveiro"]','BMW VU'), ('Chefe de Vendas','["Gaia", "Feira"]','BMW VN'), ('Chefe de Vendas','["Gaia", "Feira"]','BMW VU'),
 ('Chefe de Vendas','["Porto", "Gaia"]','BMW VN'), ('Chefe de Vendas','["Porto", "Gaia"]',null), ('Chefe de Vendas','["Porto"]','BMW VN'),
 ('Finance','["Feira", "Aveiro"]',null), ('Finance','["Porto", "Gaia"]',null),
 ('Genius','["Aveiro"]',null), ('Genius','["Feira"]','BMW VN'),
 ('Supervisor EoT',null,null),
 ('Vendedor','["Aveiro"]','BMW VN'), ('Vendedor','["Aveiro"]','BMW VU'), ('Vendedor','["Feira"]','BMW VN'), ('Vendedor','["Feira"]','BMW VU'),
 ('Vendedor','["Gaia"]','BMW VN'), ('Vendedor','["Gaia"]','BMW VU'), ('Vendedor','["Porto", "Gaia"]','BMW VN'),
 ('Vendedor','["Porto"]','BMW VN'), ('Vendedor','["Porto"]','BMW VU'), ('Vendedor','["Todas"]','BMW VN'), ('Vendedor',null,'BMW VU');
update fx set email = 'fx' || n || '@x.pt';
insert into public.app_users (nome, email, perfil, local, equipa)
  select 'fx' || n, email, perfil, local, equipa from fx on conflict (email) do update set perfil = excluded.perfil, local = excluded.local, equipa = excluded.equipa;

create temp table chaves as
  select distinct k from (
    select jsonb_object_keys(permissions) k from public.app_roles where name in (select perfil from fx)
    union select jsonb_object_keys(m.value) from public.app_roles r, jsonb_each(r.permissions_local) m where r.name in (select perfil from fx) and jsonb_typeof(m.value) = 'object'
    union select jsonb_object_keys(m.value) from public.app_roles r, jsonb_each(r.permissions_equipa) m where r.name in (select perfil from fx) and jsonb_typeof(m.value) = 'object') s;

create function t.rank_de(p_email text, p_tab text) returns int language plpgsql as $$
declare v int;
begin perform t.as_user(p_email); v := public.access_rank(p_tab); perform t.back(); return v; end $$;

create temp table antes  as select f.n, c.k, t.rank_de(f.email, c.k) as r from fx f cross join chaves c;

select public.migrar_permissoes_simples();
select public.migrar_permissoes_simples();   -- idempotente

create temp table depois as select f.n, c.k, t.rank_de(f.email, c.k) as r from fx f cross join chaves c;

create temp table dif as
  select f.perfil as perfil_antes, (select u.perfil from public.app_users u where u.email = f.email) as perfil_depois,
         f.local::text as local, f.equipa, a.k as tab, a.r as antes, d.r as depois
  from antes a join depois d using (n, k) join fx f using (n) where a.r <> d.r order by 1, 3, 4, 5;

do $$
declare x record;
begin
  for x in select * from dif loop
    raise notice 'DIF % | % | % | % | % : % -> %', x.perfil_antes, x.local, x.equipa, x.perfil_depois, x.tab, x.antes, x.depois;
  end loop;
end $$;

select t.check('migração: todos os perfis ficam em modelo simples', not exists (select 1 from public.app_roles where not is_admin and name in ('APV','Chefe de Vendas','Finance','Genius','Supervisor EoT','Vendedor') and not modelo_simples));
select t.check('migração: as contas com camada de equipa passam para o perfil da equipa',
  (select count(*) from public.app_users where perfil = 'Vendedor BMW VN') = 6 and (select count(*) from public.app_users where perfil = 'Vendedor BMW VU') = 5
  and (select count(*) from public.app_users where perfil = 'Chefe de Vendas BMW VU') = 2);
-- Só duas diferenças, ambas por haver UMA matriz para "outros locais"/"sem local" em vez de várias:
--  * Chefe de Vendas só no Porto: o End-of-Term passa de consulta (matriz do Porto) para edição (a do Gaia);
--  * Vendedor sem local reconhecido e equipa BMW VU: ganha o Funil VN em edição, que a matriz de Aveiro
--    (e não a base) já dava às contas de Aveiro.
select t.check('migração: acesso idêntico em todas as contas e tabs, exceto as duas diferenças conhecidas',
  (select count(*) from dif) = 2
  and exists (select 1 from dif where perfil_antes = 'Chefe de Vendas' and local = '["Porto"]' and equipa = 'BMW VN' and tab = 'end-of-term' and antes = 1 and depois = 2)
  and exists (select 1 from dif where perfil_antes = 'Vendedor' and local is null and equipa = 'BMW VU' and tab = 'funil' and antes = 0 and depois = 2));

-- O novo motor: completo em Aveiro/sem local, "outros" nos restantes, máximo entre locais, exceção abre ao nível completo.
delete from public.app_users where email like 'ps\_%@x.pt';
insert into public.app_roles (name, is_admin, permissions, permissions_outros, modelo_simples)
  values ('Simples T', false, '{"retails":"edit","funil":"view"}', '{"retails":"view","end-of-term":"edit"}', true)
  on conflict (name) do update set permissions = excluded.permissions, permissions_outros = excluded.permissions_outros, modelo_simples = true;
insert into public.app_users (nome, email, perfil, local) values
  ('a', 'ps_aveiro@x.pt', 'Simples T', '["Aveiro"]'), ('p', 'ps_porto@x.pt', 'Simples T', '["Porto"]'),
  ('pa', 'ps_pa@x.pt', 'Simples T', '["Porto","Aveiro"]'), ('sl', 'ps_sl@x.pt', 'Simples T', null), ('ex', 'ps_ex@x.pt', 'Simples T', '["Gaia"]')
  on conflict (email) do update set perfil = excluded.perfil, local = excluded.local;
insert into public.app_access_exceptions (email, tab, level) values ('ps_ex@x.pt', 'funil', 'view') on conflict (email, tab) do nothing;
begin; select t.as_user('ps_aveiro@x.pt');
select t.check('simples: Aveiro segue a matriz completa', public.access_rank('retails') = 2 and public.access_rank('funil') = 1 and public.access_rank('end-of-term') = 0);
select t.back(); commit;
begin; select t.as_user('ps_porto@x.pt');
select t.check('simples: outros locais seguem a matriz de "outros"', public.access_rank('retails') = 1 and public.access_rank('end-of-term') = 2 and public.access_rank('funil') = 0);
select t.back(); commit;
begin; select t.as_user('ps_pa@x.pt');
select t.check('simples: vários locais = nível mais alto', public.access_rank('retails') = 2 and public.access_rank('end-of-term') = 2 and public.access_rank('funil') = 1);
select t.back(); commit;
begin; select t.as_user('ps_sl@x.pt');
select t.check('simples: sem local = matriz completa', public.access_rank('retails') = 2 and public.access_rank('end-of-term') = 0);
select t.back(); commit;
begin; select t.as_user('ps_ex@x.pt');
select t.check('simples: exceção por email mantém-se', public.access_rank('funil') = 1 and public.access_rank('retails') = 1);
select t.back(); commit;

-- RPC de gravação: só administradores, valida, não toca em perfis por migrar nem de administrador.
insert into public.app_roles (name, is_admin, permissions) values ('Legado T', false, '{"retails":"view"}')
  on conflict (name) do update set modelo_simples = false;
begin; select t.as_user('ps_aveiro@x.pt');
select t.check('rpc: um utilizador normal não grava perfis', t.state($q$ select public.guardar_perfil('Simples T', '{}', '{}') $q$) = '42501');
select t.check('rpc: nem renomeia', t.state($q$ select public.renomear_perfil('Simples T', 'Outro') $q$) = '42501');
select t.back(); commit;
insert into public.platform_admins (email) values ('ps_admin@x.pt') on conflict do nothing;
begin; select t.as_user('ps_admin@x.pt');
select public.guardar_perfil('Simples T', '{"retails":"edit"}', '{"end-of-term":"view"}');
select t.check('rpc: o administrador grava as duas matrizes', (select permissions = '{"retails":"edit"}' and permissions_outros = '{"end-of-term":"view"}' and modelo_simples from public.app_roles where name = 'Simples T'));
select public.guardar_perfil('Novo T', '{"funil":"view"}', '{}');
select t.check('rpc: cria um perfil novo já em modelo simples', (select modelo_simples from public.app_roles where name = 'Novo T'));
select t.check('rpc: recusa níveis inválidos', t.state($q$ select public.guardar_perfil('Simples T', '{"retails":"none"}', '{}') $q$) <> '00000');
select t.check('rpc: recusa perfis por migrar', t.state($q$ select public.guardar_perfil('Legado T', '{}', '{}') $q$) <> '00000');
select t.check('rpc: recusa perfis de administrador', t.state($q$ select public.guardar_perfil('Administrador', '{}', '{}') $q$) <> '00000');
select public.renomear_perfil('Simples T', 'Simples T2');
select t.check('rpc: renomear leva as contas e a matriz', (select count(*) from public.app_users where perfil = 'Simples T2') = 5
  and (select permissions_outros ? 'end-of-term' from public.app_roles where name = 'Simples T2') and not exists (select 1 from public.app_roles where name = 'Simples T'));
select t.check('rpc: recusa um nome repetido (sem distinguir maiúsculas)', t.state($q$ select public.renomear_perfil('Novo T', 'simples t2') $q$) <> '00000');
select t.back(); commit;

do $$
declare total int := (select count(*) from t.results);
        fails int := (select count(*) from t.results where not ok);
begin
  raise notice 'permissoes-simples: % verificações, % falhas', total, fails;
  if fails > 0 then raise exception 'permissoes-simples: % verificações falharam', fails; end if;
end $$;
