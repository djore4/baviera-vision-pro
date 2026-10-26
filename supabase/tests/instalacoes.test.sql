-- Instalações (migração 20261027120000): RLS por tab, triggers e histórico.
-- Corre depois das restantes suites (usa o schema t e o admin_role@x.pt criados por elas).
\set ON_ERROR_STOP on

delete from t.results;
insert into public.app_roles (name, is_admin, permissions) values
  ('Inst Ver',    false, '{"instalacoes": "view"}'),
  ('Inst Editar', false, '{"instalacoes": "edit"}'),
  ('Sem Inst',    false, '{"funil": "view"}')
  on conflict (name) do update set permissions = excluded.permissions;
insert into public.app_users (nome, email, perfil) values
  ('Só ver', 'inst_view@x.pt', 'Inst Ver'), ('Editor', 'inst_edit@x.pt', 'Inst Editar'),
  ('Sem acesso', 'inst_none@x.pt', 'Sem Inst')
  on conflict (email) do update set perfil = excluded.perfil;

-- ── Escrita: só 'edit' ──────────────────────────────────────────────────────────
begin;
select t.as_user('inst_edit@x.pt');
select t.check('edit: regista uma ocorrência',
  t.dml($q$ insert into public.instalacoes_ocorrencias (piso, x, y, titulo, intervencao, interlocutor)
            values ('piso-0', 0.25, 0.5, 'Infiltração', 'Vedar o teto', '  Rui Duarte ') $q$) = 1);
select t.back();
commit;

select t.check('trigger: a ocorrência fica aberta, com quem registou, interlocutor limpo e data do reporte de hoje',
  (select count(*) from public.instalacoes_ocorrencias
    where estado = 'aberta' and criada_por = 'inst_edit@x.pt' and interlocutor = 'Rui Duarte'
      and data_reporte = current_date and resolvida_em is null) = 1);
select t.check('histórico: criação e reporte ficam registados pelo trigger',
  (select count(*) from public.instalacoes_historico where tipo = 'criada' and autor = 'inst_edit@x.pt') = 1
  and (select count(*) from public.instalacoes_historico where tipo = 'reporte' and para = 'Rui Duarte') = 1);

begin;
select t.as_user('inst_view@x.pt');
select t.check('view: lê as ocorrências e o histórico', t.n('instalacoes_ocorrencias') = 1 and t.n('instalacoes_historico') = 2);
select t.check('view: não regista', not t.can_insert('instalacoes_ocorrencias'));
select t.check('view: não altera nem apaga',
  t.dml($q$ update public.instalacoes_ocorrencias set estado = 'resolvida' $q$) = 0
  and t.dml($q$ delete from public.instalacoes_ocorrencias $q$) = 0);
select t.back();
commit;

begin;
select t.as_user('inst_none@x.pt');
select t.check('sem acesso ao tab: não vê nada', t.n('instalacoes_ocorrencias') = 0 and t.n('instalacoes_historico') = 0);
select t.check('sem acesso ao tab: não regista', not t.can_insert('instalacoes_ocorrencias'));
select t.back();
commit;

begin;
select t.as_anon();
select t.check('anon: sem acesso (nem privilégio, nem linhas)',
  t.dml($q$ select 1 from public.instalacoes_ocorrencias $q$) <= 0
  and not t.can_insert('instalacoes_ocorrencias'));
select t.back();
commit;

-- ── Estados e histórico ─────────────────────────────────────────────────────────
begin;
select t.as_user('inst_edit@x.pt');
select t.check('edit: muda o estado para resolvida',
  t.dml($q$ update public.instalacoes_ocorrencias set estado = 'resolvida' $q$) = 1);
select t.back();
commit;
select t.check('trigger: resolvida fixa a data de resolução',
  (select resolvida_em = current_date from public.instalacoes_ocorrencias));
select t.check('histórico: a mudança de estado fica registada com autor',
  (select count(*) from public.instalacoes_historico
    where tipo = 'estado' and de = 'aberta' and para = 'resolvida' and autor = 'inst_edit@x.pt') = 1);

begin;
select t.as_user('inst_edit@x.pt');
select t.dml($q$ update public.instalacoes_ocorrencias set estado = 'em_curso' $q$);
select t.dml($q$ update public.instalacoes_ocorrencias set interlocutor = null $q$);
select t.back();
commit;
select t.check('trigger: reabrir limpa a data de resolução; sem interlocutor não há data de reporte',
  (select resolvida_em is null and data_reporte is null and interlocutor is null from public.instalacoes_ocorrencias));
select t.check('histórico: remover o interlocutor também fica registado',
  (select count(*) from public.instalacoes_historico where tipo = 'reporte' and de = 'Rui Duarte' and para is null) = 1);

-- Alterar só observações não suja o histórico.
begin;
select t.as_user('inst_edit@x.pt');
select t.dml($q$ update public.instalacoes_ocorrencias set obs = 'nota' $q$);
select t.back();
commit;
select t.check('histórico: alterações sem estado/interlocutor não acrescentam linhas',
  (select count(*) from public.instalacoes_historico) = 5);

-- ── Histórico e autoria não se falsificam ───────────────────────────────────────
begin;
select t.as_user('inst_edit@x.pt');
select t.check('histórico: nem o editor o escreve, altera ou apaga',
  t.dml($q$ insert into public.instalacoes_historico (ocorrencia_id, tipo, para) select id, 'estado', 'x' from public.instalacoes_ocorrencias $q$) = -1
  and t.dml($q$ update public.instalacoes_historico set para = 'x' $q$) = -1
  and t.dml($q$ delete from public.instalacoes_historico $q$) = -1);
select t.dml($q$ update public.instalacoes_ocorrencias set criada_por = 'outro@x.pt' $q$);
select t.back();
commit;
select t.check('autoria: criada_por não se altera depois de registada',
  (select criada_por = 'inst_edit@x.pt' from public.instalacoes_ocorrencias));

-- ── Validações ──────────────────────────────────────────────────────────────────
select t.check('validação: posição fora da planta é recusada',
  t.state($q$ insert into public.instalacoes_ocorrencias (piso, x, y, titulo, intervencao) values ('piso-0', 1.5, 0.5, 'a', 'b') $q$) = '23514');
select t.check('validação: título e intervenção não podem estar em branco',
  t.state($q$ insert into public.instalacoes_ocorrencias (piso, x, y, titulo, intervencao) values ('piso-0', 0.5, 0.5, '  ', 'b') $q$) = '23514'
  and t.state($q$ insert into public.instalacoes_ocorrencias (piso, x, y, titulo, intervencao) values ('piso-0', 0.5, 0.5, 'a', '') $q$) = '23514');

-- ── Apagar leva o histórico ─────────────────────────────────────────────────────
begin;
select t.as_user('inst_edit@x.pt');
select t.check('edit: apaga a ocorrência', t.dml($q$ delete from public.instalacoes_ocorrencias $q$) = 1);
select t.back();
commit;
select t.check('apagar a ocorrência apaga o histórico (cascade)',
  (select count(*) from public.instalacoes_historico) = 0);

do $$
declare total int := (select count(*) from t.results);
        fails int := (select count(*) from t.results where not ok);
begin
  raise notice 'instalacoes: % verificações, % falhas', total, fails;
  if fails > 0 then raise exception 'instalacoes: % verificações falharam', fails; end if;
end $$;
