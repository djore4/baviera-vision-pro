-- Marketing (migrações 20261104130000 + 20261104140000): RLS por nível no tab 'marketing'.
--   view  → lê eventos/categorias/viaturas; só os seus convidados; sem orçamento; não escreve.
--   edit  → gere tudo, vê todos os convidados e o orçamento.
-- Corre depois das restantes suites (usa o schema t criado por elas).
\set ON_ERROR_STOP on

delete from t.results;
-- O seed genérico de rls.test.sql deixa uma linha em cada tabela: parte-se de um estado limpo.
delete from public.marketing_convidados; delete from public.marketing_anexos; delete from public.marketing_viaturas;
delete from public.marketing_orcamentos; delete from public.marketing_eventos;
delete from public.marketing_categorias where nome not in ('Lançamento', 'Evento', 'Campanha', 'Comunicação');
insert into public.app_roles (name, is_admin, permissions) values
  ('Mkt Ver',    false, '{"marketing": "view"}'),
  ('Mkt Editar', false, '{"marketing": "edit"}'),
  ('Sem Mkt',    false, '{"funil": "view"}')
  on conflict (name) do update set permissions = excluded.permissions;
insert into public.app_users (nome, email, perfil, local) values
  ('Só ver', 'mkt_view@x.pt', 'Mkt Ver', '["Aveiro"]'), ('Editor', 'mkt_edit@x.pt', 'Mkt Editar', '["Aveiro"]'),
  ('Sem acesso', 'mkt_none@x.pt', 'Sem Mkt', '["Aveiro"]'),
  -- Mesmas funções, mas fora de Aveiro / sem local / só "Todas": não são de Aveiro.
  ('Ver Porto', 'mkt_porto@x.pt', 'Mkt Ver', '["Porto"]'), ('Editar Porto', 'mkt_edit_porto@x.pt', 'Mkt Editar', '["Porto", "Gaia"]'),
  ('Ver sem local', 'mkt_semlocal@x.pt', 'Mkt Ver', null), ('Ver Todas', 'mkt_todas@x.pt', 'Mkt Ver', '["Todas"]'),
  ('Ver Porto com exceção', 'mkt_excecao@x.pt', 'Mkt Ver', '["Porto"]')
  on conflict (email) do update set perfil = excluded.perfil, local = excluded.local;
insert into public.app_access_exceptions (email, tab, level) values ('mkt_excecao@x.pt', 'marketing', 'view')
  on conflict (email, tab) do nothing;

-- ── Edit: cria tudo ─────────────────────────────────────────────────────────────
begin;
select t.as_user('mkt_edit@x.pt');
select t.check('categorias iniciais existem', t.n('marketing_categorias') = 4);
select t.check('edit: cria um evento',
  t.dml($q$ insert into public.marketing_eventos (titulo, inicio) values ('Open House', '2099-03-10') $q$) = 1);
select t.check('edit: cria o orçamento',
  t.dml($q$ insert into public.marketing_orcamentos (evento_id, previsto, real)
            select id, 5000, 4200 from public.marketing_eventos $q$) = 1);
select t.check('edit: cria viatura e documento',
  t.dml($q$ insert into public.marketing_viaturas (evento_id, descricao) select id, 'BMW iX1 nova' from public.marketing_eventos $q$) = 1
  and t.dml($q$ insert into public.marketing_anexos (evento_id, path, nome, tamanho) select id, 'x/a.pdf', 'a.pdf', 1000 from public.marketing_eventos $q$) = 1);
select t.check('edit: convidados de vários vendedores',
  t.dml($q$ insert into public.marketing_convidados (evento_id, vendedor_email, nome)
            select id, v, 'Convidado de ' || v from public.marketing_eventos, unnest(array['  MKT_VIEW@x.pt ', 'mkt_edit@x.pt']) v $q$) = 2);
select t.check('edit: cria categoria', t.dml($q$ insert into public.marketing_categorias (nome) values ('Nova') $q$) = 1);
select t.back();
commit;

select t.check('trigger: autoria, local Aveiro por omissão e email do vendedor normalizado',
  (select count(*) from public.marketing_eventos where criado_por = 'mkt_edit@x.pt' and local = 'Aveiro') = 1
  and (select count(*) from public.marketing_convidados where vendedor_email = 'mkt_view@x.pt' and criado_por = 'mkt_edit@x.pt') = 1);

begin;
select t.as_user('mkt_edit@x.pt');
select t.check('edit: vê o orçamento e todos os convidados',
  t.n('marketing_orcamentos') = 1 and t.n('marketing_convidados') = 2);
select t.back();
commit;

-- ── View: lê, mas só os seus convidados e sem orçamento ─────────────────────────
begin;
select t.as_user('mkt_view@x.pt');
select t.check('view: lê eventos, categorias, viaturas e documentos',
  t.n('marketing_eventos') = 1 and t.n('marketing_categorias') = 5
  and t.n('marketing_viaturas') = 1 and t.n('marketing_anexos') = 1);
select t.check('view: não vê o orçamento', t.n('marketing_orcamentos') = 0);
select t.check('view: só vê os seus convidados', t.n('marketing_convidados') = 1);
select t.check('view: não cria evento, categoria, viatura nem orçamento',
  not t.can_insert('marketing_eventos') and not t.can_insert('marketing_categorias')
  and not t.can_insert('marketing_viaturas') and not t.can_insert('marketing_orcamentos'));
select t.check('view: não altera nem apaga eventos',
  t.dml($q$ update public.marketing_eventos set titulo = 'x' $q$) = 0
  and t.dml($q$ delete from public.marketing_eventos $q$) = 0);
select t.check('view: insere um convidado seu',
  t.dml($q$ insert into public.marketing_convidados (evento_id, vendedor_email, nome)
            select id, 'mkt_view@x.pt', 'Meu convidado' from public.marketing_eventos $q$) = 1);
select t.check('view: não insere convidados em nome de outro vendedor',
  t.dml($q$ insert into public.marketing_convidados (evento_id, vendedor_email, nome)
            select id, 'mkt_edit@x.pt', 'Intruso' from public.marketing_eventos $q$) = -1);
select t.check('view: não passa um convidado seu para outro vendedor',
  t.dml($q$ update public.marketing_convidados set vendedor_email = 'mkt_edit@x.pt' $q$) = -1);
select t.check('view: não mexe nos convidados dos outros',
  t.dml($q$ delete from public.marketing_convidados where vendedor_email = 'mkt_edit@x.pt' $q$) = 0);
select t.check('view: apaga os seus convidados',
  t.dml($q$ delete from public.marketing_convidados where nome = 'Meu convidado' $q$) = 1);
select t.back();
commit;

-- ── Só Aveiro (migração 20261105110000) ─────────────────────────────────────────
-- A função dá acesso, mas quem não opera em Aveiro fica de fora, tanto a ver como a editar.
begin;
select t.as_user('mkt_porto@x.pt');
select t.check('view fora de Aveiro: não vê nada',
  t.n('marketing_eventos') = 0 and t.n('marketing_categorias') = 0 and t.n('marketing_viaturas') = 0
  and t.n('marketing_anexos') = 0 and t.n('marketing_convidados') = 0);
select t.check('view fora de Aveiro: não abre ficheiros', not t.can_insert_obj('marketing', 'x/porto.pdf'));
select t.back();
select t.as_user('mkt_edit_porto@x.pt');
select t.check('edit fora de Aveiro: não vê nem escreve',
  t.n('marketing_eventos') = 0 and t.n('marketing_orcamentos') = 0 and not t.can_insert('marketing_eventos')
  and not t.can_insert('marketing_categorias') and not t.can_insert('marketing_convidados')
  and not t.can_insert_obj('marketing', 'x/porto2.pdf'));
select t.back();
select t.as_user('mkt_semlocal@x.pt');
select t.check('sem local definido: não é barrado (segue a função)', t.n('marketing_eventos') = 1);
select t.back();
select t.as_user('mkt_todas@x.pt');
select t.check('"Todas" não é um local reconhecido: não é barrado (igual à interface)', t.n('marketing_eventos') = 1);
select t.back();
select t.as_user('mkt_excecao@x.pt');
select t.check('exceção explícita por email para o tab: vê, mesmo fora de Aveiro',
  t.n('marketing_eventos') = 1 and t.n('marketing_convidados') = 0);
select t.back();
select t.as_user('mkt_view@x.pt');
select t.check('view em Aveiro continua a ver', t.n('marketing_eventos') = 1);
select t.back();
commit;

-- ── Sem acesso e anon ───────────────────────────────────────────────────────────
begin;
select t.as_user('mkt_none@x.pt');
select t.check('sem acesso ao tab: não vê nada',
  t.n('marketing_eventos') = 0 and t.n('marketing_categorias') = 0 and t.n('marketing_convidados') = 0 and t.n('marketing_orcamentos') = 0);
select t.check('sem acesso ao tab: não cria', not t.can_insert('marketing_eventos') and not t.can_insert('marketing_convidados'));
select t.back();
commit;

begin;
select t.as_anon();
select t.check('anon: sem acesso',
  t.dml($q$ select 1 from public.marketing_eventos $q$) <= 0 and not t.can_insert('marketing_eventos'));
select t.back();
commit;

-- ── Integridade ─────────────────────────────────────────────────────────────────
do $$
begin
  begin
    update public.marketing_eventos set fim = '2000-01-01';
    perform t.check('fim anterior ao início é recusado', false);
  exception when check_violation then perform t.check('fim anterior ao início é recusado', true); end;
  begin
    insert into public.marketing_anexos (evento_id, path, nome, tamanho)
      select id, 'x/grande.pdf', 'grande.pdf', 6000000 from public.marketing_eventos;
    perform t.check('anexo acima de 5 MB é recusado', false);
  exception when check_violation then perform t.check('anexo acima de 5 MB é recusado', true); end;
  -- Convites vs documentos (migração 20261105100000): categoria por omissão e valores válidos.
  insert into public.marketing_anexos (evento_id, path, nome, tamanho) select id, 'x/doc.pdf', 'doc.pdf', 10 from public.marketing_eventos;
  insert into public.marketing_anexos (evento_id, path, nome, tamanho, categoria) select id, 'x/convite.png', 'convite.png', 10, 'convite' from public.marketing_eventos;
  perform t.check('anexos: por omissão são documentos; os convites ficam marcados',
    (select count(*) from public.marketing_anexos where path = 'x/doc.pdf' and categoria = 'documento') = 1
    and (select count(*) from public.marketing_anexos where path = 'x/convite.png' and categoria = 'convite') = 1);
  begin
    insert into public.marketing_anexos (evento_id, path, nome, categoria) select id, 'x/z.pdf', 'z.pdf', 'outra' from public.marketing_eventos;
    perform t.check('categoria de anexo inválida é recusada', false);
  exception when check_violation then perform t.check('categoria de anexo inválida é recusada', true); end;
  update public.marketing_eventos set categoria_id = (select id from public.marketing_categorias where nome = 'Evento');
  begin
    delete from public.marketing_categorias where nome = 'Evento';
    perform t.check('categoria em uso não se apaga', false);
  exception when foreign_key_violation or restrict_violation then perform t.check('categoria em uso não se apaga', true); end;
  delete from public.marketing_eventos;
  perform t.check('apagar o evento leva orçamento, viaturas, documentos e convidados',
    (select count(*) from public.marketing_orcamentos) = 0 and (select count(*) from public.marketing_viaturas) = 0
    and (select count(*) from public.marketing_anexos) = 0 and (select count(*) from public.marketing_convidados) = 0);
end $$;

-- Storage: ver abre ficheiros; editar carrega.
begin;
select t.as_user('mkt_view@x.pt');
select t.check('storage view: não carrega ficheiros', not t.can_insert_obj('marketing', 'x/a.pdf'));
select t.back();
select t.as_user('mkt_edit@x.pt');
select t.check('storage edit: carrega ficheiros', t.can_insert_obj('marketing', 'x/b.pdf'));
select t.back();
commit;

do $$
declare total int := (select count(*) from t.results);
        fails int := (select count(*) from t.results where not ok);
begin
  raise notice 'marketing: % verificações, % falhas', total, fails;
  if fails > 0 then raise exception 'marketing: % verificações falharam', fails; end if;
end $$;
