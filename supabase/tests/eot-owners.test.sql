-- Responsáveis do End-of-Term, mapa de nomes do Excel e chefe de equipa local
-- (migração 20261015120000). Corre depois das restantes suites (usa o schema t).
\set ON_ERROR_STOP on

delete from t.results;
-- (eot.test.sql voltou a aplicar a migração anterior, que repõe as políticas antigas;
-- esta migração é idempotente e volta a pôr as novas.) Precisa de -v ROOT=<repo>.
\i :ROOT/supabase/migrations/20261015120000_eot_responsaveis.sql
insert into public.app_roles (name, is_admin, permissions) values
  ('Chefe local', false, '{"end-of-term": "edit", "end-of-term:local": "edit"}'),
  ('Vend EOT2',   false, '{"end-of-term": "edit"}'),
  ('Finance2',    false, '{"end-of-term": "edit", "end-of-term:todos": "edit"}')
  on conflict (name) do update set permissions = excluded.permissions;
insert into public.app_users (nome, email, perfil) values
  ('Chefe Aveiro', 'lead_av@x.pt', 'Chefe local'), ('Chefe Viseu', 'lead_vs@x.pt', 'Chefe local'),
  ('Vendedor Av', 'sell_av@x.pt', 'Vend EOT2'), ('Fin Dois', 'fin_dois@x.pt', 'Finance2'),
  ('Sem acesso', 'noeot@x.pt', 'Sem EOT')
  on conflict (email) do update set perfil = excluded.perfil;

delete from public.eot_vendedor_map; delete from public.eot_owners;
delete from public.eot_activities; delete from public.eot_contracts;
insert into public.eot_owners (email, iniciais, locais) values
  ('lead_av@x.pt', 'CA', '{Aveiro}'), ('lead_vs@x.pt', 'CV', '{Viseu}'),
  ('sell_av@x.pt', 'VA', '{Aveiro}');

-- ── eot_local_of: espelha contractLocal() em src/lib/eot.ts ─────────────────────
select t.check('local: tira a marca e o sufixo numérico',
  public.eot_local_of('Baviera Aveiro 2', null) = 'Aveiro'
  and public.eot_local_of('Caetano Aveiro', null) = 'Aveiro'
  and public.eot_local_of('Caetano Baviera - Viseu', null) = 'Viseu');
select t.check('local: corta o sufixo " - ..." e normaliza Gaia',
  public.eot_local_of('Lisboa - M.G.Costa', null) = 'Lisboa'
  and public.eot_local_of('V. N. Gaia', null) = 'Gaia');
select t.check('local: sem concessionário responsável usa o concessionário; vazio dá —',
  public.eot_local_of(null, 'Caetano Porto') = 'Porto'
  and public.eot_local_of('', 'Caetano Porto') = 'Porto'
  and public.eot_local_of(null, null) = '—' and public.eot_local_of('  ', '') = '—');
select t.check('local: se a limpeza esvaziar o nome mantém o original',
  public.eot_local_of('Caetano', null) = 'Caetano');

insert into public.eot_contracts (contrato, cliente, concessionario_resp, owner_email) values
  ('L-AV1', 'Cli Av 1', 'Baviera Aveiro 2', null),
  ('L-AV2', 'Cli Av 2', 'Caetano Aveiro', 'sell_av@x.pt'),
  ('L-VS1', 'Cli Vs 1', 'Caetano Viseu', null),
  ('L-VS2', 'Cli Vs 2', 'Caetano Viseu', 'sell_av@x.pt');
select t.check('trigger: o local é calculado ao inserir',
  (select local from public.eot_contracts where contrato = 'L-AV1') = 'Aveiro');
update public.eot_contracts set concessionario_resp = 'Caetano Viseu' where contrato = 'L-AV1';
select t.check('trigger: e recalculado quando o concessionário muda',
  (select local from public.eot_contracts where contrato = 'L-AV1') = 'Viseu');
update public.eot_contracts set concessionario_resp = 'Baviera Aveiro 2' where contrato = 'L-AV1';

-- ── Contratos: chefe de equipa local ────────────────────────────────────────────
begin;
select t.as_user('lead_av@x.pt');
select t.check('chefe local: vê os contratos do seu local e os que lhe estão afetos, não os de outro local',
  (select count(*) from public.eot_contracts) = 2
  and not exists (select 1 from public.eot_contracts where contrato = 'L-VS1'));
select t.check('chefe local: atribui um contrato sem dono do seu local',
  t.dml($q$ update public.eot_contracts set owner_email = 'sell_av@x.pt', owner_nome = 'VA' where contrato = 'L-AV1' $q$) = 1);
select t.check('chefe local: não altera contratos de outro local',
  t.dml($q$ update public.eot_contracts set owner_email = 'lead_av@x.pt' where contrato = 'L-VS1' $q$) = 0);
select t.check('chefe local: não passa um contrato do seu local para outro local alterando o concessionário (bloqueado)',
  t.dml($q$ update public.eot_contracts set concessionario_resp = 'Caetano Viseu' where contrato = 'L-AV2' $q$) = -1);
select t.back();
commit;

begin;
select t.as_user('lead_vs@x.pt');
select t.check('chefe local (Viseu): só vê Viseu',
  (select count(*) from public.eot_contracts where local = 'Viseu') = (select count(*) from public.eot_contracts)
  and (select count(*) from public.eot_contracts) = 2);
select t.back();
commit;

begin;
select t.as_user('sell_av@x.pt');
select t.check('vendedor: continua a ver só os seus contratos (não ganha o local)',
  (select count(*) from public.eot_contracts) = 3
  and (select bool_and(owner_email = 'sell_av@x.pt') from public.eot_contracts));
select t.back();
commit;

begin;
select t.as_user('fin_dois@x.pt');
select t.check('end-of-term:todos: vê todos os contratos',
  (select count(*) from public.eot_contracts) = 4);
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
select t.as_user('sell_av@x.pt');
select t.check('responsáveis: um vendedor lê a lista',
  (select count(*) from public.eot_owners) = 3);
select t.check('responsáveis: um vendedor não escreve',
  t.dml($q$ insert into public.eot_owners (email, iniciais, locais) values ('x1@x.pt', 'X1', '{Aveiro}') $q$) = -1
  and t.dml($q$ update public.eot_owners set iniciais = 'ZZ' where email = 'lead_av@x.pt' $q$) = 0
  and t.dml($q$ delete from public.eot_owners where email = 'lead_av@x.pt' $q$) = 0);
select t.back();
commit;

begin;
select t.as_user('lead_av@x.pt');
select t.check('responsáveis: o chefe adiciona alguém do seu local',
  t.dml($q$ insert into public.eot_owners (email, iniciais, locais) values ('novo_av@x.pt', 'NA', '{Aveiro}') $q$) = 1);
select t.check('responsáveis: o chefe não adiciona alguém de outro local, nem de local misto, nem sem local',
  t.dml($q$ insert into public.eot_owners (email, iniciais, locais) values ('novo_vs@x.pt', 'NV', '{Viseu}') $q$) = -1
  and t.dml($q$ insert into public.eot_owners (email, iniciais, locais) values ('misto@x.pt', 'MI', '{Aveiro,Viseu}') $q$) = -1
  and t.dml($q$ insert into public.eot_owners (email, iniciais, locais) values ('vazio@x.pt', 'VZ', '{}') $q$) = -1);
select t.check('responsáveis: o chefe edita alguém do seu local mas não lhe põe outro local',
  t.dml($q$ update public.eot_owners set iniciais = 'VA2' where email = 'sell_av@x.pt' $q$) = 1
  and t.dml($q$ update public.eot_owners set locais = '{Viseu}' where email = 'sell_av@x.pt' $q$) = -1);
select t.check('responsáveis: o chefe não edita nem apaga responsáveis de outro local',
  t.dml($q$ update public.eot_owners set iniciais = 'ZZ' where email = 'lead_vs@x.pt' $q$) = 0
  and t.dml($q$ delete from public.eot_owners where email = 'lead_vs@x.pt' $q$) = 0);
select t.check('responsáveis: o chefe apaga alguém do seu local',
  t.dml($q$ delete from public.eot_owners where email = 'novo_av@x.pt' $q$) = 1);
select t.back();
commit;

begin;
select t.as_user('fin_dois@x.pt');
select t.check('responsáveis: quem tem end-of-term:todos escreve em qualquer local',
  t.dml($q$ insert into public.eot_owners (email, iniciais, locais) values ('novo_vs@x.pt', 'NV', '{Viseu}') $q$) = 1);
select t.back();
commit;

begin;
select t.as_user('admin_role@x.pt');
select t.check('responsáveis: o administrador escreve',
  t.dml($q$ update public.eot_owners set iniciais = 'NV2' where email = 'novo_vs@x.pt' $q$) = 1);
select t.back();
commit;

-- ── Mapa de nomes do Excel ──────────────────────────────────────────────────────
begin;
select t.as_user('lead_av@x.pt');
select t.check('mapa: o chefe mapeia um nome para um responsável do seu local',
  t.dml($q$ insert into public.eot_vendedor_map (raw_norm, owner_email, raw_exemplo) values ('VENDEDOR A', 'sell_av@x.pt', 'Vendedor A.') $q$) = 1);
select t.check('mapa: o chefe não mapeia para um responsável de outro local',
  t.dml($q$ insert into public.eot_vendedor_map (raw_norm, owner_email) values ('VENDEDOR A', 'lead_vs@x.pt') $q$) = -1);
select t.check('mapa: o mesmo nome pode apontar para mais de um responsável',
  t.dml($q$ insert into public.eot_vendedor_map (raw_norm, owner_email) values ('VENDEDOR A', 'lead_av@x.pt') $q$) = 1);
select t.check('mapa: ficam dois responsáveis para o mesmo nome',
  (select count(*) from public.eot_vendedor_map where raw_norm = 'VENDEDOR A') = 2);
select t.check('mapa: o chefe remove um mapeamento do seu local',
  t.dml($q$ delete from public.eot_vendedor_map where raw_norm = 'VENDEDOR A' and owner_email = 'lead_av@x.pt' $q$) = 1);
select t.back();
commit;

insert into public.eot_vendedor_map (raw_norm, owner_email) values ('VENDEDOR V', 'lead_vs@x.pt');
begin;
select t.as_user('lead_av@x.pt');
select t.check('mapa: o chefe não remove nem altera mapeamentos de outro local',
  t.dml($q$ delete from public.eot_vendedor_map where raw_norm = 'VENDEDOR V' $q$) = 0
  and t.dml($q$ update public.eot_vendedor_map set raw_exemplo = 'x' where raw_norm = 'VENDEDOR V' $q$) = 0);
select t.back();
commit;
begin;
select t.as_user('sell_av@x.pt');
select t.check('mapa: um vendedor lê mas não escreve',
  (select count(*) from public.eot_vendedor_map) = 2
  and t.dml($q$ insert into public.eot_vendedor_map (raw_norm, owner_email) values ('Z', 'sell_av@x.pt') $q$) = -1);
select t.back();
commit;

delete from public.eot_owners where email = 'sell_av@x.pt';
select t.check('mapa: apagar um responsável apaga os seus mapeamentos',
  not exists (select 1 from public.eot_vendedor_map where owner_email = 'sell_av@x.pt'));

select t.check('app_capabilities anuncia os responsáveis do End-of-Term',
  public.app_capabilities() = '{"lavagem_granular": true, "eot_granular": true, "eot_responsaveis": true}'::jsonb);

do $$
declare total int := (select count(*) from t.results);
        fails int := (select count(*) from t.results where not ok);
begin
  raise notice 'eot-owners: % verificações, % falhas', total, fails;
  if fails > 0 then raise exception 'eot-owners: % verificações falharam', fails; end if;
end $$;
