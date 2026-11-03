-- Cartão Caetano Go: objetivo mensal por vendedor (2 cartões/mês) e o seu registo.
--
-- * Cada linha é UM cartão feito por um vendedor, numa data. O objetivo é mensal, por
--   isso conta-se por mês civil (não há um "feito" único que silencie o aviso para sempre).
-- * Só os administradores registam e apagam (não há update: corrige-se apagando e
--   registando de novo). O vendedor só LÊ os seus — não consegue dar-se o cartão como
--   feito, nem pela interface nem pela consola.
-- * Quem regista vem do token (trigger), não do browser. O vendedor tem de existir em
--   app_users; não se regista no futuro.
-- A interface (aviso ao 'Vendedor VN' enquanto o mês não tem 2) lê esta tabela.
-- Idempotente.

create table if not exists public.cartao_go_registos (
  id             uuid primary key default gen_random_uuid(),
  vendedor_email text not null check (vendedor_email = lower(vendedor_email) and vendedor_email <> ''),
  data           date not null default current_date,
  registado_por  text not null default '' check (registado_por <> ''),   -- preenchido pelo trigger
  created_at     timestamptz not null default now()
);

create index if not exists cartao_go_registos_vendedor_idx
  on public.cartao_go_registos (vendedor_email, data desc);

create or replace function public.cartao_go_registos_before()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Antes de tudo: o trigger corre antes da RLS, e as mensagens abaixo não devem
  -- revelar a quem não é administrador quem existe na plataforma.
  if not (select public.is_app_admin()) then
    raise exception 'Só os administradores registam cartões.' using errcode = '42501';
  end if;
  new.vendedor_email := lower(btrim(coalesce(new.vendedor_email, '')));
  new.registado_por  := lower(coalesce(auth.jwt() ->> 'email', ''));
  new.created_at     := now();
  if new.data > current_date then
    raise exception 'A data do cartão não pode estar no futuro.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.app_users u where lower(u.email) = new.vendedor_email) then
    raise exception 'O vendedor % não existe na plataforma.', new.vendedor_email using errcode = '23503';
  end if;
  return new;
end;
$$;

drop trigger if exists cartao_go_registos_before on public.cartao_go_registos;
create trigger cartao_go_registos_before before insert on public.cartao_go_registos
  for each row execute function public.cartao_go_registos_before();

revoke all on function public.cartao_go_registos_before() from public, anon, authenticated;

alter table public.cartao_go_registos enable row level security;

drop policy if exists cartao_go_select on public.cartao_go_registos;
drop policy if exists cartao_go_insert on public.cartao_go_registos;
drop policy if exists cartao_go_delete on public.cartao_go_registos;

create policy cartao_go_select on public.cartao_go_registos for select to authenticated
  using (vendedor_email = lower((select auth.jwt() ->> 'email'))
         or (select public.is_app_admin()));
create policy cartao_go_insert on public.cartao_go_registos for insert to authenticated
  with check ((select public.is_app_admin()));
create policy cartao_go_delete on public.cartao_go_registos for delete to authenticated
  using ((select public.is_app_admin()));

revoke all on public.cartao_go_registos from anon;
revoke update on public.cartao_go_registos from authenticated;
grant select, insert, delete on public.cartao_go_registos to authenticated;
