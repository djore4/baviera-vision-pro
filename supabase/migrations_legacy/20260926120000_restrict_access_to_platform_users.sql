-- Restringe o acesso aos dados da plataforma aos seus utilizadores.
--
-- Até aqui as políticas RLS eram `using (true)` para qualquer sessão
-- autenticada. Como a autenticação é partilhada com outras aplicações (e
-- qualquer conta criada no projeto fica "authenticated"), isso permitia a
-- contas sem perfil na plataforma ler e escrever todos os dados pela API,
-- contornando o bloqueio que só existia no frontend. O bucket `excel-files`
-- aceitava ainda uploads/updates anónimos.
--
-- Utilizador da plataforma = email presente em app_users (gerido no tab
-- Utilizadores) ou em platform_admins (administradores sem perfil).

-- ── Administradores da plataforma ───────────────────────────────────────────
create table if not exists public.platform_admins (
  email text primary key check (email = lower(email)),
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;
-- Sem políticas: só o service role (e as funções security definer) lê/escreve.

insert into public.platform_admins (email)
values ('joaocarlos.duarte@caetano.pt')
on conflict do nothing;

-- ── Helper usado por todas as políticas ─────────────────────────────────────
create or replace function public.is_platform_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    exists (
      select 1 from public.app_users a
      where lower(a.email) = lower(auth.jwt() ->> 'email')
    ) or exists (
      select 1 from public.platform_admins p
      where p.email = lower(auth.jwt() ->> 'email')
    ),
    false
  );
$$;

revoke all on function public.is_platform_user() from public, anon;
grant execute on function public.is_platform_user() to authenticated;

-- ── Tabelas da plataforma: substituir todas as políticas ────────────────────
-- Tabelas de outras aplicações que partilham o projeto (cs_*, exit_targets,
-- …) não são tocadas.
do $$
declare
  t text;
  p record;
  rw_tables text[] := array[
    'angariacoes_vu', 'car_wash_cycles', 'car_wash_events',
    'control_records', 'control_records_vu', 'crm_notes', 'crm_reminders',
    'demo_afetacoes', 'demo_capas', 'demo_emprestimos', 'demo_pessoas', 'demos',
    'eot_activities', 'eot_contracts', 'historico', 'infractions',
    'notification_reads', 'notifications', 'objetivos_orcamento',
    'objetivos_resp', 'penalties', 'penalty_cycles', 'prospec_accounts',
    'prospec_contacts', 'prospec_interactions', 'prospec_tasks',
    'quality_scores', 'retomas', 'utilizadores', 'viaturas', 'vu_objetivos'
  ];
  ro_tables text[] := array['app_users', 'app_roles'];
begin
  foreach t in array rw_tables || ro_tables loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    for p in select policyname from pg_policies
             where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
    execute format('alter table public.%I enable row level security', t);
    if t = any(ro_tables) then
      -- Escritas só pela edge function admin-users (service role).
      execute format(
        'create policy platform_users_read on public.%I for select to authenticated using (public.is_platform_user())', t);
    else
      execute format(
        'create policy platform_users on public.%I for all to authenticated using (public.is_platform_user()) with check (public.is_platform_user())', t);
    end if;
  end loop;
end $$;

-- ── Storage ─────────────────────────────────────────────────────────────────
-- excel-files: privado, só utilizadores da plataforma.
update storage.buckets set public = false where id = 'excel-files';

drop policy if exists "Allow public upload" on storage.objects;
drop policy if exists "Allow public read" on storage.objects;
drop policy if exists "Allow public update" on storage.objects;
drop policy if exists "Allow public delete" on storage.objects;
drop policy if exists "Allow all f67v8h_0" on storage.objects;
drop policy if exists "Allow all f67v8h_1" on storage.objects;
drop policy if exists "Allow all f67v8h_2" on storage.objects;
drop policy if exists "Allow all f67v8h_3" on storage.objects;

create policy excel_files_select on storage.objects
  for select to authenticated
  using (bucket_id = 'excel-files' and public.is_platform_user());
create policy excel_files_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'excel-files' and public.is_platform_user());
create policy excel_files_update on storage.objects
  for update to authenticated
  using (bucket_id = 'excel-files' and public.is_platform_user())
  with check (bucket_id = 'excel-files' and public.is_platform_user());
create policy excel_files_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'excel-files' and public.is_platform_user());

-- demo-capas: as imagens continuam públicas (getPublicUrl), mas só
-- utilizadores da plataforma podem carregar, alterar ou apagar.
drop policy if exists "demo_capas_obj_insert" on storage.objects;
drop policy if exists "demo_capas_obj_update" on storage.objects;
drop policy if exists "demo_capas_obj_delete" on storage.objects;

create policy demo_capas_obj_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'demo-capas' and public.is_platform_user());
create policy demo_capas_obj_update on storage.objects
  for update to authenticated
  using (bucket_id = 'demo-capas' and public.is_platform_user())
  with check (bucket_id = 'demo-capas' and public.is_platform_user());
create policy demo_capas_obj_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'demo-capas' and public.is_platform_user());
