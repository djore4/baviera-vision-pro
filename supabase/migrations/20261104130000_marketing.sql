-- Marketing (área Transversal): eventos, com imagem, anexos, viaturas, convidados e orçamento.
--
-- Acesso "para já": só administradores (is_app_admin()). Quando houver um perfil
-- próprio, abre-se por policies novas (p.ex. has_access('marketing') e, para os
-- vendedores, só os convidados onde vendedor_email = o seu email); o modelo já
-- guarda o vendedor de cada convidado para isso não obrigar a migrar dados.
--
-- Ficheiros (capa e anexos) num bucket privado 'marketing' (máx. 5 MB cada),
-- abertos por URL assinado. A tabela guarda só a chave e os metadados.

-- ── 1. Categorias (editáveis na interface) ─────────────────────────────────────
create table if not exists public.marketing_categorias (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null check (btrim(nome) <> ''),
  cor        text not null default '214 77% 47%' check (cor ~ '^[0-9]{1,3} [0-9]{1,3}% [0-9]{1,3}%$'),  -- HSL sem hsl()
  ordem      integer not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists marketing_categorias_nome_uq on public.marketing_categorias (lower(btrim(nome)));

insert into public.marketing_categorias (nome, cor, ordem)
select v.nome, v.cor, v.ordem
from (values
  ('Lançamento',  '214 77% 47%', 1),
  ('Evento',      '262 60% 55%', 2),
  ('Campanha',    '28 90% 50%',  3),
  ('Comunicação', '160 60% 38%', 4)
) as v(nome, cor, ordem)
where not exists (select 1 from public.marketing_categorias);

-- ── 2. Eventos ─────────────────────────────────────────────────────────────────
create table if not exists public.marketing_eventos (
  id                 uuid primary key default gen_random_uuid(),
  titulo             text not null check (btrim(titulo) <> ''),
  categoria_id       uuid references public.marketing_categorias (id) on delete restrict,
  inicio             date not null,
  fim                date,
  hora               text,                                  -- "18:30" (livre)
  local              text not null default 'Aveiro',
  descricao          text,                                  -- o que vai acontecer
  dress_code         text,
  highlights         text[] not null default '{}',          -- pontos relevantes a ter em conta
  orcamento_previsto numeric(12, 2) check (orcamento_previsto is null or orcamento_previsto >= 0),
  orcamento_real     numeric(12, 2) check (orcamento_real is null or orcamento_real >= 0),
  imagem_path        text,                                  -- capa, chave no bucket
  criado_por         text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (fim is null or fim >= inicio)
);
create index if not exists marketing_eventos_inicio_idx on public.marketing_eventos (inicio);

-- ── 3. Viaturas do evento ──────────────────────────────────────────────────────
-- `chassis` liga ao parque (viaturas) quando existe, mas NÃO é chave estrangeira:
-- uma viatura nova ou de outro local pode ser acrescentada à mão, só com descrição.
create table if not exists public.marketing_viaturas (
  id         uuid primary key default gen_random_uuid(),
  evento_id  uuid not null references public.marketing_eventos (id) on delete cascade,
  chassis    text,
  descricao  text not null check (btrim(descricao) <> ''),  -- "BMW iX1 xDrive30 · 00-AA-00"
  local      text,
  obs        text,
  created_at timestamptz not null default now()
);
create index if not exists marketing_viaturas_evento_idx on public.marketing_viaturas (evento_id);

-- ── 4. Anexos (brochuras, convites, programas…) ───────────────────────────────
create table if not exists public.marketing_anexos (
  id         uuid primary key default gen_random_uuid(),
  evento_id  uuid not null references public.marketing_eventos (id) on delete cascade,
  path       text not null unique check (btrim(path) <> ''),
  nome       text not null check (btrim(nome) <> ''),
  tipo       text,
  tamanho    bigint check (tamanho is null or (tamanho >= 0 and tamanho <= 5242880)),
  criado_por text,
  created_at timestamptz not null default now()
);
create index if not exists marketing_anexos_evento_idx on public.marketing_anexos (evento_id, created_at);

-- ── 5. Convidados e presenças, por vendedor ────────────────────────────────────
create table if not exists public.marketing_convidados (
  id             uuid primary key default gen_random_uuid(),
  evento_id      uuid not null references public.marketing_eventos (id) on delete cascade,
  vendedor_email text not null check (btrim(vendedor_email) <> ''),
  vendedor_nome  text,
  nome           text not null check (btrim(nome) <> ''),
  contacto       text,
  estado         text not null default 'convidado'
                 check (estado in ('convidado', 'confirmado', 'compareceu', 'faltou', 'recusou')),
  obs            text,
  criado_por     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists marketing_convidados_evento_idx on public.marketing_convidados (evento_id, vendedor_email);

-- ── 6. Triggers (carimbos e autoria vêm do servidor) ───────────────────────────
create or replace function public.marketing_before()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.criado_por := lower(auth.jwt() ->> 'email');
  else
    new.criado_por := old.criado_por;
    new.created_at := old.created_at;
  end if;
  if tg_table_name in ('marketing_eventos', 'marketing_convidados') then
    new.updated_at := now();
  end if;
  if tg_table_name = 'marketing_convidados' then
    new.vendedor_email := lower(btrim(new.vendedor_email));
  end if;
  return new;
end $$;

drop trigger if exists marketing_eventos_before    on public.marketing_eventos;
drop trigger if exists marketing_anexos_before     on public.marketing_anexos;
drop trigger if exists marketing_convidados_before on public.marketing_convidados;
create trigger marketing_eventos_before    before insert or update on public.marketing_eventos
  for each row execute function public.marketing_before();
create trigger marketing_anexos_before     before insert on public.marketing_anexos
  for each row execute function public.marketing_before();
create trigger marketing_convidados_before before insert or update on public.marketing_convidados
  for each row execute function public.marketing_before();

revoke all on function public.marketing_before() from public, anon, authenticated;

-- ── 7. RLS: só administradores ─────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['marketing_categorias', 'marketing_eventos', 'marketing_viaturas',
                           'marketing_anexos', 'marketing_convidados'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin', t);
    execute format(
      'create policy %I on public.%I for all to authenticated '
      'using ((select public.is_app_admin())) with check ((select public.is_app_admin()))',
      t || '_admin', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke all on public.%I from authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- ── 8. Storage ─────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit)
values ('marketing', 'marketing', false, 5242880)
on conflict (id) do update set public = false, file_size_limit = 5242880;

drop policy if exists marketing_obj_select on storage.objects;
drop policy if exists marketing_obj_insert on storage.objects;
drop policy if exists marketing_obj_delete on storage.objects;

create policy marketing_obj_select on storage.objects
  for select to authenticated
  using (bucket_id = 'marketing' and (select public.is_app_admin()));
create policy marketing_obj_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'marketing' and (select public.is_app_admin()));
create policy marketing_obj_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'marketing' and (select public.is_app_admin()));
