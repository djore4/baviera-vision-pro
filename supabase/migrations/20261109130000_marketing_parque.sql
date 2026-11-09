-- Marketing: parque de viaturas para escolher no evento, sem ler a tabela `viaturas`.
-- A migração 20261012120000 deixa a leitura direta da tabela só ao administrador (esconde
-- `inputs`/`stats`: custos e margens). O Marketing lia a tabela (listParque) e perderia a
-- lista; esta função devolve só os campos de identificação, a quem tem o tab Marketing
-- (e é de Aveiro, como o resto do tab: marketing_local_ok).
create or replace function public.marketing_parque()
returns table (chassis text, matricula text, modelo text, versao text, marca text, local jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select v.chassis, v.matricula, v.modelo, v.versao, v.marca, v.local
  from public.viaturas v
  where (select public.has_access('marketing')) and (select public.marketing_local_ok())
  order by v.modelo;
$$;

revoke all on function public.marketing_parque() from public, anon;
grant execute on function public.marketing_parque() to authenticated;
