-- Demos: colunas visíveis por função + gestão de preços pelo responsável local.
--
-- 1. Colunas por função. As chaves 'demos:col:<coluna>' em app_roles.permissions (valor 'view')
--    dizem que colunas de preço cada função vê no tab Demos. demos_viaturas() só devolve em
--    `inputs` os valores de que as colunas permitidas precisam (um custo escondido na interface
--    mas enviado ao browser não estava escondido). `stats` deixa de sair para quem não é
--    administrador: a interface nunca o usou e trazia PVP final / IVA fora do controlo das colunas.
--    O administrador vê tudo. Colunas de identificação (modelo, matrícula, local…) não se parametrizam.
--    Funções existentes ficam com as colunas que já viam (as de preço e venda, sem descontos
--    nem custo); funções novas começam sem nenhuma.
--
-- 2. Gestão de preços: permissão fina 'demos:precos' (valor 'edit'). Quem a tem grava os
--    preços das viaturas do SEU local através de demos_gravar_precos() — nunca outras
--    colunas, nunca outros locais. Grava `inputs` e recalcula `stats` com as fórmulas da
--    Caetano Sales Force (que partilha a tabela e lê o mesmo formato).
--    Quem tem 'demos:precos' vê os 13 valores das viaturas do seu local, para os poder editar.
--
-- 3. Fora de Aveiro: já resolvido por 20261109140000 (demos_por_local): o tab Demos abre-se a
--    todos os locais com âmbito de linha (viatura_local_visivel). 'demos:precos' herda: como
--    'demos' está em app_tabs_por_local, segue a função. Depende dessa migração.

-- Dependências: de que valores de `inputs` precisa cada coluna (espelha DEMO_COL_DEPS no código).
create or replace function public.demos_dep_colunas()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select '{
    "pvb": ["pvb"], "opc": ["opc"], "bsi": ["bsi"], "eco": ["eco"], "leg": ["leg"], "isv": ["isv"],
    "pen": ["pvb", "opc"],
    "pvp": ["pvb", "opc", "bsi", "eco", "leg", "isv"],
    "mgb": ["mgb"], "esf": ["esf"], "pac": ["pac"], "dem": ["dem"], "sup": ["sup"],
    "dsc": ["pvb", "opc", "mgb", "esf", "pac", "dem", "sup"],
    "p_custo": ["pvb", "opc", "mgb", "esf", "pac", "dem", "sup", "eco", "leg", "isv"],
    "dep": ["depreciacoes"],
    "margem": ["pvb", "opc", "mgb", "esf", "pac", "dem", "sup", "eco", "leg", "isv", "pvp_desc", "depreciacoes"],
    "pvp_desc": ["pvp_desc"],
    "pvp_siva": ["pvp_desc"]
  }'::jsonb;
$$;

-- Valores de `inputs` que as colunas atribuídas à função do utilizador precisam.
create or replace function public.demos_inputs_permitidos()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct k), '{}'::text[])
  from (
    select jsonb_array_elements_text(d.value) as k
    from public.app_users u
    join public.app_roles r on r.name = u.perfil
    cross join lateral jsonb_each(public.demos_dep_colunas()) d
    where lower(u.email) = lower(auth.jwt() ->> 'email')
      and coalesce(r.permissions ->> ('demos:col:' || d.key), 'none') <> 'none'
  ) s;
$$;

revoke all on function public.demos_dep_colunas() from public, anon;
revoke all on function public.demos_inputs_permitidos() from public, anon;
grant execute on function public.demos_dep_colunas() to authenticated;
grant execute on function public.demos_inputs_permitidos() to authenticated;

create or replace function public.demos_viaturas()
returns setof public.viaturas
language sql
stable
security definer
set search_path = ''
as $$
  with eu as (
    select (select public.is_app_admin()) as adm,
           (select public.has_access('demos:precos', 'edit')) as precos,
           (select public.demos_inputs_permitidos()) as ok
  )
  select (jsonb_populate_record(
    null::public.viaturas,
    case
      when eu.adm then to_jsonb(v)
      else to_jsonb(v) || jsonb_build_object(
        'inputs', coalesce((
          select jsonb_object_agg(e.key, e.value)
          from jsonb_each(case jsonb_typeof(v.inputs) when 'object' then v.inputs else '{}'::jsonb end) e
          where e.key = any (eu.ok)
             or (eu.precos and public.viaturas_local_ok(v.local) and e.key = any (array[
                  'pvb', 'opc', 'bsi', 'eco', 'leg', 'isv',
                  'mgb', 'esf', 'pac', 'dem', 'sup', 'depreciacoes', 'pvp_desc']))
        ), '{}'::jsonb),
        'stats', coalesce((
          select jsonb_object_agg(e.key, e.value)
          from jsonb_each(case jsonb_typeof(v.stats) when 'object' then v.stats else '{}'::jsonb end) e
          where e.key = any (array['idade', 'idade_dias'])
        ), '{}'::jsonb)
      )
    end
  )).*
  from public.viaturas v, eu
  where eu.adm
     or ((select public.has_access('demos'))
         and (select public.viatura_local_visivel(v.local)));
$$;

revoke all on function public.demos_viaturas() from public, anon;
grant execute on function public.demos_viaturas() to authenticated;

-- Grava os preços de uma viatura. Administrador: qualquer; 'demos:precos' (edit): só as do seu local.
-- `p_inputs` pode ser parcial; chaves fora das 13 de preço, valores não numéricos e percentagens
-- fora de 0–1 são recusados. `stats` é recalculado com as fórmulas da Caetano Sales Force
-- (Preço Mín. inclui o BSI) para que as duas aplicações continuem a ler o mesmo formato.
create or replace function public.demos_gravar_precos(p_chassis text, p_inputs jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v public.viaturas;
  k text;
  n jsonb;
  allowed constant text[] := array[
    'pvb', 'opc', 'bsi', 'eco', 'leg', 'isv',
    'mgb', 'esf', 'pac', 'dem', 'sup', 'depreciacoes', 'pvp_desc'];
  base jsonb;
  i jsonb;
  s jsonb;
  pvb numeric; opc numeric; bsi numeric; eco numeric; leg numeric; isv numeric;
  dperc numeric; deur numeric; pvp_bruto numeric; pmin numeric; mg numeric; pdesc numeric; dep numeric;
begin
  select * into v from public.viaturas where chassis = p_chassis;
  if not found then
    raise exception 'Viatura não encontrada.' using errcode = 'P0002';
  end if;
  if not ((select public.is_app_admin())
          or ((select public.has_access('demos:precos', 'edit')) and public.viaturas_local_ok(v.local))) then
    raise exception 'Sem permissão para gerir os preços desta viatura.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_inputs) is distinct from 'object' then
    raise exception 'Preços inválidos.' using errcode = '22023';
  end if;
  for k, n in select * from jsonb_each(p_inputs) loop
    if not (k = any (allowed)) then
      raise exception 'Campo de preço desconhecido: %.', k using errcode = '22023';
    end if;
    if jsonb_typeof(n) is distinct from 'number' then
      raise exception 'O campo % tem de ser numérico.', k using errcode = '22023';
    end if;
    if abs((n #>> '{}')::numeric) > 10000000 then
      raise exception 'Valor fora do intervalo em %.', k using errcode = '22023';
    end if;
    if k in ('mgb', 'esf', 'pac', 'dem', 'sup') and ((n #>> '{}')::numeric < 0 or (n #>> '{}')::numeric > 1) then
      raise exception 'A percentagem % tem de estar entre 0 e 100.', k using errcode = '22023';
    end if;
  end loop;

  base := case jsonb_typeof(v.inputs)
            when 'object' then v.inputs
            when 'string' then (v.inputs #>> '{}')::jsonb
            else '{}'::jsonb end;
  i := base || p_inputs;

  pvb := coalesce((i ->> 'pvb')::numeric, 0);  opc := coalesce((i ->> 'opc')::numeric, 0);
  bsi := coalesce((i ->> 'bsi')::numeric, 0);  eco := coalesce((i ->> 'eco')::numeric, 0);
  leg := coalesce((i ->> 'leg')::numeric, 0);  isv := coalesce((i ->> 'isv')::numeric, 0);
  pdesc := coalesce((i ->> 'pvp_desc')::numeric, 0); dep := coalesce((i ->> 'depreciacoes')::numeric, 0);
  dperc := coalesce((i ->> 'mgb')::numeric, 0) + coalesce((i ->> 'esf')::numeric, 0)
         + coalesce((i ->> 'pac')::numeric, 0) + coalesce((i ->> 'dem')::numeric, 0)
         + coalesce((i ->> 'sup')::numeric, 0);
  deur := (pvb + opc) * dperc;
  pvp_bruto := (pvb + opc + bsi + eco + leg + isv) * 1.23;
  pmin := pvp_bruto - deur * 1.23;
  mg := pdesc - pmin + dep;

  s := (case jsonb_typeof(v.stats) when 'object' then v.stats else '{}'::jsonb end)
    || jsonb_build_object(
         'pvp_bruto', pvp_bruto, 'pvp_final', pdesc, 'mg', mg,
         'penetracao', case when pvb > 0 then opc / pvb else 0 end,
         'desc_perc', dperc, 'desc_eur', deur,
         'iva', pvp_bruto / 1.23 * 0.23, 'preco_minimo', pmin,
         'mg_perc', case when pvb + opc > 0 then mg / (pvb + opc) else 0 end,
         's_iva', pdesc / 1.23);

  update public.viaturas set inputs = i, stats = s where chassis = p_chassis;
  insert into public.historico (tabela, acao, registo_id, detalhes)
    values ('viaturas', 'ATUALIZAR_PRECOS', p_chassis,
            jsonb_build_object('editado_por', auth.jwt() ->> 'email', 'origem', 'baviera-vision-pro', 'alterados', (select jsonb_agg(key) from jsonb_object_keys(p_inputs) key)));
  return i;
end;
$$;

revoke all on function public.demos_gravar_precos(text, jsonb) from public, anon;
grant execute on function public.demos_gravar_precos(text, jsonb) to authenticated;

-- Funções existentes ficam com as colunas que já viam (preço e venda; descontos e custo eram só do admin).
update public.app_roles r
   set permissions = r.permissions || jsonb_build_object(
         'demos:col:pvb', 'view', 'demos:col:opc', 'view', 'demos:col:bsi', 'view', 'demos:col:pen', 'view',
         'demos:col:eco', 'view', 'demos:col:leg', 'view', 'demos:col:isv', 'view', 'demos:col:pvp', 'view',
         'demos:col:pvp_desc', 'view', 'demos:col:pvp_siva', 'view')
 where not r.is_admin
   and r.permissions ->> 'demos' in ('view', 'edit')
   and not (r.permissions ? 'demos:col:pvb');

create or replace function public.app_capabilities()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select '{"lavagem_granular": true, "eot_granular": true, "eot_responsaveis": true, "viaturas_local": true, "demos_precos": true}'::jsonb;
$$;

revoke all on function public.app_capabilities() from public, anon;
grant execute on function public.app_capabilities() to authenticated;
