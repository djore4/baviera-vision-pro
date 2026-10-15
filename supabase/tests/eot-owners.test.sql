-- Responsáveis do End-of-Term, mapa de nomes do Excel e chefe de equipa
-- (migrações 20261015120000 e 20261016120000). Corre depois das restantes suites
-- (usa o schema t). Precisa de -v ROOT=<repo>.
\set ON_ERROR_STOP on

delete from t.results;
-- (eot.test.sql voltou a aplicar a migração anterior, que repõe as políticas antigas;
-- estas migrações são idempotentes e voltam a pôr as novas.)
\i :ROOT/supabase/migrations/20261015120000_eot_responsaveis.sql
\i :ROOT/supabase/migrations/20261016120000_eot_equipas.sql
\i :ROOT/supabase/migrations/20261016120000_eot_equipas.sql

insert into public.app_roles (name, is_admin, permissions) values
  ('Chefe local', false, '{"end-of-term": "edit", "end-of-term:local": "edit"}'),
  ('Vend EOT2',   false, '{"end-of-term": "edit"}'),
  ('Finance2',    false, '{"end-of-term": "edit", "end-of-term:todos": "edit"}'),
  ('Supervisor EoT', false, '{"end-of-term": "edit"}')
  on conflict (name) do update set permissions = excluded.permissions;
-- a migração dá a visão total ao Supervisor EoT (volta a correr sobre o perfil acabado de criar)
\i :ROOT/supabase/migrations/20261016120000_eot_equipas.sql
insert into public.app_users (nome, email, perfil) values
  ('Chefe A', 'lead_a@x.pt', 'Chefe local'), ('Chefe B', 'lead_b@x.pt', 'Chefe local'),
  ('Vendedor A1', 'sell_a1@x.pt', 'Vend EOT2'), ('Vendedor A2', 'sell_a2@x.pt', 'Vend EOT2'),
  ('Vendedor B1', 'sell_b1@x.pt', 'Vend EOT2'),
  ('Fin Dois', 'fin_dois@x.pt', 'Finance2'), ('Supervisor', 'sup@x.pt', 'Supervisor EoT'),
  ('Sem acesso', 'noeot@x.pt', 'Sem EOT')
  on conflict (email) do update set perfil = excluded.perfil;

select t.check('migração: o Supervisor EoT ganha end-of-term:todos',
  (select permissions ? 'end-of-term:todos' from public.app_roles where name = 'Supervisor EoT'));
select t.check('migração: a coluna local e as funções do local desaparecem',
  not exists (select 1 from information_schema.columns where table_name = 'eot_contracts' and column_name = 'local')
  and to_regprocedure('public.eot_local_of(text,text)') is null
  and to_regprocedure('public.eot_my_locais()') is null);

delete from public.eot_vendedor_map; delete from public.eot_owners;
delete from public.eot_activities; delete from public.eot_contracts;
-- Duas equipas: A (chefe lead_a: sell_a1, sell_a2) e B (chefe lead_b: sell_b1).
insert into public.eot_owners (email, iniciais, locais, chefe_email) values
  ('lead_a@x.pt', 'CA', '{Aveiro}', null), ('lead_b@x.pt', 'CB', '{Aveiro}', null);
insert into public.eot_owners (email, iniciais, locais, chefe_email) values
  ('sell_a1@x.pt', 'A1', '{Aveiro}', 'lead_a@x.pt'), ('sell_a2@x.pt', 'A2', '{Aveiro}', 'lead_a@x.pt'),
  ('sell_b1@x.pt', 'B1', '{Aveiro}', 'lead_b@x.pt');

insert into public.eot_contracts (contrato, cliente, concessionario_resp, owner_email) values
  ('C-A1', 'Cli A1', 'Caetano Aveiro', 'sell_a1@x.pt'),
  ('C-A2', 'Cli A2', 'Caetano Aveiro', 'sell_a2@x.pt'),
  ('C-LA', 'Cli LA', 'Caetano Aveiro', 'lead_a@x.pt'),
  ('C-B1', 'Cli B1', 'Caetano Aveiro', 'sell_b1@x.pt'),
  ('C-0',  'Sem dono', 'Caetano Aveiro', null);

-- ── Contratos ───────────────────────────────────────────────────────────────────
begin;
select t.as_user('lead_a@x.pt');
select t.check('chefe: vê os contratos da sua equipa e os seus; não os de outra equipa nem os sem dono (mesmo no mesmo local)',
  (select count(*) from public.eot_contracts) = 3
  and not exists (select 1 from public.eot_contracts where contrato in ('C-B1', 'C-0')));
select t.check('chefe: passa um contrato de um vendedor da equipa para outro da equipa',
  t.dml($q$ update public.eot_contracts set owner_email = 'sell_a2@x.pt', owner_nome = 'A2' where contrato = 'C-A1' $q$) = 1);
select t.check('chefe: não passa um contrato da equipa para alguém de fora (bloqueado)',
  t.dml($q$ update public.eot_contracts set owner_email = 'sell_b1@x.pt' where contrato = 'C-A2' $q$) = -1
  and t.dml($q$ update public.eot_contracts set owner_email = 'outro@x.pt' where contrato = 'C-A2' $q$) = -1);
select t.check('chefe: não altera contratos de outra equipa nem sem dono',
  t.dml($q$ update public.eot_contracts set obs = 'x' where contrato in ('C-B1', 'C-0') $q$) = 0);
select t.check('chefe: não "apanha" um contrato sem dono atribuindo-o a si',
  t.dml($q$ update public.eot_contracts set owner_email = 'lead_a@x.pt' where contrato = 'C-0' $q$) = 0);
select t.back();
commit;

begin;
select t.as_user('sell_a1@x.pt');
select t.check('vendedor: continua a ver só os seus (não vê os da equipa)',
  (select count(*) from public.eot_contracts) = 0);
select t.back();
commit;
update public.eot_contracts set owner_email = 'sell_a1@x.pt' where contrato = 'C-A1';
begin;
select t.as_user('sell_a1@x.pt');
select t.check('vendedor: vê o que lhe está atribuído',
  (select count(*) from public.eot_contracts) = 1 and (select contrato from public.eot_contracts) = 'C-A1');
select t.back();
commit;

begin;
select t.as_user('lead_b@x.pt');
select t.check('chefe B: só vê a equipa B', (select count(*) from public.eot_contracts) = 1
  and (select contrato from public.eot_contracts) = 'C-B1');
select t.back();
commit;

begin;
select t.as_user('fin_dois@x.pt');
select t.check('end-of-term:todos (Finance): vê todos, incluindo os sem dono',
  (select count(*) from public.eot_contracts) = 5);
select t.back();
commit;
begin;
select t.as_user('sup@x.pt');
select t.check('Supervisor EoT: vê todos os contratos',
  (select count(*) from public.eot_contracts) = 5);
select t.back();
commit;

begin;
select t.as_user('noeot@x.pt');
select t.check('sem acesso ao tab: não vê contratos, responsáveis nem mapeamentos',
  (select count(*) from public.eot_contracts) = 0 and (select count(*) from public.eot_owners) = 0);
select t.back();
commit;

-- ── Responsáveis ────────────────────────────────────────────────────────────────
begin;
select t.as_user('sell_a1@x.pt');
select t.check('responsáveis: um vendedor lê a lista mas não escreve',
  (select count(*) from public.eot_owners) = 5
  and t.dml($q$ insert into public.eot_owners (email, iniciais, chefe_email) values ('x1@x.pt', 'X1', 'lead_a@x.pt') $q$) = -1
  and t.dml($q$ update public.eot_owners set iniciais = 'ZZ' where email = 'sell_a2@x.pt' $q$) = 0
  and t.dml($q$ delete from public.eot_owners where email = 'sell_a2@x.pt' $q$) = 0);
select t.back();
commit;

begin;
select t.as_user('lead_a@x.pt');
select t.check('responsáveis: o chefe acrescenta alguém à sua equipa',
  t.dml($q$ insert into public.eot_owners (email, iniciais, locais, chefe_email) values ('novo_a@x.pt', 'NA', '{Aveiro}', 'lead_a@x.pt') $q$) = 1);
select t.check('responsáveis: o chefe não cria alguém sem equipa, na equipa de outro, nem outro chefe',
  t.dml($q$ insert into public.eot_owners (email, iniciais) values ('sem_chefe@x.pt', 'SC') $q$) = -1
  and t.dml($q$ insert into public.eot_owners (email, iniciais, chefe_email) values ('na_b@x.pt', 'NB', 'lead_b@x.pt') $q$) = -1);
select t.check('responsáveis: o chefe edita alguém da equipa mas não o muda para outra equipa',
  t.dml($q$ update public.eot_owners set iniciais = 'A2X' where email = 'sell_a2@x.pt' $q$) = 1
  and t.dml($q$ update public.eot_owners set chefe_email = 'lead_b@x.pt' where email = 'sell_a2@x.pt' $q$) = -1
  and t.dml($q$ update public.eot_owners set chefe_email = null where email = 'sell_a2@x.pt' $q$) = -1);
select t.check('responsáveis: o chefe não edita a sua ficha, a de outro chefe, nem alguém de outra equipa',
  t.dml($q$ update public.eot_owners set locais = '{Porto}' where email = 'lead_a@x.pt' $q$) = 0
  and t.dml($q$ update public.eot_owners set iniciais = 'ZZ' where email = 'lead_b@x.pt' $q$) = 0
  and t.dml($q$ update public.eot_owners set iniciais = 'ZZ' where email = 'sell_b1@x.pt' $q$) = 0
  and t.dml($q$ delete from public.eot_owners where email = 'sell_b1@x.pt' $q$) = 0);
select t.check('responsáveis: o chefe apaga alguém da sua equipa',
  t.dml($q$ delete from public.eot_owners where email = 'novo_a@x.pt' $q$) = 1);
select t.back();
commit;

begin;
select t.as_user('fin_dois@x.pt');
select t.check('responsáveis: o Finance define chefes e equipas',
  t.dml($q$ insert into public.eot_owners (email, iniciais, chefe_email) values ('novo_b@x.pt', 'NB', 'lead_b@x.pt') $q$) = 1
  and t.dml($q$ update public.eot_owners set chefe_email = 'lead_a@x.pt' where email = 'novo_b@x.pt' $q$) = 1);
select t.back();
commit;
begin;
select t.as_user('admin_role@x.pt');
select t.check('responsáveis: o administrador escreve',
  t.dml($q$ update public.eot_owners set iniciais = 'NB2' where email = 'novo_b@x.pt' $q$) = 1);
select t.back();
commit;

-- ── Mapa de nomes do Excel ──────────────────────────────────────────────────────
begin;
select t.as_user('lead_a@x.pt');
select t.check('mapa: o chefe mapeia um nome para alguém da sua equipa',
  t.dml($q$ insert into public.eot_vendedor_map (raw_norm, owner_email, raw_exemplo) values ('VENDEDOR A', 'sell_a1@x.pt', 'Vendedor A.') $q$) = 1);
select t.check('mapa: o chefe não mapeia para alguém de outra equipa nem para si (não é da equipa)',
  t.dml($q$ insert into public.eot_vendedor_map (raw_norm, owner_email) values ('VENDEDOR A', 'sell_b1@x.pt') $q$) = -1
  and t.dml($q$ insert into public.eot_vendedor_map (raw_norm, owner_email) values ('VENDEDOR A', 'lead_a@x.pt') $q$) = -1);
select t.check('mapa: o mesmo nome pode apontar para mais de um responsável',
  t.dml($q$ insert into public.eot_vendedor_map (raw_norm, owner_email) values ('VENDEDOR A', 'sell_a2@x.pt') $q$) = 1);
select t.check('mapa: ficam dois responsáveis para o mesmo nome',
  (select count(*) from public.eot_vendedor_map where raw_norm = 'VENDEDOR A') = 2);
select t.check('mapa: o chefe remove um mapeamento da sua equipa',
  t.dml($q$ delete from public.eot_vendedor_map where raw_norm = 'VENDEDOR A' and owner_email = 'sell_a2@x.pt' $q$) = 1);
select t.back();
commit;

insert into public.eot_vendedor_map (raw_norm, owner_email) values ('VENDEDOR B', 'sell_b1@x.pt');
begin;
select t.as_user('lead_a@x.pt');
select t.check('mapa: o chefe não remove nem altera mapeamentos de outra equipa',
  t.dml($q$ delete from public.eot_vendedor_map where raw_norm = 'VENDEDOR B' $q$) = 0
  and t.dml($q$ update public.eot_vendedor_map set raw_exemplo = 'x' where raw_norm = 'VENDEDOR B' $q$) = 0);
select t.back();
commit;
begin;
select t.as_user('sell_a1@x.pt');
select t.check('mapa: um vendedor lê mas não escreve',
  (select count(*) from public.eot_vendedor_map) = 2
  and t.dml($q$ insert into public.eot_vendedor_map (raw_norm, owner_email) values ('Z', 'sell_a1@x.pt') $q$) = -1);
select t.back();
commit;

delete from public.eot_owners where email = 'sell_a1@x.pt';
select t.check('mapa: apagar um responsável apaga os seus mapeamentos',
  not exists (select 1 from public.eot_vendedor_map where owner_email = 'sell_a1@x.pt'));
delete from public.eot_owners where email = 'lead_a@x.pt';
select t.check('equipa: apagar o chefe deixa a equipa sem chefe (não a apaga)',
  (select chefe_email from public.eot_owners where email = 'sell_a2@x.pt') is null);

select t.check('app_capabilities anuncia os responsáveis do End-of-Term',
  public.app_capabilities() = '{"lavagem_granular": true, "eot_granular": true, "eot_responsaveis": true}'::jsonb);

do $$
declare total int := (select count(*) from t.results);
        fails int := (select count(*) from t.results where not ok);
begin
  raise notice 'eot-owners: % verificações, % falhas', total, fails;
  if fails > 0 then raise exception 'eot-owners: % verificações falharam', fails; end if;
end $$;
