-- Lead time de entrega (Parque → Certificado de entrega): regista a data em que
-- cada viatura ENTRA em parque (coluna 198 passa a "P").
--
-- Como a data é apanhada:
-- * Um trigger em control_records (insert / update de week198, status, chas)
--   regista a 1.ª vez que a viatura aparece em parque (mesma regra do filtro
--   "Em parque" da app: 198 com "P" e estado diferente de Retail). Como os dados
--   já só se alteram na app, é a data real da alteração.
-- * Só a PRIMEIRA entrada conta (on conflict do nothing): reeditar a viatura ou
--   restaurar uma cópia de segurança não mexe nas datas já registadas.
-- * A tabela é chaveada pelo chassis (e não é uma coluna de control_records)
--   para sobreviver ao restauro de cópias, que apaga e reinsere as linhas.
--
-- Viaturas que já estão em parque quando esta migração corre: não há maneira de
-- saber quando entraram. Ficam com entrada_em NULL ("sem data") e são excluídas
-- do indicador — preencher com a data de hoje enviesava o lead time para baixo.
--
-- Idempotente.

create table if not exists public.parque_entradas (
  chassis     text primary key check (chassis = upper(btrim(chassis)) and chassis <> ''),
  entrada_em  date,                              -- NULL = já estava em parque antes do registo
  created_at  timestamptz not null default now()
);

create or replace function public.control_records_regista_parque()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  k text := upper(btrim(coalesce(new.chas, '')));
begin
  -- Mesma regra de "Em parque" da app. Um registo que já chega como Retail e com
  -- "P" não conta: a entrada é desconhecida e daria um lead time de 0 dias.
  if k <> ''
     and upper(coalesce(new.week198, '')) like '%P%'
     and coalesce(new.status, '') <> 'Retail' then
    insert into public.parque_entradas (chassis, entrada_em)
    values (k, (now() at time zone 'Europe/Lisbon')::date)
    on conflict (chassis) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists control_records_regista_parque on public.control_records;
create trigger control_records_regista_parque
  after insert or update of week198, status, chas on public.control_records
  for each row execute function public.control_records_regista_parque();

revoke all on function public.control_records_regista_parque() from public, anon, authenticated;

-- Viaturas já em parque hoje: entrada desconhecida (NULL), para a 1.ª importação
-- depois desta migração não lhes atribuir a data da importação.
insert into public.parque_entradas (chassis, entrada_em)
select distinct upper(btrim(chas)), null::date
from public.control_records
where btrim(coalesce(chas, '')) <> ''
  and upper(coalesce(week198, '')) like '%P%'
  and coalesce(status, '') <> 'Retail'
on conflict (chassis) do nothing;

alter table public.parque_entradas enable row level security;

drop policy if exists parque_entradas_select on public.parque_entradas;
create policy parque_entradas_select on public.parque_entradas for select to authenticated
  using (true);

-- O trigger (security definer) regista a entrada; só os administradores a podem
-- corrigir (editor da viatura). Ninguém apaga.
drop policy if exists parque_entradas_insert on public.parque_entradas;
drop policy if exists parque_entradas_update on public.parque_entradas;
create policy parque_entradas_insert on public.parque_entradas for insert to authenticated
  with check ((select public.is_app_admin()));
create policy parque_entradas_update on public.parque_entradas for update to authenticated
  using ((select public.is_app_admin())) with check ((select public.is_app_admin()));

revoke all on public.parque_entradas from anon;
revoke delete on public.parque_entradas from authenticated;
grant select, insert, update on public.parque_entradas to authenticated;

-- O Excel deixou de ser usado para carregar dados: remove a RPC de importação.
drop function if exists public.import_control_excel(jsonb, jsonb, jsonb);
