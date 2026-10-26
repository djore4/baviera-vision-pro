-- Instalações (área Transversal): ocorrências registadas sobre a planta.
--
-- Cada ocorrência fica ancorada a um ponto da planta (piso + x/y como fração 0–1
-- da imagem, para não depender da resolução) e diz o que é preciso fazer, quando
-- aconteceu e a quem foi reportada. As plantas em si são ficheiros da instalação
-- (public/clients/<cliente>/plantas), não dados: o piso é só a sua chave.
--
-- Acesso: tab 'instalacoes' da matriz de funções. 'view' lê; 'edit' regista,
-- altera e apaga. O histórico (criação, mudanças de estado e de interlocutor) é
-- escrito por trigger, não pelo browser: não se contorna e quem só tem 'edit' no
-- tab não o consegue falsificar.

-- ── 1. Ocorrências ─────────────────────────────────────────────────────────────
create table if not exists public.instalacoes_ocorrencias (
  id              uuid primary key default gen_random_uuid(),
  piso            text not null check (btrim(piso) <> ''),
  x               double precision not null check (x between 0 and 1),
  y               double precision not null check (y between 0 and 1),
  zona            text,                                   -- "Oficina", "Receção"… (livre)
  titulo          text not null check (btrim(titulo) <> ''),
  intervencao     text not null check (btrim(intervencao) <> ''),  -- intervenção necessária
  categoria       text not null default 'outro'
                  check (categoria in ('eletricidade', 'canalizacao', 'climatizacao', 'estrutura',
                                       'pintura', 'equipamento', 'seguranca', 'limpeza', 'outro')),
  prioridade      text not null default 'normal'
                  check (prioridade in ('baixa', 'normal', 'alta', 'urgente')),
  estado          text not null default 'aberta'
                  check (estado in ('aberta', 'em_curso', 'resolvida', 'cancelada')),
  data_ocorrencia date not null default current_date,
  interlocutor    text,                                   -- a quem foi reportada
  data_reporte    date,
  obs             text,
  resolvida_em    date,
  criada_por      text,                                   -- email de quem registou
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists instalacoes_ocorrencias_piso_idx   on public.instalacoes_ocorrencias (piso);
create index if not exists instalacoes_ocorrencias_estado_idx on public.instalacoes_ocorrencias (estado);

-- ── 2. Histórico ───────────────────────────────────────────────────────────────
create table if not exists public.instalacoes_historico (
  id            uuid primary key default gen_random_uuid(),
  ocorrencia_id uuid not null references public.instalacoes_ocorrencias (id) on delete cascade,
  tipo          text not null check (tipo in ('criada', 'estado', 'reporte')),
  de            text,
  para          text,
  autor         text,
  created_at    timestamptz not null default now()
);

create index if not exists instalacoes_historico_ocorrencia_idx
  on public.instalacoes_historico (ocorrencia_id, created_at);

-- ── 3. Triggers ────────────────────────────────────────────────────────────────
-- Antes de gravar: carimbo de atualização, data de resolução coerente com o estado
-- e quem registou (não se escolhe: vem do token).
create or replace function public.instalacoes_ocorrencias_before()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.criada_por := lower(auth.jwt() ->> 'email');
  else
    new.criada_por := old.criada_por;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  new.interlocutor := nullif(btrim(coalesce(new.interlocutor, '')), '');
  if new.interlocutor is null then
    new.data_reporte := null;
  elsif new.data_reporte is null then
    new.data_reporte := current_date;
  end if;
  if new.estado = 'resolvida' then
    new.resolvida_em := coalesce(new.resolvida_em, current_date);
  else
    new.resolvida_em := null;
  end if;
  return new;
end $$;

drop trigger if exists instalacoes_ocorrencias_before on public.instalacoes_ocorrencias;
create trigger instalacoes_ocorrencias_before
  before insert or update on public.instalacoes_ocorrencias
  for each row execute function public.instalacoes_ocorrencias_before();

-- Depois de gravar: acrescenta ao histórico (security definer: o utilizador não
-- tem permissão de escrita direta nesta tabela).
create or replace function public.instalacoes_ocorrencias_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor text := lower(auth.jwt() ->> 'email');
begin
  if tg_op = 'INSERT' then
    insert into public.instalacoes_historico (ocorrencia_id, tipo, para, autor)
    values (new.id, 'criada', new.estado, actor);
    if new.interlocutor is not null then
      insert into public.instalacoes_historico (ocorrencia_id, tipo, para, autor)
      values (new.id, 'reporte', new.interlocutor, actor);
    end if;
    return new;
  end if;
  if new.estado is distinct from old.estado then
    insert into public.instalacoes_historico (ocorrencia_id, tipo, de, para, autor)
    values (new.id, 'estado', old.estado, new.estado, actor);
  end if;
  if new.interlocutor is distinct from old.interlocutor then
    insert into public.instalacoes_historico (ocorrencia_id, tipo, de, para, autor)
    values (new.id, 'reporte', old.interlocutor, new.interlocutor, actor);
  end if;
  return new;
end $$;

drop trigger if exists instalacoes_ocorrencias_log on public.instalacoes_ocorrencias;
create trigger instalacoes_ocorrencias_log
  after insert or update on public.instalacoes_ocorrencias
  for each row execute function public.instalacoes_ocorrencias_log();

-- As funções de trigger não se chamam diretamente.
revoke all on function public.instalacoes_ocorrencias_before() from public, anon, authenticated;
revoke all on function public.instalacoes_ocorrencias_log() from public, anon, authenticated;

-- ── 4. RLS ─────────────────────────────────────────────────────────────────────
alter table public.instalacoes_ocorrencias enable row level security;
alter table public.instalacoes_historico   enable row level security;

drop policy if exists instalacoes_ocorrencias_select on public.instalacoes_ocorrencias;
drop policy if exists instalacoes_ocorrencias_insert on public.instalacoes_ocorrencias;
drop policy if exists instalacoes_ocorrencias_update on public.instalacoes_ocorrencias;
drop policy if exists instalacoes_ocorrencias_delete on public.instalacoes_ocorrencias;
drop policy if exists instalacoes_historico_select   on public.instalacoes_historico;

create policy instalacoes_ocorrencias_select on public.instalacoes_ocorrencias
  for select to authenticated using ((select public.has_access('instalacoes')));
create policy instalacoes_ocorrencias_insert on public.instalacoes_ocorrencias
  for insert to authenticated with check ((select public.has_access('instalacoes', 'edit')));
create policy instalacoes_ocorrencias_update on public.instalacoes_ocorrencias
  for update to authenticated
  using ((select public.has_access('instalacoes', 'edit')))
  with check ((select public.has_access('instalacoes', 'edit')));
create policy instalacoes_ocorrencias_delete on public.instalacoes_ocorrencias
  for delete to authenticated using ((select public.has_access('instalacoes', 'edit')));

-- Histórico: só leitura (a escrita é do trigger).
create policy instalacoes_historico_select on public.instalacoes_historico
  for select to authenticated using ((select public.has_access('instalacoes')));

-- O Supabase concede por omissão tudo a anon/authenticated em tabelas novas: a RLS
-- é a barreira principal; aqui tira-se também o privilégio que nunca é preciso.
revoke all on public.instalacoes_ocorrencias from anon;
revoke all on public.instalacoes_historico   from anon, authenticated;
grant select, insert, update, delete on public.instalacoes_ocorrencias to authenticated;
grant select on public.instalacoes_historico to authenticated;
