-- Demos: adicionar, arquivar, consultar e recuperar viaturas (migração 20261109230000).
\set ON_ERROR_STOP on
delete from t.results;

create or replace function t.sqlstate_of(sql text) returns text language plpgsql as $$
begin execute sql; return 'ok'; exception when others then return sqlstate; end $$;
grant execute on function t.sqlstate_of(text) to anon, authenticated;

insert into public.app_roles (name, is_admin, permissions) values
  ('Gestor Ins', false, '{"demos": "view", "demos:inserir-viaturas": "edit", "demos:precos": "edit"}'),
  ('So Ins',     false, '{"demos": "view", "demos:inserir-viaturas": "edit"}'),
  ('So Pre',     false, '{"demos": "view", "demos:precos": "edit"}'),
  ('Nada Ges',   false, '{"demos": "view"}')
  on conflict (name) do update set permissions = excluded.permissions;
insert into public.app_users (nome, email, perfil, local) values
  ('Gestor Feira', 'gs_feira@x.pt',  'Gestor Ins', '["Feira"]'),
  ('Ins Feira',    'gs_ins@x.pt',    'So Ins',     '["Feira"]'),
  ('Pre Feira',    'gs_pre@x.pt',    'So Pre',     '["Feira"]'),
  ('Nada Feira',   'gs_nada@x.pt',   'Nada Ges',   '["Feira"]'),
  ('Gestor Aveiro','gs_aveiro@x.pt', 'Gestor Ins', '["Aveiro"]')
  on conflict (email) do update set perfil = excluded.perfil, local = excluded.local;
delete from public.viaturas_vendidas where chassis like 'GS%';
delete from public.viaturas where chassis like 'GS%';
insert into public.viaturas (chassis, matricula, modelo, local, marca, inputs, stats, kms) values
  ('GS-FEI', 'AA-11-BB', 'Feira', '["Feira"]', '["BMW"]',
    '{"pvb": 50000, "opc": 5000, "bsi": 100, "eco": 4.2, "leg": 1550, "isv": 0, "mgb": 0.05, "esf": 0.02, "pac": 0, "dem": 0, "sup": 0, "depreciacoes": 900, "pvp_desc": 60000}',
    '{"idade_dias": 95}', 1200),
  ('GS-AVR', 'CC-22-DD', 'Aveiro', '["Aveiro"]', 'BMW', '{"pvb": 40000, "pvp_desc": 45000}', '{}', null);

-- Adicionar
begin;
select t.as_user('gs_ins@x.pt');
select t.check('adicionar: com demos:inserir-viaturas, no seu local',
  t.sqlstate_of($q$ select public.demos_criar_viatura('{"chassis": "gs-nova1", "matricula": "ab12cd", "encomenda": "E9", "modelo": "iX1", "versao": "xDrive30",
     "estado_negocio": "VD", "marca": "BMW", "tipologia": ["BEV"], "local": ["Feira"], "kms": 10, "data_matricula": "2026-02-01",
     "inputs": {"pvb": 50000, "opc": 5000, "mgb": 0.08, "pvp_desc": 60000}}') $q$) = 'ok');
select t.check('adicionar: não noutro local, nem sem local',
  t.sqlstate_of($q$ select public.demos_criar_viatura('{"chassis": "GS-X1", "matricula": "AB12CE", "encomenda": "E", "modelo": "m", "versao": "v", "local": ["Aveiro"]}') $q$) = '42501'
  and t.sqlstate_of($q$ select public.demos_criar_viatura('{"chassis": "GS-X2", "matricula": "AB12CF", "encomenda": "E", "modelo": "m", "versao": "v"}') $q$) = '22023');
select t.check('adicionar: valida obrigatórios, formatos e valores',
  t.sqlstate_of($q$ select public.demos_criar_viatura('{"chassis": "GS-X3", "matricula": "AB12CG", "modelo": "m", "versao": "v", "local": ["Feira"]}') $q$) = '22023'      -- sem encomenda
  and t.sqlstate_of($q$ select public.demos_criar_viatura('{"chassis": "GS-X4", "matricula": "AB12", "encomenda": "E", "modelo": "m", "versao": "v", "local": ["Feira"]}') $q$) = '22023'
  and t.sqlstate_of($q$ select public.demos_criar_viatura('{"chassis": "GS-X5", "matricula": "AB12CH", "encomenda": "E", "modelo": "m", "versao": "v", "local": ["Feira"], "marca": "Audi"}') $q$) = '22023'
  and t.sqlstate_of($q$ select public.demos_criar_viatura('{"chassis": "GS-X6", "matricula": "AB12CI", "encomenda": "E", "modelo": "m", "versao": "v", "local": ["Feira"], "inputs": {"mgb": 5}}') $q$) = '22023'
  and t.sqlstate_of($q$ select public.demos_criar_viatura('{"chassis": "GS-X7", "matricula": "AB12CJ", "encomenda": "E", "modelo": "m", "versao": "v", "local": ["Feira"], "inputs": {"segredo": 1}}') $q$) = '22023');
select t.check('adicionar: recusa chassis e matrícula repetidos (sem substituir)',
  t.sqlstate_of($q$ select public.demos_criar_viatura('{"chassis": "GS-FEI", "matricula": "ZZ99ZZ", "encomenda": "E", "modelo": "m", "versao": "v", "local": ["Feira"]}') $q$) = '23505'
  and t.sqlstate_of($q$ select public.demos_criar_viatura('{"chassis": "GS-Y1", "matricula": "aa11bb", "encomenda": "E", "modelo": "m", "versao": "v", "local": ["Feira"]}') $q$) = '23505');
select t.back();
select t.as_user('gs_pre@x.pt');
select t.check('adicionar: só com demos:precos (sem inserir-viaturas) não',
  t.sqlstate_of($q$ select public.demos_criar_viatura('{"chassis": "GS-X8", "matricula": "AB12CK", "encomenda": "E", "modelo": "m", "versao": "v", "local": ["Feira"]}') $q$) = '42501');
select t.back();
commit;

select t.check('adicionar: fica guardada normalizada, com o preço calculado e no histórico',
  (select matricula = 'AB-12-CD' and marca = '["BMW"]' and kms = 10 and data_matricula = '2026-02-01'
      and (inputs ->> 'eco')::numeric = 4.2 and (inputs ->> 'leg')::numeric = 1550 and (inputs ->> 'mgb')::numeric = 0.08
      and (stats ->> 'pvp_final')::numeric = 60000
      and abs((stats ->> 'preco_minimo')::numeric - (((55000 + 4.2 + 1550) * 1.23) - 55000 * 0.08 * 1.23)) < 0.01
   from public.viaturas where chassis = 'GS-NOVA1')
  and exists (select 1 from public.historico where acao = 'CRIAR' and registo_id = 'GS-NOVA1'));

-- Arquivar
begin;
select t.as_user('gs_ins@x.pt');
select t.check('arquivar: só inserir-viaturas não arquiva', t.sqlstate_of($q$ select public.demos_arquivar_viatura('GS-FEI') $q$) = '42501');
select t.back();
select t.as_user('gs_nada@x.pt');
select t.check('arquivar: sem permissão não; vendidas vazias', t.sqlstate_of($q$ select public.demos_arquivar_viatura('GS-FEI') $q$) = '42501'
  and (select count(*) from public.demos_vendidas()) = 0);
select t.back();
select t.as_user('gs_pre@x.pt');
select t.check('arquivar: demos:precos arquiva a do seu local, não a de outro, nem inexistente',
  t.sqlstate_of($q$ select public.demos_arquivar_viatura('GS-AVR') $q$) = '42501'
  and t.sqlstate_of($q$ select public.demos_arquivar_viatura('NAO-EXISTE') $q$) = 'P0002'
  and t.sqlstate_of($q$ select public.demos_arquivar_viatura('GS-FEI') $q$) = 'ok');
select t.back();
commit;

select t.check('arquivar: preço cristalizado, vendido por, tipos do arquivo e saída do parque',
  not exists (select 1 from public.viaturas where chassis = 'GS-FEI')
  and (select preco_final = 60000 and vendido_por = 'Pre Feira' and kms = '1200' and marca = '["BMW"]'::jsonb
          and (stats ->> 'idade_dias')::int = 95 and (stats ->> 'mg') is not null and data_venda is not null
       from public.viaturas_vendidas where chassis = 'GS-FEI')
  and exists (select 1 from public.historico where acao = 'VENDIDA' and registo_id = 'GS-FEI'));

-- Consultar o arquivo
insert into public.viaturas_vendidas (chassis, modelo, local, marca, inputs, stats, preco_final) values
  ('GS-OLD-AVR', 'Aveiro', '["Aveiro"]', '["BMW"]', '{}', '{}', 1);
begin;
select t.as_user('gs_pre@x.pt');
select t.check('vendidas: só as do seu local',
  (select count(*) from public.demos_vendidas() where chassis like 'GS%') = 1
  and exists (select 1 from public.demos_vendidas() where chassis = 'GS-FEI'));
select t.check('vendidas: a tabela não se lê nem escreve diretamente',
  (select count(*) from public.viaturas_vendidas) = 0
  and t.dml($q$ insert into public.viaturas_vendidas (chassis) values ('GS-HACK') $q$) = -1);
select t.back();
select t.as_user('admin_role@x.pt');
select t.check('vendidas: administrador vê todas', (select count(*) from public.demos_vendidas() where chassis like 'GS%') = 2);
select t.back();
commit;

-- Recuperar
select id as id_avr from public.viaturas_vendidas where chassis = 'GS-OLD-AVR' \gset
select id as id_fei from public.viaturas_vendidas where chassis = 'GS-FEI' \gset
begin;
select t.as_user('gs_pre@x.pt');
select t.check('repor: de outro local ✗ (42501) e de inexistente ✗ (P0002)',
  t.sqlstate_of('select public.demos_repor_viatura(' || :id_avr || ')') = '42501'
  and t.sqlstate_of('select public.demos_repor_viatura(999999999)') = 'P0002');
select t.check('repor: do seu local ✓', t.sqlstate_of('select public.demos_repor_viatura(' || :id_fei || ')') = 'ok');
select t.back();
commit;
select t.check('repor: volta ao parque com os mesmos dados e sai do arquivo',
  exists (select 1 from public.viaturas where chassis = 'GS-FEI' and kms = 1200 and marca = '["BMW"]' and matricula = 'AA-11-BB'
          and (inputs ->> 'pvp_desc')::numeric = 60000 and (stats ->> 'idade_dias')::int = 95)
  and not exists (select 1 from public.viaturas_vendidas where chassis = 'GS-FEI')
  and exists (select 1 from public.historico where acao = 'REPOR' and registo_id = 'GS-FEI'));

-- Repor com o chassis já no parque
insert into public.viaturas_vendidas (chassis, modelo, local, marca, inputs, stats) values ('GS-FEI', 'dup', '["Feira"]', '["BMW"]', '{}', '{}');
select id as id_dup from public.viaturas_vendidas where chassis = 'GS-FEI' \gset
begin;
select t.as_user('gs_pre@x.pt');
select t.check('repor: recusa se o chassis já existe no parque',
  t.sqlstate_of('select public.demos_repor_viatura(' || :id_dup || ')') = '23505');
select t.back();
select t.as_anon();
select t.check('anónimo: nenhuma das funções', not has_function_privilege('anon', 'public.demos_criar_viatura(jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.demos_arquivar_viatura(text)', 'execute')
  and not has_function_privilege('anon', 'public.demos_vendidas()', 'execute')
  and not has_function_privilege('anon', 'public.demos_repor_viatura(bigint)', 'execute'));
select t.back();
commit;

do $$ declare f int := (select count(*) from t.results where not ok); begin
  raise notice 'demos-gestao: % falhas', f;
  if f > 0 then raise exception 'demos-gestao falhou'; end if; end $$;
