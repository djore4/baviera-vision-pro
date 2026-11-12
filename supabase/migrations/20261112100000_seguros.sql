-- Seguros (área Transversal): controlo dos seguros das viaturas a serviço de alguém ou de um cliente.
--
-- Qualquer área (BMW VN, BMW VU, BMW Motorrad, Após-venda) tem viaturas a circular em nome de um
-- colaborador ou de um cliente. Cada linha é UM período de seguro de UMA matrícula: quem pediu,
-- quando, de que data a que data, se é só contra terceiros ou também danos próprios (e, nesse caso,
-- o capital seguro), a que área pertence e quanto custa (prémio) — a base do controlo de custos.
--
-- Objetivos de controlo (feitos na interface sobre estes dados):
--   * nenhuma viatura a circular sem seguro  → seguros cujo fim já passou e continuam por arquivar;
--   * nenhum seguro ativo de viatura vendida → cruzamento por matrícula com viaturas_vendidas.
--
-- Estados "ativo / a expirar / expirado" NÃO se guardam: derivam das datas e de `arquivado`.
-- "Arquivado" é o que o utilizador decide (terminou, viatura vendida, cancelado, substituído).
--
-- Acesso: tab 'seguros' da matriz de funções. 'view' lê; 'edit' regista, altera e arquiva.
-- Apagar é só do administrador (um seguro registado não desaparece por engano: arquiva-se).

-- ── 1. Seguros ─────────────────────────────────────────────────────────────────
create table if not exists public.seguros (
  id             uuid primary key default gen_random_uuid(),
  matricula      text not null check (btrim(matricula) <> ''),
  -- Matrícula sem hífens/espaços e em maiúsculas: é com ela que se cruza com o parque e com as vendidas.
  matricula_norm text generated always as (upper(regexp_replace(matricula, '[^A-Za-z0-9]', '', 'g'))) stored,
  chassis        text,
  viatura        text not null check (btrim(viatura) <> ''),   -- "BMW iX1 xDrive30" (livre)
  area           text not null check (area in ('bmw_vn', 'bmw_vu', 'motorrad', 'apv')),
  solicitante    text not null check (btrim(solicitante) <> ''), -- quem pede o seguro
  cliente        text,                                           -- a serviço de (cliente), se aplicável
  data_pedido    date not null default current_date,
  inicio         date not null,
  fim            date not null,
  cobertura      text not null check (cobertura in ('terceiros', 'danos_proprios')),
  capital_seguro numeric(12, 2),                                 -- valor seguro (danos próprios)
  premio         numeric(12, 2) check (premio is null or premio >= 0),
  seguradora     text,
  apolice        text,
  obs            text,
  arquivado      boolean not null default false,
  arquivado_em   date,
  motivo_arquivo text check (motivo_arquivo is null
                             or motivo_arquivo in ('terminado', 'viatura_vendida', 'cancelado', 'substituido')),
  criado_por     text,                                           -- email de quem registou
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (fim >= inicio),
  -- Danos próprios exigem o valor seguro; contra terceiros não tem capital.
  check ((cobertura = 'danos_proprios' and capital_seguro is not null and capital_seguro > 0)
         or (cobertura = 'terceiros' and capital_seguro is null))
);

create index if not exists seguros_matricula_norm_idx on public.seguros (matricula_norm);
create index if not exists seguros_ativos_fim_idx     on public.seguros (fim) where not arquivado;

-- ── 2. Trigger ─────────────────────────────────────────────────────────────────
-- Quem registou vem do token (não se escolhe); carimbo de atualização; a data e o motivo de
-- arquivo só existem enquanto o seguro está arquivado.
create or replace function public.seguros_before()
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
  new.updated_at := now();
  new.matricula := upper(btrim(new.matricula));
  if new.arquivado then
    new.arquivado_em := coalesce(new.arquivado_em, current_date);
    new.motivo_arquivo := coalesce(new.motivo_arquivo, 'terminado');
  else
    new.arquivado_em := null;
    new.motivo_arquivo := null;
  end if;
  return new;
end $$;

drop trigger if exists seguros_before on public.seguros;
create trigger seguros_before
  before insert or update on public.seguros
  for each row execute function public.seguros_before();

revoke all on function public.seguros_before() from public, anon, authenticated;

-- ── 3. RLS ─────────────────────────────────────────────────────────────────────
alter table public.seguros enable row level security;

drop policy if exists seguros_select on public.seguros;
drop policy if exists seguros_insert on public.seguros;
drop policy if exists seguros_update on public.seguros;
drop policy if exists seguros_delete on public.seguros;

create policy seguros_select on public.seguros
  for select to authenticated using ((select public.has_access('seguros')));
create policy seguros_insert on public.seguros
  for insert to authenticated with check ((select public.has_access('seguros', 'edit')));
create policy seguros_update on public.seguros
  for update to authenticated
  using ((select public.has_access('seguros', 'edit')))
  with check ((select public.has_access('seguros', 'edit')));
create policy seguros_delete on public.seguros
  for delete to authenticated using ((select public.is_app_admin()));

revoke all on public.seguros from anon;
grant select, insert, update, delete on public.seguros to authenticated;

-- ── 4. Cruzamento com o parque e com as vendidas ───────────────────────────────
-- A leitura direta de `viaturas` é só do administrador (esconde custos e margens em `inputs`/`stats`),
-- por isso, como no Marketing, estas funções devolvem só campos de identificação a quem tem o tab.

-- Parque: para escolher a viatura ao registar e para assinalar viaturas sem seguro.
create or replace function public.seguros_parque()
returns table (chassis text, matricula text, modelo text, versao text, marca text)
language sql
stable
security definer
set search_path = ''
as $$
  select v.chassis, v.matricula, v.modelo, v.versao, v.marca
  from public.viaturas v
  where (select public.has_access('seguros'))
  order by v.modelo, v.matricula;
$$;

-- Vendidas (arquivo do Demos): matrículas que já não são nossas.
create or replace function public.seguros_vendidas()
returns table (chassis text, matricula text, modelo text, data_venda timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select v.chassis, v.matricula, v.modelo, v.data_venda
  from public.viaturas_vendidas v
  where (select public.has_access('seguros'))
    and v.matricula is not null and btrim(v.matricula) <> '';
$$;

revoke all on function public.seguros_parque()   from public, anon;
revoke all on function public.seguros_vendidas() from public, anon;
grant execute on function public.seguros_parque()   to authenticated;
grant execute on function public.seguros_vendidas() to authenticated;
