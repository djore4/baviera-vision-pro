-- Painel (ecrã inicial do vendedor): eventos que não se conseguem deduzir do estado atual
-- e mensagens da administração fixadas no painel.
--
-- 1. Mensagens no painel: as notificações ganham `painel` (mostrar no Painel, além do sino) e
--    `expira_em` (a partir daí deixa de aparecer no Painel; continua no sino). Quem já existe fica
--    fora do painel (default false).
--
-- 2. painel_eventos: registo de
--      * 'preco_reducao' — redução do PVP de uma demo (viaturas.inputs.pvp_desc) ou de uma viatura
--        de stock VU (retomas.preco);
--      * 'premio'        — prémio de venda lançado/aumentado numa demo (demos_premios).
--    O estado atual não diz QUANDO o preço baixou nem quando o prémio foi acrescentado, por isso
--    um trigger regista o evento no momento em que acontece (venha da app ou da plataforma Caetano,
--    que partilha a tabela `viaturas`). Só se regista o que o painel mostra (reduções, não subidas).
--    O trigger em `viaturas` NÃO altera a tabela (só lê OLD/NEW e escreve noutra tabela).
--
-- Leitura: quem tem acesso ao tab 'painel'. Escrita: só os triggers (security definer).
-- Idempotente.

alter table public.notifications add column if not exists painel boolean not null default false;
alter table public.notifications add column if not exists expira_em timestamptz;

create table if not exists public.painel_eventos (
  id           bigint generated always as identity primary key,
  tipo         text not null check (tipo in ('preco_reducao', 'premio')),
  origem       text not null check (origem in ('demo', 'stock')),
  chave        text not null,                   -- chassis (demo) ou id da retoma (stock)
  descricao    text,                            -- "Série 3 320d · 12-AB-34", para mostrar sem cruzar tabelas
  valor_antes  numeric,
  valor_depois numeric,
  created_at   timestamptz not null default now(),
  created_by   text                             -- email de quem fez a alteração (jwt), se houver
);

create index if not exists painel_eventos_tipo_created_idx on public.painel_eventos (tipo, created_at desc);

alter table public.painel_eventos enable row level security;

drop policy if exists painel_eventos_select on public.painel_eventos;
create policy painel_eventos_select on public.painel_eventos for select to authenticated
  using ((select public.has_access('painel')));

revoke all on public.painel_eventos from anon;
revoke insert, update, delete on public.painel_eventos from authenticated;
grant select on public.painel_eventos to authenticated;

-- PVP de uma demo: viaturas.inputs é um objeto jsonb ou (em linhas antigas) um texto JSON.
create or replace function public.painel_pvp_desc(j jsonb)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
  o jsonb;
begin
  if j is null then return null; end if;
  o := case jsonb_typeof(j) when 'object' then j when 'string' then (j #>> '{}')::jsonb else null end;
  return nullif(o ->> 'pvp_desc', '')::numeric;
exception when others then
  return null;
end;
$$;

create or replace function public.painel_regista_preco_demo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  antes numeric := public.painel_pvp_desc(old.inputs);
  depois numeric := public.painel_pvp_desc(new.inputs);
begin
  if antes is not null and depois is not null and antes > 0 and depois > 0 and depois < antes then
    insert into public.painel_eventos (tipo, origem, chave, descricao, valor_antes, valor_depois, created_by)
    values ('preco_reducao', 'demo', new.chassis,
            nullif(btrim(coalesce(new.modelo, '') || ' ' || coalesce(new.versao, '') || ' · ' || coalesce(new.matricula, '')), '·'),
            antes, depois, lower(auth.jwt() ->> 'email'));
  end if;
  return new;
end;
$$;

drop trigger if exists painel_regista_preco_demo on public.viaturas;
create trigger painel_regista_preco_demo
  after update of inputs on public.viaturas
  for each row execute function public.painel_regista_preco_demo();

create or replace function public.painel_regista_preco_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.preco is not null and new.preco is not null and old.preco > 0 and new.preco < old.preco then
    insert into public.painel_eventos (tipo, origem, chave, descricao, valor_antes, valor_depois, created_by)
    values ('preco_reducao', 'stock', new.id::text,
            btrim(coalesce(new.marca, '') || ' ' || coalesce(new.modelo, '') || ' · ' || coalesce(new.matricula, '')),
            old.preco, new.preco, lower(auth.jwt() ->> 'email'));
  end if;
  return new;
end;
$$;

drop trigger if exists painel_regista_preco_stock on public.retomas;
create trigger painel_regista_preco_stock
  after update of preco on public.retomas
  for each row execute function public.painel_regista_preco_stock();

create or replace function public.painel_regista_premio()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
begin
  -- Só interessa um prémio novo ou um prémio que subiu.
  if tg_op = 'UPDATE' and new.premio <= old.premio then
    return new;
  end if;
  select modelo, versao, matricula into v from public.viaturas where chassis = new.chassis;
  insert into public.painel_eventos (tipo, origem, chave, descricao, valor_antes, valor_depois, created_by)
  values ('premio', 'demo', new.chassis,
          nullif(btrim(coalesce(v.modelo, '') || ' ' || coalesce(v.versao, '') || ' · ' || coalesce(v.matricula, '')), '·'),
          case when tg_op = 'UPDATE' then old.premio end, new.premio, lower(auth.jwt() ->> 'email'));
  return new;
end;
$$;

drop trigger if exists painel_regista_premio on public.demos_premios;
create trigger painel_regista_premio
  after insert or update of premio on public.demos_premios
  for each row execute function public.painel_regista_premio();

revoke all on function public.painel_regista_preco_demo() from public, anon, authenticated;
revoke all on function public.painel_regista_preco_stock() from public, anon, authenticated;
revoke all on function public.painel_regista_premio() from public, anon, authenticated;
