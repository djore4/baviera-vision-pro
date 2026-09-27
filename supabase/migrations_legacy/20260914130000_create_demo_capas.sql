-- Capas (foto de thumbnail) para o parque de demonstradores (VN · Demos).
-- Tabela própria desta plataforma; não toca no schema partilhado `viaturas`.
create table if not exists public.demo_capas (
  chassis text primary key,
  url text not null,
  updated_by text,
  updated_at timestamptz not null default now()
);

alter table public.demo_capas enable row level security;

drop policy if exists "demo_capas_read" on public.demo_capas;
create policy "demo_capas_read" on public.demo_capas
  for select to authenticated using (true);

drop policy if exists "demo_capas_write" on public.demo_capas;
create policy "demo_capas_write" on public.demo_capas
  for all to authenticated using (true) with check (true);

-- Bucket público para as capas.
insert into storage.buckets (id, name, public)
values ('demo-capas', 'demo-capas', true)
on conflict (id) do update set public = true;

-- Storage: leitura pública, escrita por utilizadores autenticados.
drop policy if exists "demo_capas_obj_read" on storage.objects;
create policy "demo_capas_obj_read" on storage.objects
  for select using (bucket_id = 'demo-capas');

drop policy if exists "demo_capas_obj_insert" on storage.objects;
create policy "demo_capas_obj_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'demo-capas');

drop policy if exists "demo_capas_obj_update" on storage.objects;
create policy "demo_capas_obj_update" on storage.objects
  for update to authenticated using (bucket_id = 'demo-capas') with check (bucket_id = 'demo-capas');

drop policy if exists "demo_capas_obj_delete" on storage.objects;
create policy "demo_capas_obj_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'demo-capas');
