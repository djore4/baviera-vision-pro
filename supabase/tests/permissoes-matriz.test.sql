-- Matriz Perfil → Local → Equipa → Tab (migrações 20261124100000 e 20261125100000: o motor antigo foi removido).
-- Testa o motor (access_rank / has_any_tab) e as funções de gravação, sobre perfis criados diretamente em matriz.
\set ON_ERROR_STOP on
delete from t.results;

-- Motor novo: cada célula manda; vários locais = o mais alto; equipa desconhecida/ausente = "_"; sem local = "_".
delete from public.app_users where email like 'ps\_%@x.pt';
insert into public.app_roles (name, is_admin, permissions_matriz) values
  ('Matriz T', false, '{"Aveiro":{"BMW VN":{"retails":"edit","funil":"edit"},"_":{"retails":"view"}},"Porto":{"BMW VN":{"retails":"view"},"BMW VU":{"stock":"edit"}},"_":{"_":{"wip":"view"}}}')
  on conflict (name) do update set permissions_matriz = excluded.permissions_matriz;
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

-- RPC de gravação: só administradores, valida a estrutura, não toca em perfis de administrador.
begin; select t.as_user('ps_av_vn@x.pt');
select t.check('rpc: um utilizador normal não grava perfis', t.state($q$ select public.guardar_perfil('Matriz T', '{}') $q$) = '42501');
select t.check('rpc: nem renomeia', t.state($q$ select public.renomear_perfil('Matriz T', 'Outro') $q$) = '42501');
select t.back(); commit;
insert into public.platform_admins (email) values ('ps_admin@x.pt') on conflict do nothing;
begin; select t.as_user('ps_admin@x.pt');
select public.guardar_perfil('Matriz T', '{"Maia":{"_":{"retails":"edit"}}}');
select t.check('rpc: o administrador grava a matriz', (select permissions_matriz = '{"Maia":{"_":{"retails":"edit"}}}'::jsonb from public.app_roles where name = 'Matriz T'));
select public.guardar_perfil('Novo T', '{"Porto":{"BMW VN":{"funil":"view"}}}');
select t.check('rpc: cria um perfil novo', exists (select 1 from public.app_roles where name = 'Novo T' and permissions_matriz ? 'Porto'));
select t.check('rpc: recusa níveis inválidos', t.state($q$ select public.guardar_perfil('Matriz T', '{"Maia":{"_":{"retails":"none"}}}') $q$) <> '00000');
select t.check('rpc: recusa locais desconhecidos', t.state($q$ select public.guardar_perfil('Matriz T', '{"Lisboa":{"_":{"retails":"view"}}}') $q$) <> '00000');
select t.check('rpc: recusa equipas desconhecidas', t.state($q$ select public.guardar_perfil('Matriz T', '{"Maia":{"XPTO":{"retails":"view"}}}') $q$) <> '00000');
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
