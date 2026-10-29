-- Logs da administração: quem entrou na plataforma e o que usa.
--
-- * `atividade`: uma linha por página aberta ('pagina') e uma por sessão do browser
--   ('sessao'). Quem escreve é o próprio utilizador autenticado; o email e a hora vêm
--   do token e do servidor, não do browser (não se regista em nome de outro).
--   Só os administradores leem (e limpam). Sem update.
-- * `admin_atividade_resumo(dias)`: uma linha por utilizador, com o último login
--   (auth.users.last_sign_in_at), a última atividade e os totais da janela. O último
--   login só muda quando se volta a iniciar sessão; quem mantém a sessão aberta durante
--   dias não o atualiza — por isso mostra-se também a última atividade.
-- Idempotente.

create table if not exists public.atividade (
  id         bigint generated always as identity primary key,
  email      text not null default '' check (email <> ''),   -- preenchido pelo trigger
  tipo       text not null check (tipo in ('sessao', 'pagina')),
  pagina     text,                                           -- rota, ex.: /funil
  created_at timestamptz not null default now()
);

create index if not exists atividade_email_idx on public.atividade (email, created_at desc);
create index if not exists atividade_data_idx  on public.atividade (created_at desc);

create or replace function public.atividade_before()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.email      := lower(coalesce(auth.jwt() ->> 'email', ''));
  new.pagina     := left(nullif(btrim(coalesce(new.pagina, '')), ''), 200);
  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists atividade_before on public.atividade;
create trigger atividade_before before insert on public.atividade
  for each row execute function public.atividade_before();

revoke all on function public.atividade_before() from public, anon, authenticated;

alter table public.atividade enable row level security;

drop policy if exists atividade_select on public.atividade;
drop policy if exists atividade_insert on public.atividade;
drop policy if exists atividade_delete on public.atividade;

create policy atividade_select on public.atividade for select to authenticated
  using ((select public.is_app_admin()));
create policy atividade_insert on public.atividade for insert to authenticated
  with check ((select public.is_platform_user()));
create policy atividade_delete on public.atividade for delete to authenticated
  using ((select public.is_app_admin()));

revoke all on public.atividade from anon;
revoke update on public.atividade from authenticated;
grant select, insert, delete on public.atividade to authenticated;

-- ── Resumo por utilizador (só administradores) ──────────────────────────────────
create or replace function public.admin_atividade_resumo(p_dias integer default 30)
returns table (
  email            text,
  nome             text,
  perfil           text,
  ultimo_login     timestamptz,
  ultima_atividade timestamptz,
  sessoes          bigint,
  paginas          bigint,
  pagina_top       text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select public.is_app_admin()) then
    return;
  end if;

  return query
  select
    lower(u.email)::text,
    u.nome,
    u.perfil,
    (select max(a.last_sign_in_at) from auth.users a where lower(a.email) = lower(u.email)),
    (select max(x.created_at) from public.atividade x where x.email = lower(u.email)),
    (select count(*) from public.atividade x
      where x.email = lower(u.email) and x.tipo = 'sessao'
        and x.created_at >= now() - make_interval(days => greatest(p_dias, 1))),
    (select count(*) from public.atividade x
      where x.email = lower(u.email) and x.tipo = 'pagina'
        and x.created_at >= now() - make_interval(days => greatest(p_dias, 1))),
    (select x.pagina from public.atividade x
      where x.email = lower(u.email) and x.tipo = 'pagina' and x.pagina is not null
        and x.created_at >= now() - make_interval(days => greatest(p_dias, 1))
      group by x.pagina order by count(*) desc, x.pagina limit 1)
  from public.app_users u
  where u.email is not null
  order by 5 desc nulls last, 4 desc nulls last, 2;
end;
$$;

revoke all on function public.admin_atividade_resumo(integer) from public, anon;
grant execute on function public.admin_atividade_resumo(integer) to authenticated;
