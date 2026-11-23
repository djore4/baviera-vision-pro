-- Funil VN: o vendedor escreve só os seus negócios (migração 20261123100000_funil_vendedor_escrita).
\set ON_ERROR_STOP on
delete from t.results;

insert into public.app_roles (name, is_admin, permissions) values
  ('Funil Edit', false, '{"funil": "edit"}'),
  ('Funil View', false, '{"funil": "view"}')
  on conflict (name) do update set permissions = excluded.permissions;
insert into public.app_users (nome, email, perfil) values
  ('Joana Maria Lopes', 'fv_jl@x.pt',    'Funil Edit'),     -- JL (única)
  ('Rui Duarte',        'fv_rd1@x.pt',   'Funil Edit'),     -- RD (repetida)
  ('Rita Dias',         'fv_rd2@x.pt',   'Funil Edit'),     -- RD (repetida)
  ('Álvaro Xavier',     'fv_ax@x.pt',    'Funil Edit'),     -- derivaria AX, mas o EoT diz ZZ
  ('Carlos Ver',        'fv_cv@x.pt',    'Funil View')
  on conflict (email) do update set perfil = excluded.perfil, nome = excluded.nome;
insert into public.eot_owners (email, iniciais, locais) values ('fv_ax@x.pt', 'zz', '{}')
  on conflict (email) do update set iniciais = excluded.iniciais;

delete from public.control_records where obs like 'fv:%';
insert into public.control_records (status, resp, obs) values
  ('Frio',    'JL', 'fv: meu frio'),
  ('Quente',  'JL', 'fv: meu quente'),
  ('Morno',   'AB', 'fv: do colega'),
  ('Carteira','JL', 'fv: meu mas já em carteira'),
  ('Frio',    'RD', 'fv: do rd'),
  ('Frio',    'ZZ', 'fv: do zz');

select t.check('iniciais_do_nome: primeira+última, sem acentos',
  public.iniciais_do_nome('Joana Maria Lopes') = 'JL' and public.iniciais_do_nome('Álvaro  Xavier') = 'AX'
  and public.iniciais_do_nome('Madonna') = 'M' and public.iniciais_do_nome('  ') is null);

begin;
select t.as_user('fv_jl@x.pt');
select t.check('jl: minhas_iniciais = {JL}', public.minhas_iniciais() = array['JL']);
select t.check('jl: edita o seu negócio do funil',
  t.dml($q$ update public.control_records set obs = 'fv: meu frio' , version = 'X1' where obs = 'fv: meu frio' $q$) = 1);
select t.check('jl: muda o estado dentro do funil (Frio → Morno)',
  t.dml($q$ update public.control_records set status = 'Morno' where obs = 'fv: meu frio' $q$) = 1);
select t.check('jl: NÃO edita negócio de colega',
  t.dml($q$ update public.control_records set obs = 'fv: do colega' , version = 'hack' where obs = 'fv: do colega' $q$) = 0);
select t.check('jl: NÃO passa o seu negócio para outro responsável',
  t.dml($q$ update public.control_records set resp = 'AB' where obs = 'fv: meu quente' $q$) = -1);
select t.check('jl: NÃO tira o negócio do funil (→ Carteira)',
  t.dml($q$ update public.control_records set status = 'Carteira' where obs = 'fv: meu quente' $q$) = -1);
select t.check('jl: NÃO edita negócio já em carteira (mesmo sendo seu)',
  t.dml($q$ update public.control_records set version = 'hack' where obs = 'fv: meu mas já em carteira' $q$) = 0);
select t.check('jl: NÃO se apropria de negócio de outro',
  t.dml($q$ update public.control_records set resp = 'JL' where obs = 'fv: do colega' $q$) = 0);
select t.check('jl: cria negócio Frio seu',
  t.dml($q$ insert into public.control_records (status, resp, obs) values ('Frio', 'jl', 'fv: novo meu') $q$) = 1);
select t.check('jl: NÃO cria negócio para outro responsável',
  t.dml($q$ insert into public.control_records (status, resp, obs) values ('Frio', 'AB', 'fv: novo alheio') $q$) = -1);
select t.check('jl: NÃO cria negócio fora do funil',
  t.dml($q$ insert into public.control_records (status, resp, obs) values ('Carteira', 'JL', 'fv: novo carteira') $q$) = -1);
select t.check('jl: elimina o seu negócio do funil',
  t.dml($q$ delete from public.control_records where obs = 'fv: novo meu' $q$) = 1);
select t.check('jl: NÃO elimina negócio de colega',
  t.dml($q$ delete from public.control_records where obs = 'fv: do colega' $q$) = 0);
select t.check('jl: NÃO elimina negócio em carteira',
  t.dml($q$ delete from public.control_records where obs = 'fv: meu mas já em carteira' $q$) = 0);
select t.check('jl: continua a ler tudo',  t.n('control_records') >= 6);
select t.back();
commit;

begin;
select t.as_user('fv_rd1@x.pt');
select t.check('iniciais repetidas: ninguém as herda por engano',
  public.minhas_iniciais() = '{}'::text[]
  and t.dml($q$ update public.control_records set version = 'hack' where obs = 'fv: do rd' $q$) = 0
  and t.dml($q$ insert into public.control_records (status, resp, obs) values ('Frio', 'RD', 'fv: rd novo') $q$) = -1);
select t.back();
commit;

begin;
select t.as_user('fv_ax@x.pt');
select t.check('eot_owners manda sobre o nome: ZZ (e não AX)',
  public.minhas_iniciais() = array['ZZ']
  and t.dml($q$ update public.control_records set version = 'ok' where obs = 'fv: do zz' $q$) = 1);
select t.back();
commit;

begin;
select t.as_user('fv_cv@x.pt');
select t.check('funil só em consulta: não escreve nada',
  t.dml($q$ update public.control_records set version = 'hack' where obs = 'fv: do colega' $q$) = 0
  and t.dml($q$ insert into public.control_records (status, resp, obs) values ('Frio', 'CV', 'fv: cv') $q$) = -1
  and t.dml($q$ delete from public.control_records where obs like 'fv:%' $q$) = 0);
select t.back();
commit;

select t.check('migração: a função Vendedor (equipa BMW VN) fica com funil em edição',
  coalesce((select permissions_equipa -> 'BMW VN' ->> 'funil' from public.app_roles where name = 'Vendedor'), 'edit') = 'edit');

delete from public.control_records where obs like 'fv:%';

do $$
declare total int := (select count(*) from t.results);
        fails int := (select count(*) from t.results where not ok);
begin
  raise notice 'funil-vendedor: % verificações, % falhas', total, fails;
  if fails > 0 then raise exception 'funil-vendedor: % verificações falharam', fails; end if;
end $$;
