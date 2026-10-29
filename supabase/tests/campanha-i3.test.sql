-- Campanha i3 (migração 20261029120000): RLS por tab e por responsável, trigger que
-- protege o que o vendedor não altera, histórico e aviso por delegação.
-- Corre depois das restantes suites (usa o schema t e o admin_role@x.pt criados por elas).
\set ON_ERROR_STOP on

delete from t.results;
delete from public.notification_reads; delete from public.notifications;
-- (a seed genérica da suite rls deixa uma linha 'x' em cada tabela)
delete from public.campanha_i3_leads;
create table t.mark (k text primary key, v bigint);
insert into public.app_roles (name, is_admin, permissions) values
  ('Camp Edit', false, '{"campanha-i3": "edit"}'),
  ('Camp Ver',  false, '{"campanha-i3": "view"}'),
  ('Sem Camp',  false, '{"funil": "view"}')
  on conflict (name) do update set permissions = excluded.permissions;
insert into public.app_users (nome, email, perfil) values
  ('Vend A', 'camp_a@x.pt', 'Camp Edit'), ('Vend B', 'camp_b@x.pt', 'Camp Edit'),
  ('Só ver', 'camp_view@x.pt', 'Camp Ver'), ('Sem acesso', 'camp_none@x.pt', 'Sem Camp')
  on conflict (email) do update set perfil = excluded.perfil;

-- ── Importar: só o administrador; trigger normaliza e calcula a chave ───────────
begin;
select t.as_user('camp_a@x.pt');
select t.check('vendedor: não importa',
  t.dml($q$ insert into public.campanha_i3_leads (nome) values ('Intruso') $q$) = -1);
select t.back();
commit;

begin;
select t.as_user('admin_role@x.pt');
select t.check('admin: importa',
  t.dml($q$ insert into public.campanha_i3_leads (nome, email, contacto, data_contacto, polo) values
            ('  Tiago Gonçalves ', ' Imperyal@Gmail.com ', ' 925344820 ', '2026-10-29', 'DCC - Aveiro'),
            ('Germano Santos', 'germano.santos@gmail.com', '966357533', '2026-10-28', 'DCC - Aveiro'),
            ('Sem Email', null, '+351 932 776 550', '2026-10-28', 'DCC - Aveiro'),
            ('Só Nome', null, null, null, null) $q$) = 4);
select t.back();
commit;

select t.check('trigger: nome/email limpos, chave = email, telefone ou nome',
  (select count(*) from public.campanha_i3_leads where nome = 'Tiago Gonçalves' and email = 'imperyal@gmail.com'
     and chave = 'imperyal@gmail.com' and contacto = '925344820') = 1
  and (select chave from public.campanha_i3_leads where nome = 'Sem Email') = '351932776550'
  and (select chave from public.campanha_i3_leads where nome = 'Só Nome') = 'só nome');
select t.check('trigger: nasce novo, sem responsável, importado por quem importou',
  (select count(*) from public.campanha_i3_leads where estado = 'novo' and owner_email is null
     and importado_por = 'admin_role@x.pt') = 4);
select t.check('histórico: a importação fica registada',
  (select count(*) from public.campanha_i3_historico where tipo = 'importada' and autor = 'admin_role@x.pt') = 4);

-- Mesma pessoa (mesmo email) não entra duas vezes
begin;
select t.as_user('admin_role@x.pt');
select t.check('chave única: o mesmo email não duplica (on conflict do nothing)',
  t.dml($q$ insert into public.campanha_i3_leads (nome, email) values ('Outro Nome', 'IMPERYAL@gmail.com')
            on conflict (chave) do nothing $q$) = 0);
select t.back();
commit;

-- ── Sem delegação, o vendedor não vê nada ───────────────────────────────────────
begin;
select t.as_user('camp_a@x.pt');
select t.check('vendedor: sem delegação não vê oportunidades', t.n('campanha_i3_leads') = 0 and t.n('campanha_i3_historico') = 0);
select t.back();
commit;

-- ── Delegar: aviso único por vendedor ───────────────────────────────────────────
begin;
select t.as_user('admin_role@x.pt');
select t.check('admin: delega 2 ao vendedor A numa só operação e 1 ao vendedor B',
  t.dml($q$ update public.campanha_i3_leads set owner_email = 'Camp_A@x.pt', owner_nome = 'Vend A'
            where nome in ('Tiago Gonçalves', 'Germano Santos') $q$) = 2
  and t.dml($q$ update public.campanha_i3_leads set owner_email = 'camp_b@x.pt', owner_nome = 'Vend B'
                where nome = 'Sem Email' $q$) = 1);
select t.back();
commit;

select t.check('delegar: email do responsável em minúsculas, com data e quem delegou',
  (select count(*) from public.campanha_i3_leads where owner_email = 'camp_a@x.pt'
     and atribuido_em is not null and atribuido_por = 'admin_role@x.pt') = 2);
select t.check('aviso: UM por vendedor e operação (2 delegadas ao A = 1 aviso), com link para o tab',
  (select count(*) from public.notifications) = 2
  and (select count(*) from public.notifications where recipient_email = 'camp_a@x.pt'
         and body like 'Foram-lhe delegadas 2 oportunidades da Campanha i3 (por Admin função)%'
         and link = '/campanha-i3' and audience = 'campanha-i3') = 1
  and (select count(*) from public.notifications where recipient_email = 'camp_b@x.pt'
         and body like 'Foi-lhe delegada a oportunidade Sem Email%') = 1);
select t.check('histórico: a delegação fica registada',
  (select count(*) from public.campanha_i3_historico where tipo = 'atribuida' and para = 'Vend A' and autor = 'admin_role@x.pt') = 2);

-- Delegar a si próprio / retirar não avisa
begin;
select t.as_user('admin_role@x.pt');
select t.check('admin: passa uma a si próprio e retira outra',
  t.dml($q$ update public.campanha_i3_leads set owner_email = 'admin_role@x.pt', owner_nome = 'Admin função' where nome = 'Só Nome' $q$) = 1
  and t.dml($q$ update public.campanha_i3_leads set owner_email = null where nome = 'Sem Email' $q$) = 1);
select t.back();
commit;
select t.check('aviso: atribuir a si próprio ou retirar não avisa', (select count(*) from public.notifications) = 2);
-- (volta a delegar ao B para o resto dos testes)
begin;
select t.as_user('admin_role@x.pt');
select t.dml($q$ update public.campanha_i3_leads set owner_email = 'camp_b@x.pt', owner_nome = 'Vend B' where nome = 'Sem Email' $q$);
select t.dml($q$ update public.campanha_i3_leads set owner_email = null, owner_nome = null where nome = 'Só Nome' $q$);
select t.back();
commit;

-- ── Cada vendedor só vê e altera as suas ────────────────────────────────────────
insert into t.mark select 'avisos', count(*) from public.notifications;
begin;
select t.as_user('camp_a@x.pt');
select t.check('vendedor A: vê só as suas 2 (e o histórico delas)',
  t.n('campanha_i3_leads') = 2 and (select count(*) from public.campanha_i3_leads where owner_email <> 'camp_a@x.pt') = 0
  and t.n('campanha_i3_historico') > 0
  and (select count(*) from public.campanha_i3_historico h where not exists
         (select 1 from public.campanha_i3_leads l where l.id = h.lead_id)) = 0);
select t.check('vendedor A: acompanha as suas (estado, ponto de situação, observações, próximo contacto)',
  t.dml($q$ update public.campanha_i3_leads set estado = 'em_contacto', ponto_situacao = ' Liguei, vai ver  ',
            observacoes = 'Quer elétrico', proximo_contacto = '2026-11-02' where nome = 'Tiago Gonçalves' $q$) = 1);
select t.check('vendedor A: não altera a de outro vendedor',
  t.dml($q$ update public.campanha_i3_leads set estado = 'ganho' where nome = 'Sem Email' $q$) = 0);
select t.check('vendedor A: não apaga',
  t.dml($q$ delete from public.campanha_i3_leads $q$) = 0);
select t.back();
commit;

select t.check('acompanhamento: guardado, com texto limpo e carimbo da última atualização',
  (select count(*) from public.campanha_i3_leads where nome = 'Tiago Gonçalves' and estado = 'em_contacto'
     and ponto_situacao = 'Liguei, vai ver' and observacoes = 'Quer elétrico'
     and proximo_contacto = '2026-11-02' and ultima_atualizacao is not null) = 1);
select t.check('histórico: estado e ponto de situação ficam registados',
  (select count(*) from public.campanha_i3_historico h join public.campanha_i3_leads l on l.id = h.lead_id
    where l.nome = 'Tiago Gonçalves' and h.tipo = 'estado' and h.de = 'novo' and h.para = 'em_contacto' and h.autor = 'camp_a@x.pt') = 1
  and (select count(*) from public.campanha_i3_historico h join public.campanha_i3_leads l on l.id = h.lead_id
    where l.nome = 'Tiago Gonçalves' and h.tipo = 'ponto' and h.para = 'Liguei, vai ver') = 1);

-- O vendedor não contorna o trigger: dados do contacto e responsável ficam como estão
begin;
select t.as_user('camp_a@x.pt');
select t.check('vendedor A: tenta mudar nome, email, polo e passar a oportunidade ao B (linha aceite…)',
  t.dml($q$ update public.campanha_i3_leads set nome = 'Hackeado', email = 'x@x.pt', contacto = '1', polo = 'Outro',
            data_contacto = '2020-01-01', owner_email = 'camp_b@x.pt', owner_nome = 'Vend B',
            atribuido_por = 'camp_b@x.pt', importado_por = 'camp_b@x.pt'
            where nome = 'Germano Santos' $q$) = 1);
select t.back();
commit;
select t.check('trigger: …mas nada disso muda (continua do A, com os dados originais)',
  (select count(*) from public.campanha_i3_leads where nome = 'Germano Santos' and email = 'germano.santos@gmail.com'
     and contacto = '966357533' and polo = 'DCC - Aveiro' and data_contacto = '2026-10-28'
     and owner_email = 'camp_a@x.pt' and atribuido_por = 'admin_role@x.pt' and importado_por = 'admin_role@x.pt') = 1);
select t.check('aviso: o vendedor passar a oportunidade ao B não cria aviso nenhum',
  (select count(*) from public.notifications) = (select v from t.mark where k = 'avisos'));

-- ── Só ver, sem acesso, anon ────────────────────────────────────────────────────
begin;
select t.as_user('camp_view@x.pt');
select t.check('só ver: sem delegação não vê; não altera', t.n('campanha_i3_leads') = 0);
select t.back();
commit;
-- delega uma ao utilizador "só ver": vê-a mas não a altera
begin;
select t.as_user('admin_role@x.pt');
select t.dml($q$ update public.campanha_i3_leads set owner_email = 'camp_view@x.pt', owner_nome = 'Só ver' where nome = 'Só Nome' $q$);
select t.back();
commit;
begin;
select t.as_user('camp_view@x.pt');
select t.check('só ver: vê a que lhe foi delegada mas não a altera',
  t.n('campanha_i3_leads') = 1
  and t.dml($q$ update public.campanha_i3_leads set estado = 'ganho' $q$) = 0);
select t.back();
commit;

begin;
select t.as_user('camp_none@x.pt');
select t.check('sem acesso ao tab: não vê nada', t.n('campanha_i3_leads') = 0 and t.n('campanha_i3_historico') = 0);
select t.back();
commit;
-- delegada a quem não tem acesso ao tab: continua sem ver
begin;
select t.as_user('admin_role@x.pt');
select t.dml($q$ update public.campanha_i3_leads set owner_email = 'camp_none@x.pt', owner_nome = 'Sem acesso' where nome = 'Só Nome' $q$);
select t.back();
commit;
begin;
select t.as_user('camp_none@x.pt');
select t.check('sem acesso ao tab: mesmo com oportunidades delegadas não vê nada', t.n('campanha_i3_leads') = 0);
select t.back();
commit;

begin;
select t.as_anon();
select t.check('anon: sem acesso', t.dml($q$ select 1 from public.campanha_i3_leads $q$) <= 0 and not t.can_insert('campanha_i3_leads'));
select t.back();
commit;

-- ── Administrador: vê tudo, corrige dados, apaga ────────────────────────────────
begin;
select t.as_user('admin_role@x.pt');
select t.check('admin: vê todas', t.n('campanha_i3_leads') = 4);
select t.check('admin: corrige os dados de contacto',
  t.dml($q$ update public.campanha_i3_leads set email = 'novo@x.pt' where nome = 'Germano Santos' $q$) = 1);
select t.check('admin: a chave acompanha o email corrigido',
  (select chave from public.campanha_i3_leads where nome = 'Germano Santos') = 'novo@x.pt');
select t.check('admin: apaga (e o histórico vai com ela)',
  t.dml($q$ delete from public.campanha_i3_leads where nome = 'Só Nome' $q$) = 1);
select t.back();
commit;
select t.check('apagar a oportunidade apaga o histórico (cascade)',
  (select count(*) from public.campanha_i3_historico h where not exists
     (select 1 from public.campanha_i3_leads l where l.id = h.lead_id)) = 0);

do $$
declare total int := (select count(*) from t.results);
        fails int := (select count(*) from t.results where not ok);
begin
  raise notice 'campanha-i3: % verificações, % falhas', total, fails;
  if fails > 0 then raise exception 'campanha-i3: % verificações falharam', fails; end if;
end $$;
