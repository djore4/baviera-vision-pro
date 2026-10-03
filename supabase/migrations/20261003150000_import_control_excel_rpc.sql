-- Importação do Excel de control atómica de ponta a ponta.
--
-- A importação do Excel faz duas coisas: substitui os registos de control e
-- grava (upsert) os objetivos por mês e por vendedor. Eram dois passos
-- separados: se o segundo falhasse, o primeiro já tinha ficado aplicado e a
-- base de dados ficava com registos novos e objetivos antigos. Esta função faz
-- tudo numa só transação: ou entra tudo, ou fica tudo como estava.
--
-- security invoker: as políticas RLS de control_records, objetivos_orcamento e
-- objetivos_resp decidem quem pode importar (tab dados, ou objetivos).

create or replace function public.import_control_excel(
  p_control jsonb,
  p_orcamento jsonb default '[]'::jsonb,
  p_resp jsonb default '[]'::jsonb
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

  -- Registos de control: substitui tudo (recusa um ficheiro sem registos).
  n := public.replace_rows('control_records', p_control);

  -- Orçamentos GSC/BMW por mês e objetivos por vendedor: upsert, mantendo os
  -- meses que não vêm no ficheiro.
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

revoke all on function public.import_control_excel(jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.import_control_excel(jsonb, jsonb, jsonb) to authenticated;
