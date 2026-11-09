-- Demos: a gestão de preços fica só com a janela da viatura (permissão 'demos:precos').
-- Substitui a parametrização de colunas por função de 20261109211555, que deixou de fazer sentido:
-- a tabela mostra as mesmas colunas a todos e os valores de custo/descontos só aparecem na janela
-- de preço, para quem a pode abrir.
--
--  * Retira demos_inputs_permitidos() e demos_dep_colunas() e as chaves 'demos:col:*' das funções.
--  * demos_viaturas(): volta à lista branca de chaves de preço de 20261012120000 para quem não é
--    administrador; quem tem 'demos:precos' (edit) recebe ainda os 13 valores de `inputs` das
--    viaturas do SEU local (viaturas_local_ok), para os poder gerir. Âmbito por local como em
--    20261109211511 (viatura_local_visivel). `stats` volta a levar só a lista branca antiga.
--  * demos_gravar_precos() (20261109211555) mantém-se tal como está.
-- Depende de 20261109211511 e 20261109211555.

drop function if exists public.demos_inputs_permitidos();
drop function if exists public.demos_dep_colunas();

update public.app_roles r
   set permissions = r.permissions - array(select k from jsonb_object_keys(r.permissions) k where k like 'demos:col:%')
 where exists (select 1 from jsonb_object_keys(r.permissions) k where k like 'demos:col:%');

create or replace function public.demos_viaturas()
returns setof public.viaturas
language sql
stable
security definer
set search_path = ''
as $$
  with eu as (
    select (select public.is_app_admin()) as adm,
           (select public.has_access('demos:precos', 'edit')) as precos
  )
  select (jsonb_populate_record(
    null::public.viaturas,
    case
      when eu.adm then to_jsonb(v)
      else to_jsonb(v) || jsonb_build_object(
        'inputs', coalesce((
          select jsonb_object_agg(e.key, e.value)
          from jsonb_each(case jsonb_typeof(v.inputs)
                            when 'object' then v.inputs
                            when 'string' then (v.inputs #>> '{}')::jsonb
                            else '{}'::jsonb end) e
          where e.key = any (array['pvb', 'opc', 'bsi', 'eco', 'leg', 'isv', 'pvp_desc'])
             or (eu.precos and public.viaturas_local_ok(v.local) and e.key = any (array[
                  'mgb', 'esf', 'pac', 'dem', 'sup', 'depreciacoes']))
        ), '{}'::jsonb),
        'stats', coalesce((
          select jsonb_object_agg(e.key, e.value)
          from jsonb_each(case jsonb_typeof(v.stats) when 'object' then v.stats else '{}'::jsonb end) e
          where e.key = any (array['pvp_bruto', 'pvp_final', 'idade', 'idade_dias', 'penetracao', 'iva', 's_iva'])
        ), '{}'::jsonb)
      )
    end
  )).*
  from public.viaturas v, eu
  where eu.adm
     or ((select public.has_access('demos')) and (select public.viatura_local_visivel(v.local)));
$$;

revoke all on function public.demos_viaturas() from public, anon;
grant execute on function public.demos_viaturas() to authenticated;
