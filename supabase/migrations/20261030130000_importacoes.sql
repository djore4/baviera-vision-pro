-- Registo de importações, validação e cópia para restauro.
--
-- Cada importação de um snapshot (control VN, control VU, angariações) fica registada:
-- quem, quando, de que ficheiro, quantos registos (e quantos havia). Antes de substituir,
-- guarda-se uma cópia do que lá estava (as últimas 10 por tabela), para voltar atrás.
-- As regras de validação vivem na base de dados, não no browser, para valerem também
-- para uma importação automática:
--  * ficheiro sem registos → recusado (como antes);
--  * menos de metade dos registos atuais → recusado, salvo `p_force` (provável ficheiro
--    errado ou incompleto);
--  * menos de 90 % ou mais do dobro → aviso (aparece no registo).
-- As regras só se aplicam com 20 ou mais registos atuais (tabelas pequenas variam muito).
--
-- Registar nunca pode impedir uma importação: se o registo falhar, a importação segue e
-- fica um aviso nos logs da base de dados.
-- A função `restaurar_importacao` repõe o estado anterior a uma importação (só os registos;
-- os objetivos mensais do control não fazem parte da cópia).
-- Idempotente. As assinaturas antigas de replace_rows / import_control_excel são
-- substituídas (os novos parâmetros têm valor por omissão, por isso os chamadores
-- antigos continuam a funcionar).

create table if not exists public.importacoes (
  id                bigint generated always as identity primary key,
  tabela            text not null check (tabela in ('control_records', 'control_records_vu', 'angariacoes_vu')),
  origem            text not null default 'manual' check (origem in ('manual', 'automatica', 'restauro')),
  por               text not null default '',            -- preenchido pelo trigger
  ficheiro          text,
  linhas            integer not null,
  linhas_anteriores integer not null,
  avisos            jsonb not null default '[]'::jsonb,
  forcada           boolean not null default false,      -- passou por cima de uma recusa
  created_at        timestamptz not null default now()
);

create index if not exists importacoes_tabela_idx on public.importacoes (tabela, created_at desc);

-- Cópia do que existia ANTES da importação (para a desfazer).
create table if not exists public.importacoes_snapshot (
  importacao_id bigint primary key references public.importacoes (id) on delete cascade,
  tabela        text not null,
  dados         jsonb not null,
  created_at    timestamptz not null default now()
);

create index if not exists importacoes_snapshot_idx on public.importacoes_snapshot (tabela, created_at desc);

create or replace function public.importacoes_before()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.por        := lower(coalesce(auth.jwt() ->> 'email', ''));
  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists importacoes_before on public.importacoes;
create trigger importacoes_before before insert on public.importacoes
  for each row execute function public.importacoes_before();

alter table public.importacoes enable row level security;
alter table public.importacoes_snapshot enable row level security;

drop policy if exists importacoes_select on public.importacoes;
drop policy if exists importacoes_insert on public.importacoes;
drop policy if exists importacoes_snapshot_select on public.importacoes_snapshot;
drop policy if exists importacoes_snapshot_insert on public.importacoes_snapshot;
drop policy if exists importacoes_snapshot_delete on public.importacoes_snapshot;

-- Mesmos tabs que podem importar control (dados / database).
create policy importacoes_select on public.importacoes for select to authenticated
  using ((select public.has_any_access(array['dados', 'database'], 'view')));
create policy importacoes_insert on public.importacoes for insert to authenticated
  with check ((select public.has_any_access(array['dados', 'database'], 'edit')));

-- A cópia tem os dados todos: só quem pode importar.
create policy importacoes_snapshot_select on public.importacoes_snapshot for select to authenticated
  using ((select public.has_any_access(array['dados', 'database'], 'edit')));
create policy importacoes_snapshot_insert on public.importacoes_snapshot for insert to authenticated
  with check ((select public.has_any_access(array['dados', 'database'], 'edit')));
create policy importacoes_snapshot_delete on public.importacoes_snapshot for delete to authenticated
  using ((select public.has_any_access(array['dados', 'database'], 'edit')));

revoke all on public.importacoes, public.importacoes_snapshot from anon;
revoke update, delete on public.importacoes from authenticated;
revoke update on public.importacoes_snapshot from authenticated;
grant select, insert on public.importacoes to authenticated;
grant select, insert, delete on public.importacoes_snapshot to authenticated;

-- ── Regras de validação (puras) ─────────────────────────────────────────────────
create or replace function public.importacao_regras(p_anteriores integer, p_linhas integer)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  bloqueios text[] := '{}';
  avisos    text[] := '{}';
begin
  -- Ficheiro vazio tem regra própria (replace_rows / p_allow_empty).
  if p_anteriores >= 20 and p_linhas > 0 then
    if p_linhas < p_anteriores * 0.5 then
      bloqueios := bloqueios || format(
        'O ficheiro tem %s registos e a base de dados tem %s (menos de metade). Pode ser o ficheiro errado ou estar incompleto.',
        p_linhas, p_anteriores);
    elsif p_linhas < p_anteriores * 0.9 then
      avisos := avisos || format(
        'O ficheiro tem menos %s registos do que os atuais (%s → %s).',
        p_anteriores - p_linhas, p_anteriores, p_linhas);
    elsif p_linhas > p_anteriores * 2 then
      avisos := avisos || format(
        'O ficheiro tem mais do dobro dos registos atuais (%s → %s).',
        p_anteriores, p_linhas);
    end if;
  end if;
  return jsonb_build_object(
    'anteriores', p_anteriores, 'linhas', p_linhas,
    'bloqueios', to_jsonb(bloqueios), 'avisos', to_jsonb(avisos));
end;
$$;

-- Validação antes de importar (a interface mostra o resultado e pede confirmação).
create or replace function public.importacao_validar(p_tabela text, p_linhas integer)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  anteriores integer;
begin
  if p_tabela is null or not (p_tabela = any (array['control_records', 'control_records_vu', 'angariacoes_vu'])) then
    raise exception 'importacao_validar: tabela não permitida: %', p_tabela using errcode = '22023';
  end if;
  execute format('select count(*) from public.%I', p_tabela) into anteriores;
  return public.importacao_regras(anteriores, coalesce(p_linhas, 0));
end;
$$;

-- ── replace_rows: agora com validação, registo e cópia ──────────────────────────
drop function if exists public.replace_rows(text, jsonb, boolean);

create or replace function public.replace_rows(
  p_table text,
  p_rows jsonb,
  p_allow_empty boolean default false,
  p_force boolean default false,
  p_origem text default 'manual',
  p_ficheiro text default null
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  allowed constant text[] := array['control_records', 'control_records_vu', 'angariacoes_vu'];
  bad_key text;
  cols text;
  n integer;
  anteriores integer;
  regras jsonb;
  bloqueada boolean;
  antes jsonb := '[]'::jsonb;
  imp_id bigint;
begin
  if p_table is null or not (p_table = any (allowed)) then
    raise exception 'replace_rows: tabela não permitida: %', p_table using errcode = '22023';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'replace_rows: p_rows tem de ser um array JSON' using errcode = '22023';
  end if;

  n := jsonb_array_length(p_rows);
  if n = 0 and not p_allow_empty then
    raise exception 'Importação sem registos — cancelada para não apagar os dados existentes.'
      using errcode = '22023';
  end if;

  if n > 0 then
    if exists (select 1 from jsonb_array_elements(p_rows) e where jsonb_typeof(e) <> 'object') then
      raise exception 'replace_rows: cada linha tem de ser um objeto JSON' using errcode = '22023';
    end if;

    select k into bad_key
    from (select distinct jsonb_object_keys(e) k from jsonb_array_elements(p_rows) e) keys
    where not exists (
      select 1 from pg_attribute a
      where a.attrelid = ('public.' || quote_ident(p_table))::regclass
        and a.attname = k and a.attnum > 0 and not a.attisdropped
    ) or k = 'id'
    limit 1;
    if bad_key is not null then
      raise exception 'replace_rows: coluna inválida em %: %', p_table, bad_key using errcode = '22023';
    end if;

    select string_agg(quote_ident(k), ', ' order by k) into cols
    from (select distinct jsonb_object_keys(e) k from jsonb_array_elements(p_rows) e) keys;
  end if;

  execute format('select count(*) from public.%I', p_table) into anteriores;
  regras := public.importacao_regras(anteriores, n);
  bloqueada := jsonb_array_length(regras -> 'bloqueios') > 0;
  if bloqueada and not p_force then
    raise exception 'IMPORTACAO_SUSPEITA: %', regras -> 'bloqueios' ->> 0 using errcode = '22023';
  end if;

  -- Cópia do que lá está (sem o id), para poder voltar atrás.
  if anteriores > 0 then
    execute format('select coalesce(jsonb_agg(to_jsonb(t) - ''id''), ''[]''::jsonb) from public.%I t', p_table)
      into antes;
  end if;

  execute format('delete from public.%I where id is not null', p_table);

  if n > 0 then
    execute format(
      'insert into public.%1$I (%2$s) select %2$s from jsonb_populate_recordset(null::public.%1$I, $1)',
      p_table, cols
    ) using p_rows;
  end if;

  -- Registo e cópia: nunca impedem a importação.
  begin
    insert into public.importacoes (tabela, origem, ficheiro, linhas, linhas_anteriores, avisos, forcada)
    values (p_table, p_origem, left(p_ficheiro, 200), n, anteriores,
            (regras -> 'avisos') || case when bloqueada then regras -> 'bloqueios' else '[]'::jsonb end,
            bloqueada)
    returning id into imp_id;

    if anteriores > 0 then
      insert into public.importacoes_snapshot (importacao_id, tabela, dados)
      values (imp_id, p_table, antes);

      delete from public.importacoes_snapshot s
      where s.tabela = p_table
        and s.importacao_id not in (
          select x.importacao_id from public.importacoes_snapshot x
          where x.tabela = p_table
          order by x.created_at desc, x.importacao_id desc
          limit 10);
    end if;
  exception when others then
    raise warning 'replace_rows: o registo da importação falhou (a importação foi feita): %', sqlerrm;
  end;

  return n;
end;
$$;

revoke all on function public.replace_rows(text, jsonb, boolean, boolean, text, text) from public, anon;
grant execute on function public.replace_rows(text, jsonb, boolean, boolean, text, text) to authenticated;

-- ── import_control_excel: passa os novos parâmetros ─────────────────────────────
drop function if exists public.import_control_excel(jsonb, jsonb, jsonb);

create or replace function public.import_control_excel(
  p_control jsonb,
  p_orcamento jsonb default '[]'::jsonb,
  p_resp jsonb default '[]'::jsonb,
  p_force boolean default false,
  p_ficheiro text default null,
  p_origem text default 'manual'
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  n integer;
begin
  if jsonb_typeof(p_orcamento) is distinct from 'array' or jsonb_typeof(p_resp) is distinct from 'array' then
    raise exception 'import_control_excel: orçamentos e objetivos têm de ser arrays JSON' using errcode = '22023';
  end if;

  -- Registos de control: substitui tudo (recusa um ficheiro vazio ou suspeito).
  n := public.replace_rows('control_records', p_control, false, p_force, p_origem, p_ficheiro);

  if jsonb_array_length(p_orcamento) > 0 then
    insert into public.objetivos_orcamento (ano, mes, tipo, orcamento)
    select x.ano, x.mes, x.tipo, x.orcamento
    from jsonb_to_recordset(p_orcamento) as x(ano integer, mes integer, tipo text, orcamento numeric)
    on conflict (ano, mes, tipo) do update
      set orcamento = excluded.orcamento, updated_at = now();
  end if;

  if jsonb_array_length(p_resp) > 0 then
    insert into public.objetivos_resp (ano, mes, responsavel, objetivo)
    select x.ano, x.mes, x.responsavel, x.objetivo
    from jsonb_to_recordset(p_resp) as x(ano integer, mes integer, responsavel text, objetivo integer)
    on conflict (ano, mes, responsavel) do update
      set objetivo = excluded.objetivo, updated_at = now();
  end if;

  return n;
end;
$$;

revoke all on function public.import_control_excel(jsonb, jsonb, jsonb, boolean, text, text) from public, anon;
grant execute on function public.import_control_excel(jsonb, jsonb, jsonb, boolean, text, text) to authenticated;

-- ── Restauro: volta ao estado anterior a uma importação ─────────────────────────
create or replace function public.restaurar_importacao(p_importacao_id bigint)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  s record;
begin
  select i.tabela, i.dados into s from public.importacoes_snapshot i where i.importacao_id = p_importacao_id;
  if not found then
    raise exception 'Não há cópia desta importação para restaurar.' using errcode = '22023';
  end if;
  -- p_force: voltar atrás nunca é "suspeito". Fica registado como 'restauro' e, por sua vez,
  -- também guarda uma cópia do estado que substitui (o restauro também se desfaz).
  return public.replace_rows(s.tabela, s.dados, true, true, 'restauro',
                             'Restauro (antes da importação #' || p_importacao_id || ')');
end;
$$;

revoke all on function public.restaurar_importacao(bigint) from public, anon;
grant execute on function public.restaurar_importacao(bigint) to authenticated;

revoke all on function public.importacao_regras(integer, integer) from public, anon;
revoke all on function public.importacao_validar(text, integer) from public, anon;
grant execute on function public.importacao_regras(integer, integer) to authenticated;
grant execute on function public.importacao_validar(text, integer) to authenticated;

-- ── Carimbo "dados de HH:MM", visível a todos (sem dizer quem) ──────────────────
create or replace function public.ultimas_importacoes()
returns table (tabela text, created_at timestamptz, linhas integer, origem text)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct on (i.tabela) i.tabela, i.created_at, i.linhas, i.origem
  from public.importacoes i
  where (select public.is_platform_user())
  order by i.tabela, i.created_at desc, i.id desc;
$$;

revoke all on function public.ultimas_importacoes() from public, anon;
grant execute on function public.ultimas_importacoes() to authenticated;
