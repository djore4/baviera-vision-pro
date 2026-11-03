-- Instalações: anexos das ocorrências (fotografias, orçamentos, PDFs…).
--
-- Os ficheiros vivem num bucket privado ('instalacoes-anexos', chave
-- '<ocorrencia_id>/<uuid>-<nome>'); a tabela guarda só os metadados. Mesmo acesso
-- das ocorrências: 'view' no tab 'instalacoes' lê, 'edit' acrescenta e remove.
-- Os ficheiros abrem-se por URL assinado (curta duração), nunca por URL público.

-- ── 1. Metadados ───────────────────────────────────────────────────────────────
create table if not exists public.instalacoes_anexos (
  id            uuid primary key default gen_random_uuid(),
  ocorrencia_id uuid not null references public.instalacoes_ocorrencias (id) on delete cascade,
  path          text not null unique check (btrim(path) <> ''),   -- chave no bucket
  nome          text not null check (btrim(nome) <> ''),          -- nome original
  tipo          text,                                             -- MIME
  tamanho       bigint check (tamanho is null or tamanho >= 0),   -- bytes
  criado_por    text,
  created_at    timestamptz not null default now()
);

create index if not exists instalacoes_anexos_ocorrencia_idx
  on public.instalacoes_anexos (ocorrencia_id, created_at);

-- Quem anexou vem do token, não do browser.
create or replace function public.instalacoes_anexos_before()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.criado_por := lower(auth.jwt() ->> 'email');
  return new;
end $$;

drop trigger if exists instalacoes_anexos_before on public.instalacoes_anexos;
create trigger instalacoes_anexos_before
  before insert on public.instalacoes_anexos
  for each row execute function public.instalacoes_anexos_before();

revoke all on function public.instalacoes_anexos_before() from public, anon, authenticated;

-- ── 2. RLS (tabela) ────────────────────────────────────────────────────────────
alter table public.instalacoes_anexos enable row level security;

drop policy if exists instalacoes_anexos_select on public.instalacoes_anexos;
drop policy if exists instalacoes_anexos_insert on public.instalacoes_anexos;
drop policy if exists instalacoes_anexos_delete on public.instalacoes_anexos;

create policy instalacoes_anexos_select on public.instalacoes_anexos
  for select to authenticated using ((select public.has_access('instalacoes')));
create policy instalacoes_anexos_insert on public.instalacoes_anexos
  for insert to authenticated with check ((select public.has_access('instalacoes', 'edit')));
create policy instalacoes_anexos_delete on public.instalacoes_anexos
  for delete to authenticated using ((select public.has_access('instalacoes', 'edit')));

revoke all on public.instalacoes_anexos from anon;
revoke all on public.instalacoes_anexos from authenticated;
grant select, insert, delete on public.instalacoes_anexos to authenticated;

-- ── 3. Storage ─────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('instalacoes-anexos', 'instalacoes-anexos', false)
on conflict (id) do update set public = false;

drop policy if exists instalacoes_anexos_obj_select on storage.objects;
drop policy if exists instalacoes_anexos_obj_insert on storage.objects;
drop policy if exists instalacoes_anexos_obj_delete on storage.objects;

create policy instalacoes_anexos_obj_select on storage.objects
  for select to authenticated
  using (bucket_id = 'instalacoes-anexos' and (select public.has_access('instalacoes')));
create policy instalacoes_anexos_obj_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'instalacoes-anexos' and (select public.has_access('instalacoes', 'edit')));
create policy instalacoes_anexos_obj_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'instalacoes-anexos' and (select public.has_access('instalacoes', 'edit')));
