-- Notificações automáticas do End-of-Term (migração 20261003180000), com hotlink.
-- Corre depois das restantes suites (usa o schema t e os perfis criados por elas).
\set ON_ERROR_STOP on

delete from t.results;
-- (a suite eot.test.sql recriou os perfis Finance/Vendedor VN: criamos os utilizadores que usamos)
insert into public.app_roles (name, is_admin, permissions) values ('Sem EOT', false, '{"funil": "view"}') on conflict (name) do nothing;
insert into public.app_users (nome, email, perfil) values
  ('Financeira', 'fin2@x.pt', 'Finance'), ('Sem EOT', 'plain@x.pt', 'Sem EOT')
  on conflict (email) do nothing;

delete from public.notification_reads; delete from public.notifications;
delete from public.eot_activities; delete from public.eot_contracts;
insert into public.eot_contracts (contrato, cliente, owner_email) values
  ('EOT-N1', 'Cliente N1', null),
  ('EOT X&Y/1', 'Cliente Especial', 'eotv@x.pt');

-- ── Função do link ─────────────────────────────────────────────────────────────
select t.check('link: codifica espaço, & e / e acentos',
  public.eot_contract_link('A B&c/ç') = '/end-of-term?contrato=A%20B%26c%2F%C3%A7');
select t.check('link: contratos simples ficam como estão; vazio não rebenta',
  public.eot_contract_link('EOT-N1') = '/end-of-term?contrato=EOT-N1'
  and public.eot_contract_link(null) = '/end-of-term?contrato=');

-- ── Atribuição de um contrato: avisa o vendedor ────────────────────────────────
begin;
select t.as_user('admin_role@x.pt');
select t.check('atribuição: o administrador atribui o contrato a um vendedor',
  t.dml($q$ update public.eot_contracts set owner_email = 'eotv@x.pt', owner_nome = 'Vend EOT 1' where contrato = 'EOT-N1' $q$) = 1);
select t.back();
commit;
select t.check('atribuição: cria UMA notificação para o vendedor, com link para o contrato',
  (select count(*) from public.notifications) = 1
  and (select recipient_email from public.notifications) = 'eotv@x.pt'
  and (select link from public.notifications) = '/end-of-term?contrato=EOT-N1'
  and (select audience from public.notifications) = 'end-of-term'
  and (select title from public.notifications) = 'Contrato End-of-Term atribuído'
  and (select body from public.notifications) like '%EOT-N1%Cliente N1%por Admin função%'
  and (select created_by from public.notifications) = 'admin_role@x.pt');

begin;
select t.as_user('eotv@x.pt');
select t.check('atribuição: o vendedor vê o aviso (e só o dele)',
  t.n('notifications') = 1 and (select link from public.notifications) = '/end-of-term?contrato=EOT-N1');
select t.back();
commit;
begin;
select t.as_user('eot2@x.pt');   -- outro vendedor, também com acesso ao tab
select t.check('atribuição: outro vendedor com acesso ao mesmo tab NÃO vê o aviso alheio', t.n('notifications') = 0);
select t.back();
commit;
begin;
select t.as_user('admin_role@x.pt');
select t.check('atribuição: nem o administrador vê avisos dirigidos a outra pessoa', t.n('notifications') = 0);
select t.back();
commit;
begin;
select t.as_user('fin2@x.pt');
select t.check('atribuição: nem o Finance (visão total do tab)', t.n('notifications') = 0);
select t.back();
commit;

-- Casos que NÃO geram aviso
begin;
select t.as_user('admin_role@x.pt');
select t.check('atribuição: a si próprio, largar o dono, repetir o dono e outras alterações não avisam ninguém',
  t.dml($q$ update public.eot_contracts set owner_email = 'admin_role@x.pt' where contrato = 'EOT-N1' $q$) = 1
  and t.dml($q$ update public.eot_contracts set owner_email = null where contrato = 'EOT-N1' $q$) = 1
  and t.dml($q$ update public.eot_contracts set owner_email = 'eot2@x.pt' where contrato = 'EOT-N1' $q$) = 1
  and t.dml($q$ update public.eot_contracts set owner_email = 'eot2@x.pt' where contrato = 'EOT-N1' $q$) = 1
  and t.dml($q$ update public.eot_contracts set fase = 'contactado', obs = 'x' where contrato = 'EOT-N1' $q$) = 1);
select t.back();
commit;
select t.check('atribuição: só a passagem a eot2 gerou aviso (as outras não): 2 no total',
  (select count(*) from public.notifications) = 2
  and (select count(*) from public.notifications where recipient_email = 'eot2@x.pt') = 1);

begin;
select t.as_user('fin2@x.pt');   -- o Finance também atribui
select t.check('atribuição: o Finance atribui e o novo dono é avisado, com o nome de quem atribuiu',
  t.dml($q$ update public.eot_contracts set owner_email = 'eotv@x.pt' where contrato = 'EOT-N1' $q$) = 1);
select t.back();
commit;
select t.check('atribuição: aviso criado em nome do Finance',
  (select count(*) from public.notifications where recipient_email = 'eotv@x.pt' and created_by = 'fin2@x.pt') = 1
  and (select body from public.notifications where created_by = 'fin2@x.pt') like '%por Financeira%');

-- ── Atividade de um vendedor: avisa o administrador ────────────────────────────
begin;
select t.as_user('eotv@x.pt');
select t.check('atividade: o vendedor regista uma tarefa agendada, uma interação feita e uma sem prazo',
  t.dml($q$ insert into public.eot_activities (contrato, tipo, descricao, due_at, done)
            values ('EOT X&Y/1', 'chamada', 'Ligar a propor renovação', now() + interval '2 days', false) $q$) = 1
  and t.dml($q$ insert into public.eot_activities (contrato, tipo, descricao, done, done_at)
            values ('EOT X&Y/1', 'visita', 'Visitei o cliente', true, now()) $q$) = 1
  and t.dml($q$ insert into public.eot_activities (contrato, tipo, descricao) values ('EOT X&Y/1', 'email', 'Enviei proposta') $q$) = 1);
select t.back();
commit;

begin;
select t.as_user('admin_role@x.pt');
select t.check('atividade: o administrador recebe 3 avisos (1 tarefa, 2 interações), todos com link para o contrato',
  (select count(*) from public.notifications where audience = '@admin') = 3
  and (select count(*) from public.notifications where audience = '@admin' and title like 'End-of-Term · nova tarefa de %') = 1
  and (select count(*) from public.notifications where audience = '@admin' and title like 'End-of-Term · nova interação de %') = 2
  and not exists (select 1 from public.notifications where audience = '@admin' and link <> '/end-of-term?contrato=EOT%20X%26Y%2F1'));
select t.check('atividade: a tarefa diz o tipo, a descrição, o cliente, o contrato e o prazo; o título tem o nome do vendedor',
  (select body from public.notifications where title like '%nova tarefa%') like 'Chamada: Ligar a propor renovação — contrato EOT X&Y/1 (Cliente Especial) · para %'
  and (select title from public.notifications where title like '%nova tarefa%') like '%Vend EOT 1%'
  and (select created_by from public.notifications where title like '%nova tarefa%') = 'eotv@x.pt');
select t.check('atividade: a interação não leva prazo',
  (select body from public.notifications where body like 'Visita:%') = 'Visita: Visitei o cliente — contrato EOT X&Y/1 (Cliente Especial)');
select t.back();
commit;

-- Quem NÃO vê os avisos do administrador
begin;
select t.as_user('eotv@x.pt');
select t.check('atividade: o próprio vendedor não vê os avisos do administrador', not exists (select 1 from public.notifications where audience = '@admin'));
select t.back();
commit;
begin;
select t.as_user('eot2@x.pt');
select t.check('atividade: outro vendedor não vê os avisos do administrador', not exists (select 1 from public.notifications where audience = '@admin'));
select t.back();
commit;
begin;
select t.as_user('fin2@x.pt');   -- tem end-of-term:todos mas não é administrador
select t.check('atividade: o Finance (visão total do tab) não é administrador e não vê estes avisos',
  not exists (select 1 from public.notifications where audience = '@admin'));
select t.back();
commit;
begin;
select t.as_user('plain@x.pt');
select t.check('atividade: quem não tem o tab também não', not exists (select 1 from public.notifications where audience = '@admin'));
select t.back();
commit;
begin;
select t.as_anon();
select t.check('atividade: anon não vê notificações', t.n('notifications') = 0);
select t.back();
commit;

-- Quando NÃO avisa
begin;
select t.as_user('admin_role@x.pt');
select t.check('atividade: uma atividade do administrador não gera aviso',
  t.dml($q$ insert into public.eot_activities (contrato, tipo, descricao, due_at) values ('EOT X&Y/1', 'chamada', 'do admin', now() + interval '1 day') $q$) = 1);
select t.back();
commit;
insert into public.eot_activities (contrato, tipo, descricao) values ('EOT-N1', 'outro', 'sem utilizador (service role / importação)');
select t.check('atividade: nem a do service role (sem utilizador)',
  (select count(*) from public.notifications where audience = '@admin') = 3);

-- ── As regras de sempre continuam ──────────────────────────────────────────────
begin;
select t.as_user('eotv@x.pt');
select t.check('segurança: um vendedor não cria notificações (nem as forja para outra pessoa)',
  t.dml($q$ insert into public.notifications (title, audience) values ('x', 'all') $q$) = -1
  and t.dml($q$ insert into public.notifications (title, audience, recipient_email, link) values ('x', 'end-of-term', 'admin_role@x.pt', '/x') $q$) = -1);
select t.check('segurança: nem altera nem apaga as dos outros',
  t.dml($q$ update public.notifications set title = 'hack' $q$) = 0
  and t.dml($q$ delete from public.notifications $q$) = 0);
select t.check('segurança: as funções dos triggers não se chamam diretamente',
  t.state($q$ select public.eot_notify_activity() $q$) = '42501'
  and t.state($q$ select public.eot_notify_assignment() $q$) = '42501');
select t.back();
commit;

insert into public.notifications (title, audience) values ('geral', 'all'), ('so end-of-term', 'end-of-term'), ('so lavagem', 'lavagem');
begin;
select t.as_user('plain@x.pt');   -- só funil
select t.check('regras gerais: mensagem para todos chega a quem tem algum tab; a de uma área só a quem tem a área',
  exists (select 1 from public.notifications where title = 'geral')
  and not exists (select 1 from public.notifications where title in ('so end-of-term', 'so lavagem')));
select t.back();
commit;
begin;
select t.as_user('eot2@x.pt');
select t.check('regras gerais: quem tem End-of-Term vê as mensagens dessa área e as gerais',
  exists (select 1 from public.notifications where title = 'geral')
  and exists (select 1 from public.notifications where title = 'so end-of-term')
  and not exists (select 1 from public.notifications where title = 'so lavagem'));
select t.back();
commit;
begin;
select t.as_user('admin_role@x.pt');
select t.check('regras gerais: o administrador vê todas as de área e gerais',
  (select count(*) from public.notifications where title in ('geral', 'so end-of-term', 'so lavagem')) = 3);
select t.back();
commit;

do $$
declare total int := (select count(*) from t.results);
        fails int := (select count(*) from t.results where not ok);
begin
  raise notice 'eot-notif: % verificações, % falhas', total, fails;
  if fails > 0 then raise exception 'eot-notif: % verificações falharam', fails; end if;
end $$;
