-- Demos: colunas por função e gestão de preços (migração 20261109140000).
\set ON_ERROR_STOP on
delete from t.results;

create or replace function t.sqlstate_of(sql text) returns text language plpgsql as $$
begin execute sql; return 'ok'; exception when others then return sqlstate; end $$;
grant execute on function t.sqlstate_of(text) to anon, authenticated;

insert into public.app_roles (name, is_admin, permissions) values
  ('Resp Local',  false, '{"demos": "view", "demos:precos": "edit"}'),
  ('Cols Preco',  false, '{"demos": "view", "demos:col:pvp": "view", "demos:col:pvp_desc": "view"}'),
  ('Cols Margem', false, '{"demos": "view", "demos:col:margem": "view"}'),
  ('Sem Cols',    false, '{"demos": "view"}'),
  ('So Precos',   false, '{"demos:precos": "edit"}')
  on conflict (name) do update set permissions = excluded.permissions;
insert into public.app_users (nome, email, perfil, local) values
  ('Resp Feira',  'dp_feira@x.pt',  'Resp Local',  '["Feira"]'),
  ('Resp Aveiro', 'dp_aveiro@x.pt', 'Resp Local',  '["Aveiro"]'),
  ('Cols Preco',  'dp_preco@x.pt',  'Cols Preco',  '["Aveiro"]'),
  ('Cols Margem', 'dp_margem@x.pt', 'Cols Margem', '["Aveiro"]'),
  ('Sem Cols',    'dp_sem@x.pt',    'Sem Cols',    '["Aveiro"]'),
  ('So Precos',   'dp_so@x.pt',     'So Precos',   '["Feira"]')
  on conflict (email) do update set perfil = excluded.perfil, local = excluded.local;
delete from public.viaturas where chassis like 'DP%';
insert into public.viaturas (chassis, modelo, local, inputs, stats) values
  ('DP-FEI', 'Feira', '["Feira"]',
    '{"pvb": 50000, "opc": 5000, "bsi": 100, "eco": 4.2, "leg": 1550, "isv": 0, "mgb": 0.05, "esf": 0.02, "pac": 0, "dem": 0, "sup": 0, "depreciacoes": 900, "pvp_desc": 60000}',
    '{"idade": 3, "idade_dias": 95, "mg": 1, "preco_minimo": 2}'),
  ('DP-AVR', 'Aveiro', '["Aveiro"]', '{"pvb": 40000, "opc": 0, "mgb": 0.1, "pvp_desc": 45000}', '{}');

-- Função com 'demos:precos': vê os 13 valores das do seu local, só dessas; a de Aveiro nem aparece.
begin;
select t.as_user('dp_feira@x.pt');
select t.check('resp. Feira (fora de Aveiro): abre o Demos e só vê as viaturas do seu local',
  public.access_rank('demos') = 1
  and (select count(*) from public.demos_viaturas() where chassis like 'DP%') = 1
  and exists (select 1 from public.demos_viaturas() where chassis = 'DP-FEI'));
select t.check('resp. Feira: recebe os valores de custo/desconto da sua viatura, sem stats internos',
  (select inputs ? 'mgb' and inputs ? 'depreciacoes' and inputs ? 'pvb' from public.demos_viaturas() where chassis = 'DP-FEI')
  and not (select stats ? 'mg' or stats ? 'preco_minimo' from public.demos_viaturas() where chassis = 'DP-FEI'));
select t.check('resp. Feira: grava preços da sua viatura',
  t.sqlstate_of($q$ select public.demos_gravar_precos('DP-FEI', '{"mgb": 0.08, "pvp_desc": 61000}') $q$) = 'ok');
select t.check('resp. Feira: não grava noutro local nem viatura inexistente',
  t.sqlstate_of($q$ select public.demos_gravar_precos('DP-AVR', '{"mgb": 0.08}') $q$) = '42501'
  and t.sqlstate_of($q$ select public.demos_gravar_precos('NAO-EXISTE', '{"mgb": 0.08}') $q$) = 'P0002');
select t.check('resp. Feira: valida chaves, tipos e percentagens',
  t.sqlstate_of($q$ select public.demos_gravar_precos('DP-FEI', '{"modelo": 1}') $q$) = '22023'
  and t.sqlstate_of($q$ select public.demos_gravar_precos('DP-FEI', '{"mgb": "x"}') $q$) = '22023'
  and t.sqlstate_of($q$ select public.demos_gravar_precos('DP-FEI', '{"mgb": 8}') $q$) = '22023'
  and t.sqlstate_of($q$ select public.demos_gravar_precos('DP-FEI', '{"pvb": 99999999999}') $q$) = '22023'
  and t.sqlstate_of($q$ select public.demos_gravar_precos('DP-FEI', '[1]') $q$) = '22023');
select t.check('resp. Feira: continua sem ler a tabela viaturas nem apagar',
  (select count(*) from public.viaturas where chassis = 'DP-AVR') = 0
  and t.dml($q$ delete from public.viaturas where chassis = 'DP-FEI' $q$) = 0);
select t.back();
commit;

-- O que ficou gravado: inputs fundidos, stats recalculados (fórmula Caetano) e sem perder idade.
select t.check('gravado: inputs fundidos e stats recalculados sem perder a idade',
  (select (inputs ->> 'mgb')::numeric = 0.08 and (inputs ->> 'pvb')::numeric = 50000 and (inputs ->> 'pvp_desc')::numeric = 61000
      and (stats ->> 'idade_dias')::int = 95
      -- (50000+5000+100+4.2+1550+0)*1.23 - (55000*(0.08+0.02))*1.23
      and abs((stats ->> 'preco_minimo')::numeric - ((56654.2 * 1.23) - (5500 * 1.23))) < 0.01
      and abs((stats ->> 'mg')::numeric - (61000 - ((56654.2 * 1.23) - (5500 * 1.23)) + 900)) < 0.01
   from public.viaturas where chassis = 'DP-FEI'));
select t.check('gravado: fica registo no histórico',
  exists (select 1 from public.historico where acao = 'ATUALIZAR_PRECOS' and registo_id = 'DP-FEI'
          and detalhes ->> 'editado_por' = 'dp_feira@x.pt'));

-- Responsável de Aveiro: vê o parque de Aveiro e, por 'demos:precos', as suas; só edita as do seu local.
begin;
select t.as_user('dp_aveiro@x.pt');
select t.check('resp. Aveiro: grava as suas, não as da Feira',
  t.sqlstate_of($q$ select public.demos_gravar_precos('DP-AVR', '{"mgb": 0.12}') $q$) = 'ok'
  and t.sqlstate_of($q$ select public.demos_gravar_precos('DP-FEI', '{"mgb": 0.12}') $q$) = '42501');
select t.check('resp. Aveiro: vê o parque todo (Aveiro não está limitado pelo local)',
  (select count(*) from public.demos_viaturas() where chassis like 'DP%') = 2);
select t.check('resp. Aveiro: dos preços da Feira só vê o que as colunas permitem (nada)',
  (select inputs = '{}'::jsonb from public.demos_viaturas() where chassis = 'DP-FEI'));
select t.back();
commit;

-- Colunas por função.
begin;
select t.as_user('dp_preco@x.pt');
select t.check('colunas PVP + PVP Desc: recebe só os valores de que precisam',
  (select array(select k from jsonb_object_keys(inputs) k order by k)
   from public.demos_viaturas() where chassis = 'DP-FEI') = array['bsi', 'eco', 'isv', 'leg', 'opc', 'pvb', 'pvp_desc']);
select t.check('colunas PVP + PVP Desc: não recebe descontos, depreciações nem stats de custo',
  (select not (inputs ? 'mgb' or inputs ? 'depreciacoes') and not (stats ? 'mg' or stats ? 'preco_minimo')
   from public.demos_viaturas() where chassis = 'DP-FEI'));
select t.check('sem demos:precos: não grava', t.sqlstate_of($q$ select public.demos_gravar_precos('DP-AVR', '{"mgb": 0.01}') $q$) = '42501');
select t.back();
select t.as_user('dp_margem@x.pt');
select t.check('coluna Margem: traz as suas dependências (custo, descontos, depreciações, PVP Desc), sem o BSI',
  (select inputs ?& array['pvb', 'opc', 'eco', 'leg', 'isv', 'mgb', 'esf', 'depreciacoes', 'pvp_desc'] and not inputs ? 'bsi'
   from public.demos_viaturas() where chassis = 'DP-FEI'));
select t.back();
select t.as_user('dp_sem@x.pt');
select t.check('sem colunas: vê as viaturas mas nenhum valor de preço',
  (select count(*) from public.demos_viaturas() where chassis like 'DP%') = 2
  and (select bool_and(inputs = '{}'::jsonb) from public.demos_viaturas() where chassis like 'DP%'));
select t.back();
select t.as_user('dp_so@x.pt');
select t.check('só demos:precos (sem o tab Demos): a exceção do local não dá acesso ao tab',
  public.access_rank('demos') = 0 and (select count(*) from public.demos_viaturas()) = 0);
select t.back();
commit;

-- Administrador e anónimo.
begin;
select t.as_user('admin_role@x.pt');
select t.check('admin: vê tudo e grava em qualquer local',
  (select inputs ? 'mgb' and stats ? 'mg' from public.demos_viaturas() where chassis = 'DP-FEI')
  and t.sqlstate_of($q$ select public.demos_gravar_precos('DP-FEI', '{"mgb": 0.05}') $q$) = 'ok');
select t.back();
select t.as_anon();
select t.check('anónimo: não executa', not has_function_privilege('anon', 'public.demos_gravar_precos(text, jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.demos_viaturas()', 'execute'));
select t.back();
commit;

-- Passo de dados da migração (volta a aplicar a migração, que é idempotente): funções com o tab ficam com as colunas que já viam.
insert into public.app_roles (name, is_admin, permissions) values ('Legado Demos', false, '{"demos": "view"}'), ('Legado Sem', false, '{"retails": "view"}')
  on conflict (name) do update set permissions = excluded.permissions;
\i :ROOT/supabase/migrations/20261109140000_demos_colunas_precos.sql
select t.check('migração: função com Demos ganha as colunas antigas; sem Demos fica igual',
  (select permissions ? 'demos:col:pvp' and permissions ? 'demos:col:pvp_siva' and not permissions ? 'demos:col:margem' and not permissions ? 'demos:col:dsc'
     from public.app_roles where name = 'Legado Demos')
  and (select not permissions ? 'demos:col:pvp' from public.app_roles where name = 'Legado Sem'));

do $$ declare f int := (select count(*) from t.results where not ok); begin
  raise notice 'demos-precos: % falhas', f;
  if f > 0 then raise exception 'demos-precos falhou'; end if; end $$;
