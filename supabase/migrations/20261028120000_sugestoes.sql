-- Sugestões e correções da plataforma: qualquer utilizador partilha ideias, pede
-- correções ou reporta problemas; a gestão acompanha e responde.
--
-- Acesso:
--  * qualquer utilizador da plataforma regista uma sugestão e vê as SUAS;
--  * quem tem o tab 'sugestoes' (administradores sempre) vê todas; com 'edit' altera
--    o estado, responde e apaga.
-- O autor vem do token (trigger), não do browser: não se regista em nome de outro.
-- Quem escreve não escolhe o estado nem a resposta: nasce 'nova', sem resposta.
-- Idempotente (create if not exists / drop policy if exists).

create table if not exists public.sugestoes (
  id          uuid primary key default gen_random_uuid(),
  tipo        text not null default 'ideia'
              check (tipo in ('ideia', 'correcao', 'problema')),
  titulo      text not null check (btrim(titulo) <> ''),
  descricao   text,
  pagina      text,                                   -- rota em que estava ao enviar
  estado      text not null default 'nova'
              check (estado in ('nova', 'em_analise', 'planeada', 'feita', 'recusada')),
  resposta    text,                                   -- nota da gestão ao autor
  autor_email text not null default '' check (autor_email <> ''),  -- preenchido pelo trigger
  autor_nome  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists sugestoes_autor_idx  on public.sugestoes (autor_email, created_at desc);
create index if not exists sugestoes_estado_idx on public.sugestoes (estado, created_at desc);

create or replace function public.sugestoes_before()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.autor_email := lower(coalesce(auth.jwt() ->> 'email', ''));
    new.autor_nome  := (select u.nome from public.app_users u where lower(u.email) = new.autor_email limit 1);
    new.titulo      := btrim(new.titulo);
    new.estado      := 'nova';
    new.resposta    := null;
  else
    -- Só o estado e a resposta mudam: o resto é o que o autor escreveu.
    new.autor_email := old.autor_email;
    new.autor_nome  := old.autor_nome;
    new.tipo        := old.tipo;
    new.titulo      := old.titulo;
    new.descricao   := old.descricao;
    new.pagina      := old.pagina;
    new.created_at  := old.created_at;
    new.resposta    := nullif(btrim(coalesce(new.resposta, '')), '');
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists sugestoes_before on public.sugestoes;
create trigger sugestoes_before before insert or update on public.sugestoes
  for each row execute function public.sugestoes_before();

revoke all on function public.sugestoes_before() from public, anon, authenticated;

alter table public.sugestoes enable row level security;

drop policy if exists sugestoes_select on public.sugestoes;
drop policy if exists sugestoes_insert on public.sugestoes;
drop policy if exists sugestoes_update on public.sugestoes;
drop policy if exists sugestoes_delete on public.sugestoes;

create policy sugestoes_select on public.sugestoes for select to authenticated
  using (lower(autor_email) = lower((select auth.jwt() ->> 'email'))
         or (select public.has_access('sugestoes')));
create policy sugestoes_insert on public.sugestoes for insert to authenticated
  with check ((select public.is_platform_user()));
create policy sugestoes_update on public.sugestoes for update to authenticated
  using ((select public.has_access('sugestoes', 'edit')))
  with check ((select public.has_access('sugestoes', 'edit')));
create policy sugestoes_delete on public.sugestoes for delete to authenticated
  using ((select public.has_access('sugestoes', 'edit')));

revoke all on public.sugestoes from anon;
grant select, insert, update, delete on public.sugestoes to authenticated;
