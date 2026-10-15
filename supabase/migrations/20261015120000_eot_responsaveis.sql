-- End-of-Term: responsáveis geríveis, tabela de conversão de nomes do Excel e o
-- perfil de chefe de equipa local.
--
--  * eot_owners: quem pode ser responsável de follow-up (utilizador com login),
--    com iniciais e o(s) local(is) onde trabalha. Substitui a lista fixa no código
--    (EOT_OWNERS), cujos 8 elementos são migrados para aqui.
--  * eot_vendedor_map: nome em bruto do VENDEDOR do Excel (normalizado) → responsável.
--    Serve de SUGESTÃO ao atribuir; a atribuição continua manual. Um nome pode
--    apontar para mais de um responsável (homónimos, ou o mesmo nome em locais diferentes).
--  * eot_contracts.local: o local do contrato, calculado na base de dados com a mesma
--    regra de contractLocal() (src/lib/eot.ts), para a RLS o poder usar.
--  * permissão 'end-of-term:local' (chefe de equipa local): vê e atribui os contratos
--    do(s) seu(s) local(is) e gere os responsáveis desses locais. Os locais de um chefe
--    são os da sua linha em eot_owners.
--
-- Quem gere tudo continua a ser o administrador e quem tem 'end-of-term:todos'.

-- ── 1. Local do contrato ───────────────────────────────────────────────────────
-- Espelha contractLocal(): parte do "concessionário responsável" (ou do
-- concessionário) sem a marca nem o sufixo numérico — "Baviera Aveiro 2" → "Aveiro".
create or replace function public.eot_local_of(p_resp text, p_conc text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when raw = '' then '—' else coalesce(nullif(s, ''), raw) end
  from (
    select raw,
      btrim(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(raw, '^(Caetano Baviera|Baviera|Caetano)\s*[–-]?\s*', '', 'i'),
              '\s+\d+$', ''),
            '\s+-\s+.*$', ''),
          '^V\.\s*N\.\s*Gaia$', 'Gaia', 'i')
      ) as s
    from (select btrim(coalesce(nullif(p_resp, ''), p_conc, '')) as raw) r
  ) x;
$$;

alter table public.eot_contracts add column if not exists local text;

create or replace function public.eot_contracts_set_local()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.local := public.eot_local_of(new.concessionario_resp, new.concessionario);
  return new;
end $$;

drop trigger if exists eot_contracts_local on public.eot_contracts;
create trigger eot_contracts_local
  before insert or update of concessionario, concessionario_resp on public.eot_contracts
  for each row execute function public.eot_contracts_set_local();

update public.eot_contracts
   set local = public.eot_local_of(concessionario_resp, concessionario)
 where local is distinct from public.eot_local_of(concessionario_resp, concessionario);

create index if not exists eot_contracts_local_idx on public.eot_contracts (local);

-- ── 2. Tabelas ─────────────────────────────────────────────────────────────────
create table if not exists public.eot_owners (
  email      text primary key,
  iniciais   text not null,
  locais     text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint eot_owners_email_lower check (email = lower(email)),
  constraint eot_owners_iniciais_check check (btrim(iniciais) <> '')
);

create table if not exists public.eot_vendedor_map (
  raw_norm      text not null,                       -- nome do Excel normalizado (ver normVendedor)
  owner_email   text not null references public.eot_owners (email) on delete cascade on update cascade,
  raw_exemplo   text,                                -- como aparece no Excel (para leitura)
  created_at    timestamptz not null default now(),
  primary key (raw_norm, owner_email),
  constraint eot_vendedor_map_raw_check check (btrim(raw_norm) <> '')
);
create index if not exists eot_vendedor_map_owner_idx on public.eot_vendedor_map (owner_email);

-- Migração dos 8 responsáveis que estavam no código (só os que já têm conta).
-- Os locais não estavam registados; assumem Aveiro (a instalação é a equipa de
-- Aveiro) e corrigem-se na interface.
insert into public.eot_owners (email, iniciais, locais)
select v.email, v.iniciais, array['Aveiro']
  from (values
    ('belmiro.resgate@caetano.pt', 'BR'), ('fernando.sousa@caetano.pt', 'FS'),
    ('nuno.conde@caetano.pt', 'NC'),      ('paulo.j.matos@caetano.pt', 'PM'),
    ('francisco.dias@caetano.pt', 'FD'),  ('antonio.lourenco@caetano.pt', 'AL'),
    ('marcos.pinto@caetano.pt', 'MP'),    ('rui.duarte@caetano.pt', 'RD')
  ) as v(email, iniciais)
 where exists (select 1 from public.app_users u where lower(u.email) = v.email)
on conflict (email) do nothing;

-- ── 3. Locais do utilizador atual ──────────────────────────────────────────────
create or replace function public.eot_my_locais()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select o.locais from public.eot_owners o where o.email = lower(auth.jwt() ->> 'email')),
    '{}'::text[]);
$$;

revoke all on function public.eot_my_locais() from public, anon;
grant execute on function public.eot_my_locais() to authenticated;

-- ── 4. RLS ─────────────────────────────────────────────────────────────────────
do $$
declare
  me  constant text := 'lower((select auth.jwt() ->> ''email''))';
  t   constant text := '(select public.has_access(''end-of-term''))';
  e   constant text := '(select public.has_access(''end-of-term'', ''edit''))';
  tod constant text := '(select public.has_access(''end-of-term:todos''))';
  lid constant text := '(select public.has_access(''end-of-term:local'', ''edit''))';
  mys constant text := '(select public.eot_my_locais())';
  imp constant text := '(select public.has_access(''dados'', ''edit''))';
  -- chefe de equipa local: contratos do seu local
  lead_c constant text := '(' || lid || ' and array[local] <@ ' || mys || ')';
  can_read  text := '((' || t || ' and (' || tod || ' or ' || lead_c || ' or lower(owner_email) = ' || me || ')) or ' || imp || ')';
  can_write text := '((' || e || ' and (' || tod || ' or ' || lead_c || ' or lower(owner_email) = ' || me || ')) or ' || imp || ')';
  tbl text;
  op text;
begin
  -- contratos (as atividades herdam por of_contract e não mudam)
  foreach op in array array['select', 'insert', 'update', 'delete'] loop
    execute format('drop policy if exists %I on public.eot_contracts', 'eot_contracts_' || op);
  end loop;
  execute format('create policy eot_contracts_select on public.eot_contracts for select to authenticated using (%s)', can_read);
  execute format('create policy eot_contracts_insert on public.eot_contracts for insert to authenticated with check (%s)', can_write);
  execute format('create policy eot_contracts_update on public.eot_contracts for update to authenticated using (%s) with check (%s)', can_write, can_write);
  execute format('create policy eot_contracts_delete on public.eot_contracts for delete to authenticated using (%s)', can_write);

  -- responsáveis e mapeamentos: lê quem tem acesso ao tab; escreve a gestão e o chefe
  -- de equipa local (só para responsáveis dos seus locais).
  alter table public.eot_owners enable row level security;
  alter table public.eot_vendedor_map enable row level security;
  foreach tbl in array array['eot_owners', 'eot_vendedor_map'] loop
    foreach op in array array['select', 'insert', 'update', 'delete'] loop
      execute format('drop policy if exists %I on public.%I', tbl || '_' || op, tbl);
    end loop;
    execute format('create policy %I on public.%I for select to authenticated using (%s)', tbl || '_select', tbl, t);
  end loop;

  -- eot_owners: o chefe só mexe em linhas cujos locais estão todos nos seus
  execute format($f$create policy eot_owners_insert on public.eot_owners for insert to authenticated
    with check (%1$s and (%2$s or (%3$s and cardinality(locais) > 0 and locais <@ %4$s)))$f$, e, tod, lid, mys);
  execute format($f$create policy eot_owners_update on public.eot_owners for update to authenticated
    using (%1$s and (%2$s or (%3$s and locais && %4$s)))
    with check (%1$s and (%2$s or (%3$s and cardinality(locais) > 0 and locais <@ %4$s)))$f$, e, tod, lid, mys);
  execute format($f$create policy eot_owners_delete on public.eot_owners for delete to authenticated
    using (%1$s and (%2$s or (%3$s and locais <@ %4$s)))$f$, e, tod, lid, mys);

  -- eot_vendedor_map: o chefe só mexe em mapeamentos de responsáveis dos seus locais
  execute format($f$create policy eot_vendedor_map_insert on public.eot_vendedor_map for insert to authenticated
    with check (%1$s and (%2$s or (%3$s and exists (
      select 1 from public.eot_owners o where o.email = owner_email and o.locais && %4$s))))$f$, e, tod, lid, mys);
  execute format($f$create policy eot_vendedor_map_update on public.eot_vendedor_map for update to authenticated
    using (%1$s and (%2$s or (%3$s and exists (
      select 1 from public.eot_owners o where o.email = owner_email and o.locais && %4$s))))
    with check (%1$s and (%2$s or (%3$s and exists (
      select 1 from public.eot_owners o where o.email = owner_email and o.locais && %4$s))))$f$, e, tod, lid, mys);
  execute format($f$create policy eot_vendedor_map_delete on public.eot_vendedor_map for delete to authenticated
    using (%1$s and (%2$s or (%3$s and exists (
      select 1 from public.eot_owners o where o.email = owner_email and o.locais && %4$s))))$f$, e, tod, lid, mys);
end $$;

revoke all on public.eot_owners, public.eot_vendedor_map from anon;
grant select, insert, update, delete on public.eot_owners, public.eot_vendedor_map to authenticated;

-- ── 5. Marcador para a interface ────────────────────────────────────────────────
create or replace function public.app_capabilities()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select '{"lavagem_granular": true, "eot_granular": true, "eot_responsaveis": true}'::jsonb;
$$;

revoke all on function public.app_capabilities() from public, anon;
grant execute on function public.app_capabilities() to authenticated;
