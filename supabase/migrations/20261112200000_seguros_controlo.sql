-- Seguros: controlo contínuo.
--
--  1. Danos próprios exigem valor seguro, início, fim e responsável pela informação prestada.
--     Os seguros já importados sem fim/responsável ficam válidos (NOT VALID) mas assinalados na
--     interface e só se podem voltar a gravar completos. Arquivar nunca é bloqueado.
--  2. As viaturas do Stock VU e dos Demos aparecem SEMPRE no tab (seguros_parque), com a origem.
--  3. Venda detetada por qualquer um destes sinais, sempre por matrícula:
--       - arquivo de vendidas dos Demos (viaturas_vendidas);
--       - negócio a Retail (control_records / control_records_vu);
--       - retoma arquivada no Stock VU (retomas.arquivada).
--     Cada sinal novo, havendo seguro por arquivar dessa matrícula, gera UMA notificação para quem
--     tem o tab Seguros ("dar baixa") — e o tab realça-o enquanto o seguro não for arquivado.

-- ── 1. Danos próprios completos ───────────────────────────────────────────────
alter table public.seguros add column if not exists responsavel_info text;  -- quem prestou a informação

alter table public.seguros drop constraint if exists seguros_dp_completo;
alter table public.seguros add constraint seguros_dp_completo check (
  arquivado
  or cobertura <> 'danos_proprios'
  or (capital_seguro > 0 and fim is not null and nullif(btrim(coalesce(responsavel_info, '')), '') is not null)
) not valid;

-- ── 2. Vendas detetadas (interna: só as funções abaixo a usam) ─────────────────
create or replace function public.seguros_vendas_detetadas()
returns table (matricula text, matricula_norm text, origem text, data_venda date)
language sql
stable
security definer
set search_path = ''
as $$
  with v as (
    select x.matricula, 'demos_arquivo'::text as origem, x.data_venda::date as data_venda
      from public.viaturas_vendidas x
    union all
    select x.mat, 'retail', coalesce(x.dfat, x.neg)
      from public.control_records x where x.status = 'Retail'
    union all
    select x.mat, 'retail', coalesce(x.dfat, x.neg)
      from public.control_records_vu x where x.status = 'Retail'
    union all
    select x.matricula, 'stock_vu', x.arquivada_at::date
      from public.retomas x where x.arquivada
  )
  select v.matricula, upper(regexp_replace(v.matricula, '[^A-Za-z0-9]', '', 'g')), v.origem, v.data_venda
  from v
  where nullif(upper(regexp_replace(coalesce(v.matricula, ''), '[^A-Za-z0-9]', '', 'g')), '') is not null;
$$;
revoke all on function public.seguros_vendas_detetadas() from public, anon, authenticated;

-- Para o tab: matrículas já vendidas e porquê.
drop function if exists public.seguros_vendidas();
create function public.seguros_vendidas()
returns table (matricula text, origem text, data_venda date)
language sql
stable
security definer
set search_path = ''
as $$
  select d.matricula, d.origem, d.data_venda
  from public.seguros_vendas_detetadas() d
  where (select public.has_access('seguros'));
$$;
revoke all on function public.seguros_vendidas() from public, anon;
grant execute on function public.seguros_vendidas() to authenticated;

-- ── 3. Parque que tem de ter seguro: Demos VN + Stock VU ──────────────────────
--   demos     → viaturas (estado_negocio diferente de 'VU');
--   stock_vu  → viaturas com estado_negocio 'VU' e retomas não arquivadas.
-- Fora quem já foi vendido (passou a Retail, foi arquivado): para esses vale o alerta de baixa.
drop function if exists public.seguros_parque();
create function public.seguros_parque()
returns table (origem text, ref text, chassis text, matricula text, modelo text, versao text, marca text, area text)
language sql
stable
security definer
set search_path = ''
as $$
  select case when coalesce(v.estado_negocio, '') = 'VU' then 'stock_vu' else 'demos' end,
         v.chassis, v.chassis, v.matricula, v.modelo, v.versao, v.marca,
         case when coalesce(v.estado_negocio, '') = 'VU' then 'bmw_vu'
              when lower(coalesce(v.marca, '')) like '%motorrad%' then 'motorrad'
              else 'bmw_vn' end
  from public.viaturas v
  where (select public.has_access('seguros'))
    and not exists (select 1 from public.seguros_vendas_detetadas() d
                    where d.matricula_norm = upper(regexp_replace(coalesce(v.matricula, ''), '[^A-Za-z0-9]', '', 'g')))
  union all
  select 'stock_vu', t.id::text, null, t.matricula, t.modelo, null, t.marca, 'bmw_vu'
  from public.retomas t
  where (select public.has_access('seguros')) and not t.arquivada
    and not exists (select 1 from public.seguros_vendas_detetadas() d
                    where d.matricula_norm = upper(regexp_replace(coalesce(t.matricula, ''), '[^A-Za-z0-9]', '', 'g')))
  order by 1, 5;
$$;
revoke all on function public.seguros_parque() from public, anon;
grant execute on function public.seguros_parque() to authenticated;

-- ── 4. Alerta de cancelamento ─────────────────────────────────────────────────
-- Uma notificação por seguro (o link leva o id: re-importações do mapa de Retail não repetem).
create or replace function public.seguros_avisar_venda(p_matricula text, p_origem text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  n text := upper(regexp_replace(coalesce(p_matricula, ''), '[^A-Za-z0-9]', '', 'g'));
  s record;
  l text;
begin
  if n = '' then return; end if;
  for s in select id, matricula, apolice from public.seguros where matricula_norm = n and not arquivado loop
    l := '/seguros?mat=' || public.url_encode(s.matricula) || '&seguro=' || s.id;
    if not exists (select 1 from public.notifications where audience = 'seguros' and link = l) then
      insert into public.notifications (title, body, audience, link, created_by, created_by_nome)
      values (
        'Cancelar seguro: viatura vendida',
        format('A viatura %s %s. Dar baixa do seguro%s.',
               s.matricula,
               case p_origem when 'retail' then 'passou a Retail'
                             when 'stock_vu' then 'foi arquivada no Stock VU'
                             else 'foi arquivada nos Demos (vendida)' end,
               case when s.apolice is not null then ' (apólice ' || s.apolice || ')' else '' end),
        'seguros', l, 'sistema', 'Seguros');
    end if;
  end loop;
end $$;
revoke all on function public.seguros_avisar_venda(text, text) from public, anon, authenticated;

-- Triggers nas tabelas de origem. Nunca podem impedir uma venda: qualquer erro aqui é ignorado.
create or replace function public.seguros_trg_venda()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    if tg_table_name = 'viaturas_vendidas' then
      perform public.seguros_avisar_venda(new.matricula, 'demos_arquivo');
    elsif tg_table_name in ('control_records', 'control_records_vu') then
      if new.status = 'Retail' and (tg_op = 'INSERT' or old.status is distinct from 'Retail') then
        perform public.seguros_avisar_venda(new.mat, 'retail');
      end if;
    elsif tg_table_name = 'retomas' then
      if new.arquivada and (tg_op = 'INSERT' or not old.arquivada) then
        perform public.seguros_avisar_venda(new.matricula, 'stock_vu');
      end if;
    end if;
  exception when others then
    raise warning 'seguros_trg_venda: %', sqlerrm;
  end;
  return new;
end $$;
revoke all on function public.seguros_trg_venda() from public, anon, authenticated;

drop trigger if exists seguros_venda on public.viaturas_vendidas;
create trigger seguros_venda after insert on public.viaturas_vendidas
  for each row execute function public.seguros_trg_venda();

drop trigger if exists seguros_venda on public.control_records;
create trigger seguros_venda after insert or update of status on public.control_records
  for each row execute function public.seguros_trg_venda();

drop trigger if exists seguros_venda on public.control_records_vu;
create trigger seguros_venda after insert or update of status on public.control_records_vu
  for each row execute function public.seguros_trg_venda();

drop trigger if exists seguros_venda on public.retomas;
create trigger seguros_venda after insert or update of arquivada on public.retomas
  for each row execute function public.seguros_trg_venda();

-- ── 5. Cancelamento pedido e upgrade para danos próprios (com histórico) ──────
--   cancelamento_pedido_em: quando se copiou/enviou o pedido de cancelamento à seguradora (a baixa
--   propriamente dita é arquivar). dp_desde: desde quando a cobertura é danos próprios (upgrade).
alter table public.seguros add column if not exists cancelamento_pedido_em date;
alter table public.seguros add column if not exists dp_desde date;

create table if not exists public.seguros_historico (
  id         uuid primary key default gen_random_uuid(),
  seguro_id  uuid not null references public.seguros (id) on delete cascade,
  tipo       text not null check (tipo in ('cobertura', 'cancelamento_pedido', 'arquivado', 'reativado')),
  de         text,
  para       text,
  detalhe    text,
  autor      text,
  created_at timestamptz not null default now()
);
create index if not exists seguros_historico_seguro_idx on public.seguros_historico (seguro_id, created_at);

alter table public.seguros_historico enable row level security;
drop policy if exists seguros_historico_select on public.seguros_historico;
create policy seguros_historico_select on public.seguros_historico
  for select to authenticated using ((select public.has_access('seguros')));
revoke all on public.seguros_historico from anon, authenticated;
grant select on public.seguros_historico to authenticated;

-- Escrito por trigger (não se contorna nem se falsifica pelo browser).
create or replace function public.seguros_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor text := lower(auth.jwt() ->> 'email');
begin
  if new.cobertura is distinct from old.cobertura then
    insert into public.seguros_historico (seguro_id, tipo, de, para, detalhe, autor)
    values (new.id, 'cobertura', old.cobertura, new.cobertura,
            format('Valor seguro %s €; desde %s; fim %s; responsável: %s',
                   coalesce(new.capital_seguro::text, '—'),
                   coalesce(to_char(new.dp_desde, 'DD-MM-YYYY'), '—'),
                   coalesce(to_char(new.fim, 'DD-MM-YYYY'), 'sem termo'),
                   coalesce(new.responsavel_info, '—')),
            actor);
  end if;
  if new.cancelamento_pedido_em is distinct from old.cancelamento_pedido_em and new.cancelamento_pedido_em is not null then
    insert into public.seguros_historico (seguro_id, tipo, para, autor)
    values (new.id, 'cancelamento_pedido', to_char(new.cancelamento_pedido_em, 'DD-MM-YYYY'), actor);
  end if;
  if new.arquivado is distinct from old.arquivado then
    insert into public.seguros_historico (seguro_id, tipo, para, autor)
    values (new.id, case when new.arquivado then 'arquivado' else 'reativado' end, new.motivo_arquivo, actor);
  end if;
  return new;
end $$;
revoke all on function public.seguros_log() from public, anon, authenticated;

drop trigger if exists seguros_log on public.seguros;
create trigger seguros_log after update on public.seguros
  for each row execute function public.seguros_log();

-- Situação de hoje: avisa já dos seguros por arquivar de viaturas que entretanto foram vendidas.
select public.seguros_avisar_venda(d.matricula, d.origem) from public.seguros_vendas_detetadas() d;

notify pgrst, 'reload schema';
