-- Cartão Caetano Go (CCGo) como tab: controlo por responsável e por equipa.
--
-- * app_users.equipa: tipificação do colaborador (BMW VN, BMW VU, Motorrad, APV). Nulo = ainda não
--   tipificado; a interface deduz-a de negocio/marca enquanto estiver vazia.
-- * ccgo_objetivos: objetivo mensal por equipa (sem linha = 2).
-- * Registar/apagar cartões e definir objetivos: quem tem 'edit' no tab `ccgo` (administradores
--   incluídos, ver access_rank). Ler: quem tem 'view' no tab vê todos; os restantes só os seus.
-- Idempotente.

alter table public.app_users add column if not exists equipa text;
alter table public.app_users drop constraint if exists app_users_equipa_check;
alter table public.app_users add constraint app_users_equipa_check
  check (equipa is null or equipa in ('BMW VN', 'BMW VU', 'Motorrad', 'APV'));

create table if not exists public.ccgo_objetivos (
  equipa     text primary key check (equipa in ('BMW VN', 'BMW VU', 'Motorrad', 'APV')),
  objetivo   int  not null check (objetivo between 0 and 99),
  updated_at timestamptz not null default now()
);
alter table public.ccgo_objetivos enable row level security;
drop policy if exists ccgo_objetivos_select on public.ccgo_objetivos;
drop policy if exists ccgo_objetivos_write on public.ccgo_objetivos;
-- Qualquer utilizador autenticado lê (o aviso do vendedor precisa do objetivo da sua equipa).
create policy ccgo_objetivos_select on public.ccgo_objetivos for select to authenticated using (true);
create policy ccgo_objetivos_write on public.ccgo_objetivos for all to authenticated
  using ((select public.has_access('ccgo', 'edit'))) with check ((select public.has_access('ccgo', 'edit')));
revoke all on public.ccgo_objetivos from anon;
grant select, insert, update, delete on public.ccgo_objetivos to authenticated;

-- Registos: gestão por permissão do tab em vez de só administradores.
create or replace function public.cartao_go_registos_before()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select public.has_access('ccgo', 'edit')) then
    raise exception 'Sem permissão para registar cartões.' using errcode = '42501';
  end if;
  new.vendedor_email := lower(btrim(coalesce(new.vendedor_email, '')));
  new.registado_por  := lower(coalesce(auth.jwt() ->> 'email', ''));
  new.created_at     := now();
  if new.data > current_date then
    raise exception 'A data do cartão não pode estar no futuro.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.app_users u where lower(u.email) = new.vendedor_email) then
    raise exception 'O colaborador % não existe na plataforma.', new.vendedor_email using errcode = '23503';
  end if;
  return new;
end;
$$;
revoke all on function public.cartao_go_registos_before() from public, anon, authenticated;

drop policy if exists cartao_go_select on public.cartao_go_registos;
drop policy if exists cartao_go_insert on public.cartao_go_registos;
drop policy if exists cartao_go_delete on public.cartao_go_registos;
create policy cartao_go_select on public.cartao_go_registos for select to authenticated
  using (vendedor_email = lower((select auth.jwt() ->> 'email'))
         or (select public.has_access('ccgo', 'view')));
create policy cartao_go_insert on public.cartao_go_registos for insert to authenticated
  with check ((select public.has_access('ccgo', 'edit')));
create policy cartao_go_delete on public.cartao_go_registos for delete to authenticated
  using ((select public.has_access('ccgo', 'edit')));
