-- Seguros: o estado Retail dos negócios VU (control_records_vu) é guardado em maiúsculas
-- ('RETAIL'), como os restantes estados VU; o VN usa 'Retail'. A deteção de vendas passa a
-- ignorar as maiúsculas, para um retail VU também assinalar o seguro da viatura ("dar baixa").
-- No VU o retail coincide com a fatura: a plataforma passa o negócio a RETAIL ao associar a DFAT.

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
      from public.control_records x where upper(x.status) = 'RETAIL'
    union all
    select x.mat, 'retail', coalesce(x.dfat, x.neg)
      from public.control_records_vu x where upper(x.status) = 'RETAIL'
    union all
    select x.matricula, 'stock_vu', x.arquivada_at::date
      from public.retomas x where x.arquivada
  )
  select v.matricula, upper(regexp_replace(v.matricula, '[^A-Za-z0-9]', '', 'g')), v.origem, v.data_venda
  from v
  where nullif(upper(regexp_replace(coalesce(v.matricula, ''), '[^A-Za-z0-9]', '', 'g')), '') is not null;
$$;
revoke all on function public.seguros_vendas_detetadas() from public, anon, authenticated;

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
      if upper(new.status) = 'RETAIL' and (tg_op = 'INSERT' or upper(old.status) is distinct from 'RETAIL') then
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
