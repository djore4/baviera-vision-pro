-- Registo de importações, validação e restauro (migração 20261030130000).
-- Corre depois das restantes suites (cria os seus próprios dados em control_records).
\set ON_ERROR_STOP on

create or replace function t.msg(sql text) returns text language plpgsql as $$
begin execute sql; return 'ok';
exception when others then return sqlerrm; end $$;
create or replace function t.state(sql text) returns text language plpgsql as $$
begin execute sql; return 'ok';
exception when others then return sqlstate; end $$;
grant execute on function t.msg(text), t.state(text) to authenticated;

delete from t.results;
delete from public.importacoes;            -- apaga também as cópias
delete from public.control_records;
insert into public.control_records (status, resp) select 'antigo', 'R' || g from generate_series(1, 30) g;

insert into public.app_roles (name, is_admin, permissions) values
  ('Imp Editor', false, '{"dados": "edit"}'),
  ('Imp Viewer', false, '{"database": "view"}'),
  ('Imp Outro',  false, '{"funil": "view"}')
  on conflict (name) do update set permissions = excluded.permissions;
insert into public.app_users (nome, email, perfil) values
  ('Editor', 'imp_editor@x.pt', 'Imp Editor'), ('Viewer', 'imp_viewer@x.pt', 'Imp Viewer'),
  ('Outro', 'imp_outro@x.pt', 'Imp Outro')
  on conflict (email) do update set perfil = excluded.perfil;

-- ── Regras puras ────────────────────────────────────────────────────────────────
select t.check('regras: menos de metade bloqueia',
  jsonb_array_length(public.importacao_regras(100, 49) -> 'bloqueios') = 1);
select t.check('regras: exatamente metade só avisa',
  jsonb_array_length(public.importacao_regras(100, 50) -> 'bloqueios') = 0
  and jsonb_array_length(public.importacao_regras(100, 50) -> 'avisos') = 1);
select t.check('regras: queda de mais de 10 % avisa; até 10 % não',
  jsonb_array_length(public.importacao_regras(100, 89) -> 'avisos') = 1
  and jsonb_array_length(public.importacao_regras(100, 95) -> 'avisos') = 0);
select t.check('regras: mais do dobro avisa; o dobro não',
  jsonb_array_length(public.importacao_regras(100, 201) -> 'avisos') = 1
  and jsonb_array_length(public.importacao_regras(100, 200) -> 'avisos') = 0);
select t.check('regras: com menos de 20 registos atuais não há regras',
  public.importacao_regras(19, 1) -> 'bloqueios' = '[]'::jsonb and public.importacao_regras(19, 1) -> 'avisos' = '[]'::jsonb);
select t.check('regras: ficheiro vazio tem regra própria (não bloqueia aqui)',
  public.importacao_regras(100, 0) -> 'bloqueios' = '[]'::jsonb);

-- ── Importação normal: fica registada, com cópia do que lá estava ───────────────
begin;
select t.as_user('admin_pa@x.pt');
select t.check('importa 30 registos com o nome do ficheiro',
  public.replace_rows('control_records',
    (select jsonb_agg(jsonb_build_object('status', 'novo', 'resp', 'N' || g)) from generate_series(1, 30) g),
    false, false, 'manual', 'teste.xlsx') = 30);
select t.back();
commit;

select t.check('registo: tabela, linhas, anteriores, quem, ficheiro, sem avisos',
  (select tabela = 'control_records' and linhas = 30 and linhas_anteriores = 30 and por = 'admin_pa@x.pt'
          and ficheiro = 'teste.xlsx' and avisos = '[]'::jsonb and not forcada and origem = 'manual'
   from public.importacoes order by id desc limit 1));
select t.check('cópia: as 30 linhas anteriores, sem o id',
  (select jsonb_array_length(dados) = 30 and not (dados -> 0 ? 'id') and dados -> 0 ->> 'status' = 'antigo'
   from public.importacoes_snapshot order by importacao_id desc limit 1));

-- ── Ficheiro suspeito: recusado, nada muda, nada é registado ────────────────────
begin;
select t.as_user('admin_pa@x.pt');
select t.check('menos de metade: recusado com a mensagem certa',
  t.msg($q$ select public.replace_rows('control_records',
    (select jsonb_agg(jsonb_build_object('status', 'x')) from generate_series(1, 10) g)) $q$) like 'IMPORTACAO_SUSPEITA:%');
select t.check('menos de metade: código 22023',
  t.state($q$ select public.replace_rows('control_records',
    (select jsonb_agg(jsonb_build_object('status', 'x')) from generate_series(1, 10) g)) $q$) = '22023');
select t.back();
commit;
select t.check('recusado: os dados e o registo ficam como estavam',
  (select count(*) from public.control_records where status = 'novo') = 30
  and (select count(*) from public.importacoes) = 1);

-- ── Aviso: passa, e o aviso fica registado ──────────────────────────────────────
begin;
select t.as_user('admin_pa@x.pt');
select t.check('queda de 17 %: passa',
  public.replace_rows('control_records',
    (select jsonb_agg(jsonb_build_object('status', 'av')) from generate_series(1, 25) g)) = 25);
select t.back();
commit;
select t.check('aviso registado, não forçada',
  (select jsonb_array_length(avisos) = 1 and not forcada and linhas = 25 and linhas_anteriores = 30
   from public.importacoes order by id desc limit 1));

-- ── Forçar: passa por cima da recusa, fica marcado ──────────────────────────────
begin;
select t.as_user('admin_pa@x.pt');
select t.check('forçado: importa 10 registos',
  public.replace_rows('control_records',
    (select jsonb_agg(jsonb_build_object('status', 'forca')) from generate_series(1, 10) g),
    false, true, 'manual', 'pequeno.xlsx') = 10);
select t.back();
commit;
select t.check('forçada: marcada e com o motivo nos avisos',
  (select forcada and jsonb_array_length(avisos) = 1 and avisos ->> 0 like '%menos de metade%'
   from public.importacoes order by id desc limit 1));

-- ── Restauro ────────────────────────────────────────────────────────────────────
begin;
select t.as_user('admin_pa@x.pt');
select t.check('restaurar: volta aos 25 registos anteriores',
  public.restaurar_importacao((select id from public.importacoes where forcada order by id desc limit 1)) = 25);
select t.back();
commit;
select t.check('restauro: dados repostos',
  (select count(*) from public.control_records) = 25
  and not exists (select 1 from public.control_records where status <> 'av'));
select t.check('restauro: registado como tal, com o motivo',
  (select origem = 'restauro' and not forcada and ficheiro like 'Restauro%' and linhas = 25 and linhas_anteriores = 10
   from public.importacoes order by id desc limit 1));
begin;
select t.as_user('admin_pa@x.pt');
select t.check('o restauro também se desfaz (volta aos 10)',
  public.restaurar_importacao((select max(id) from public.importacoes)) = 10);
select t.check('restaurar importação sem cópia: erro 22023',
  t.state($q$ select public.restaurar_importacao(-1) $q$) = '22023');
select t.back();
commit;

-- ── Tabelas pequenas: sem regras ────────────────────────────────────────────────
begin;
select t.as_user('admin_pa@x.pt');
select t.check('com 10 registos atuais, 1 registo passa sem aviso',
  public.replace_rows('control_records', '[{"status":"um"}]') = 1);
select t.back();
commit;
select t.check('... e sem avisos', (select avisos = '[]'::jsonb from public.importacoes order by id desc limit 1));

-- ── Só as últimas 10 cópias por tabela ──────────────────────────────────────────
begin;
select t.as_user('admin_pa@x.pt');
do $$
begin
  for i in 1..13 loop
    perform public.replace_rows('control_records',
      (select jsonb_agg(jsonb_build_object('status', 'c' || i)) from generate_series(1, 30) g));
  end loop;
end $$;
select t.back();
commit;
select t.check('guarda no máximo 10 cópias por tabela',
  (select count(*) from public.importacoes_snapshot where tabela = 'control_records') = 10);
select t.check('... as mais recentes',
  exists (select 1 from public.importacoes_snapshot s join public.importacoes i on i.id = s.importacao_id
          where s.tabela = 'control_records' and i.id = (select max(id) from public.importacoes))
  and (select count(*) from public.importacoes where tabela = 'control_records') > 10);   -- o registo fica todo

-- ── Validar antes de importar ───────────────────────────────────────────────────
begin;
select t.as_user('admin_pa@x.pt');
select t.check('validar: 5 registos contra 30 → bloqueio, com os números',
  (select (r ->> 'anteriores')::int = 30 and (r ->> 'linhas')::int = 5 and jsonb_array_length(r -> 'bloqueios') = 1
   from (select public.importacao_validar('control_records', 5) r) x));
select t.check('validar: 30 registos → limpo',
  (select jsonb_array_length(r -> 'bloqueios') = 0 and jsonb_array_length(r -> 'avisos') = 0
   from (select public.importacao_validar('control_records', 30) r) x));
select t.check('validar: tabela fora da lista → 22023',
  t.state($q$ select public.importacao_validar('app_roles', 1) $q$) = '22023');
select t.back();
commit;

-- ── Importação VU e angariações também ficam registadas ─────────────────────────
begin;
select t.as_user('admin_pa@x.pt');
select t.check('angariações: vazio permitido continua a passar (sem regras)',
  public.replace_rows('angariacoes_vu', '[]', true) = 0);
select t.back();
commit;
select t.check('... e fica registado', exists (select 1 from public.importacoes where tabela = 'angariacoes_vu' and linhas = 0));

-- ── Registar não impede importar ────────────────────────────────────────────────
alter table public.importacoes add constraint imp_teste_falha check (linhas < 0) not valid;
begin;
select t.as_user('admin_pa@x.pt');
select t.check('se o registo falhar, a importação faz-se na mesma',
  public.replace_rows('control_records',
    (select jsonb_agg(jsonb_build_object('status', 'semlog')) from generate_series(1, 30) g)) = 30);
select t.back();
commit;
alter table public.importacoes drop constraint imp_teste_falha;
select t.check('... os dados foram trocados e nada ficou a meio',
  (select count(*) from public.control_records where status = 'semlog') = 30
  and not exists (select 1 from public.importacoes where ficheiro is null and linhas = 30 and created_at > now() - interval '1 second'
                  and id > (select max(id) from public.importacoes where tabela = 'angariacoes_vu')));

-- ── Permissões ──────────────────────────────────────────────────────────────────
begin;
select t.as_user('imp_editor@x.pt');                                 -- tab dados com edição
select t.check('quem importa vê o registo e as cópias', t.n('importacoes') > 0 and t.n('importacoes_snapshot') > 0);
select t.check('quem importa também importa',
  public.replace_rows('control_records',
    (select jsonb_agg(jsonb_build_object('status', 'ed')) from generate_series(1, 30) g), false, false, 'manual', 'ed.xlsx') = 30);
select t.check('... e fica registado em seu nome',
  (select por = 'imp_editor@x.pt' and ficheiro = 'ed.xlsx' from public.importacoes order by id desc limit 1));
select t.check('não se forja o autor nem a data',
  t.dml($q$ insert into public.importacoes (tabela, por, linhas, linhas_anteriores, created_at)
            values ('control_records', 'outro@x.pt', 1, 1, '2020-01-01') $q$) = 1
  and (select por = 'imp_editor@x.pt' and created_at > now() - interval '1 minute'
       from public.importacoes order by id desc limit 1));
select t.check('o registo não se altera nem se apaga',
  t.dml($q$ update public.importacoes set linhas = 0 $q$) = -1 and t.dml($q$ delete from public.importacoes $q$) = -1);
select t.back();
commit;

begin;
select t.as_user('imp_viewer@x.pt');                                 -- database em consulta
select t.check('consulta do database: vê o registo, não as cópias', t.n('importacoes') > 0 and t.n('importacoes_snapshot') = 0);
select t.check('... não importa (a RLS recusa a escrita)',
  t.state($q$ select public.replace_rows('control_records', '[{"status":"x"}]', false, true) $q$) = '42501');
select t.check('... não restaura', t.state($q$ select public.restaurar_importacao((select max(importacao_id) from public.importacoes_snapshot)) $q$) = '22023');
select t.back();
commit;

begin;
select t.as_user('imp_outro@x.pt');                                  -- sem nada a ver com dados
select t.check('outro utilizador: não vê registo nem cópias', t.n('importacoes') = 0 and t.n('importacoes_snapshot') = 0);
select t.check('outro utilizador: vê o carimbo (um por tabela, sem dizer quem)',
  (select count(*) from public.ultimas_importacoes() where tabela = 'control_records') = 1
  and not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'ultimas_importacoes' and column_name = 'por'));
select t.back();
commit;

begin;
select t.as_anon();
select t.check('anon: sem execute no carimbo nem no restauro',
  t.dml($q$ select * from public.ultimas_importacoes() $q$) = -1
  and t.dml($q$ select public.restaurar_importacao(1) $q$) = -1
  and t.dml($q$ select public.importacao_validar('control_records', 1) $q$) = -1);
select t.back();
commit;

-- ── Resultado ───────────────────────────────────────────────────────────────────
do $$
declare total int := (select count(*) from t.results);
        fails int := (select count(*) from t.results where not ok);
begin
  raise notice 'importacoes: % verificações, % falhas', total, fails;
  if fails > 0 then raise exception 'Importações: % verificações falharam', fails; end if;
end $$;
