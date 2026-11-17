-- Painel: ações do vendedor sobre os avisos, sem precisar do editor completo (que exige
-- edição de Dados/Database).
--
-- 1. painel_baixas: "dar baixa" a um aviso (p. ex. Lead CME aberta, proposta de financiamento
--    feita). Remove o aviso para toda a equipa e fica registado quem, quando e porquê.
--    Cada (regra, registo) só tem uma baixa. Quem a fez (ou o admin) pode repô-la.
--
-- 2. Três funções, cada uma a escrever UM campo de control_records, com validação e só para
--    quem tem acesso ao tab 'painel':
--      painel_registar_biz      — nº Bizagi (só se ainda estiver vazio)
--      painel_registar_entrega  — certificado de entrega: passa a Retail com data 298
--                                 (só viaturas matriculadas, ainda por entregar)
--      painel_reagendar         — mês previsto de entrega (mes1)
--    Não alteram mais nada. Idempotente.

create table if not exists public.painel_baixas (
  id         bigint generated always as identity primary key,
  regra      text not null,
  chave      text not null,                   -- control_records.id
  motivo     text not null,                   -- p. ex. 'lead-aberta', 'nao-aplicavel'
  nota       text check (nota is null or char_length(nota) <= 300),
  descricao  text,                            -- "iX3 M Sport · Cliente", para listar sem cruzar tabelas
  created_by text not null,
  created_at timestamptz not null default now(),
  constraint painel_baixas_unica unique (regra, chave)
);

alter table public.painel_baixas enable row level security;

drop policy if exists painel_baixas_select on public.painel_baixas;
create policy painel_baixas_select on public.painel_baixas for select to authenticated
  using ((select public.has_access('painel')));

drop policy if exists painel_baixas_insert on public.painel_baixas;
create policy painel_baixas_insert on public.painel_baixas for insert to authenticated
  with check ((select public.has_access('painel'))
              and created_by = lower((select auth.jwt() ->> 'email')));

drop policy if exists painel_baixas_delete on public.painel_baixas;
create policy painel_baixas_delete on public.painel_baixas for delete to authenticated
  using ((select public.is_app_admin())
         or ((select public.has_access('painel')) and created_by = lower((select auth.jwt() ->> 'email'))));

revoke all on public.painel_baixas from anon;
revoke update on public.painel_baixas from authenticated;
grant select, insert, delete on public.painel_baixas to authenticated;

create or replace function public.painel_registar_biz(p_id uuid, p_biz text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v text := btrim(coalesce(p_biz, ''));
begin
  if not (select public.has_access('painel')) then raise exception 'sem_acesso'; end if;
  if v = '' or char_length(v) > 40 then raise exception 'biz_invalido'; end if;
  update public.control_records set biz = v
   where id = p_id and btrim(coalesce(biz, '')) = '';
  if not found then raise exception 'registo_invalido'; end if;
end;
$$;

create or replace function public.painel_registar_entrega(p_id uuid, p_data date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select public.has_access('painel')) then raise exception 'sem_acesso'; end if;
  if p_data is null
     or p_data > (now() at time zone 'Europe/Lisbon')::date
     or p_data < (now() at time zone 'Europe/Lisbon')::date - 30 then
    raise exception 'data_invalida';
  end if;
  update public.control_records set status = 'Retail', date298 = p_data
   where id = p_id and status in ('Carteira', 'Matricula') and btrim(coalesce(mat, '')) <> '';
  if not found then raise exception 'registo_invalido'; end if;
end;
$$;

create or replace function public.painel_reagendar(p_id uuid, p_mes text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select public.has_access('painel')) then raise exception 'sem_acesso'; end if;
  if p_mes is null or p_mes !~ '^\d{4}/(0[1-9]|1[0-2])$' then raise exception 'mes_invalido'; end if;
  update public.control_records set mes1 = p_mes
   where id = p_id and status in ('Carteira', 'Matricula');
  if not found then raise exception 'registo_invalido'; end if;
end;
$$;

revoke all on function public.painel_registar_biz(uuid, text) from public, anon;
revoke all on function public.painel_registar_entrega(uuid, date) from public, anon;
revoke all on function public.painel_reagendar(uuid, text) from public, anon;
grant execute on function public.painel_registar_biz(uuid, text) to authenticated;
grant execute on function public.painel_registar_entrega(uuid, date) to authenticated;
grant execute on function public.painel_reagendar(uuid, text) to authenticated;
