-- Marketing: acesso pela matriz de funções (tab 'marketing'), em vez de só admin.
--
--   view  → lê eventos, categorias, viaturas e documentos; vê e gere SÓ os seus
--           convidados (vendedor_email = o seu email).
--   edit  → gere tudo, vê todos os convidados e o orçamento.
--   admin → como edit (has_access devolve 'edit' a administradores).
--
-- O orçamento passa para uma tabela própria para a base de dados o poder esconder
-- de quem só tem 'view' (uma coluna da mesma linha não se esconde com RLS).

-- ── 1. Orçamento em tabela própria ─────────────────────────────────────────────
create table if not exists public.marketing_orcamentos (
  evento_id  uuid primary key references public.marketing_eventos (id) on delete cascade,
  previsto   numeric(12, 2) check (previsto is null or previsto >= 0),
  real       numeric(12, 2) check (real is null or real >= 0),
  updated_at timestamptz not null default now()
);

-- Copia o que existir nas colunas antigas antes de as apagar.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'marketing_eventos' and column_name = 'orcamento_previsto') then
    insert into public.marketing_orcamentos (evento_id, previsto, real)
    select id, orcamento_previsto, orcamento_real
    from public.marketing_eventos
    where orcamento_previsto is not null or orcamento_real is not null
    on conflict (evento_id) do nothing;
  end if;
end $$;

alter table public.marketing_eventos drop column if exists orcamento_previsto;
alter table public.marketing_eventos drop column if exists orcamento_real;

create or replace function public.marketing_orcamentos_before()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists marketing_orcamentos_before on public.marketing_orcamentos;
create trigger marketing_orcamentos_before before insert or update on public.marketing_orcamentos
  for each row execute function public.marketing_orcamentos_before();
revoke all on function public.marketing_orcamentos_before() from public, anon, authenticated;

-- ── 2. RLS por nível no tab 'marketing' ────────────────────────────────────────
alter table public.marketing_orcamentos enable row level security;

do $$
declare t text;
begin
  -- Fora as policies "só admin" da primeira versão.
  foreach t in array array['marketing_categorias', 'marketing_eventos', 'marketing_viaturas',
                           'marketing_anexos', 'marketing_convidados'] loop
    execute format('drop policy if exists %I on public.%I', t || '_admin', t);
  end loop;

  -- Leitura: view. Escrita: edit.
  foreach t in array array['marketing_categorias', 'marketing_eventos', 'marketing_viaturas', 'marketing_anexos'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select public.has_access(''marketing'')))',
                   t || '_select', t);
    execute format('create policy %I on public.%I for all to authenticated '
                   'using ((select public.has_access(''marketing'', ''edit''))) '
                   'with check ((select public.has_access(''marketing'', ''edit'')))',
                   t || '_write', t);
  end loop;
end $$;

-- Orçamento: só quem edita (e administradores).
drop policy if exists marketing_orcamentos_edit on public.marketing_orcamentos;
create policy marketing_orcamentos_edit on public.marketing_orcamentos
  for all to authenticated
  using ((select public.has_access('marketing', 'edit')))
  with check ((select public.has_access('marketing', 'edit')));

-- Convidados: quem edita vê/gere todos; quem só vê, apenas os seus.
drop policy if exists marketing_convidados_acesso on public.marketing_convidados;
create policy marketing_convidados_acesso on public.marketing_convidados
  for all to authenticated
  using (
    (select public.has_access('marketing', 'edit'))
    or ((select public.has_access('marketing')) and vendedor_email = lower(auth.jwt() ->> 'email'))
  )
  with check (
    (select public.has_access('marketing', 'edit'))
    or ((select public.has_access('marketing')) and vendedor_email = lower(auth.jwt() ->> 'email'))
  );

revoke all on public.marketing_orcamentos from anon;
revoke all on public.marketing_orcamentos from authenticated;
grant select, insert, update, delete on public.marketing_orcamentos to authenticated;

-- ── 3. Storage: ver abre ficheiros; editar carrega e apaga ─────────────────────
drop policy if exists marketing_obj_select on storage.objects;
drop policy if exists marketing_obj_insert on storage.objects;
drop policy if exists marketing_obj_delete on storage.objects;

create policy marketing_obj_select on storage.objects
  for select to authenticated
  using (bucket_id = 'marketing' and (select public.has_access('marketing')));
create policy marketing_obj_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'marketing' and (select public.has_access('marketing', 'edit')));
create policy marketing_obj_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'marketing' and (select public.has_access('marketing', 'edit')));
