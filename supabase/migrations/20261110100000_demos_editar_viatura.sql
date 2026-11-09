-- Demos: o administrador edita TODOS os dados de uma viatura (identificação, tipo, marca, tecnologia,
-- concessões, IVA dedutível, link de fotos), não só os preços.
--  * demos_editar_viatura(p_chassis, p): só administrador (is_app_admin). `p` leva apenas os campos a
--    alterar (os ausentes ficam como estão): chassis, matricula, encomenda, modelo, versao,
--    estado_negocio, marca, tipologia[], local[], data_matricula, kms, estado_entrega, link_fotos,
--    iva_dedutivel. Mesmas validações de demos_criar_viatura; chassis/matrícula repetidos são
--    recusados. Regista em `historico` os campos alterados.
-- Depende de 20261109213230 (demos_criar_viatura).

create or replace function public.demos_editar_viatura(p_chassis text, p jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v public.viaturas;
  ch text;
  mat text;
  enc text;
  v_modelo text;
  v_versao text;
  negocio text;
  v_marca text;
  loc jsonb;
  tip jsonb;
  dmat date;
  v_kms int;
  row_ public.viaturas;
begin
  if not (select public.is_app_admin()) then
    raise exception 'Só o administrador pode editar os dados da viatura.' using errcode = '42501';
  end if;
  select * into v from public.viaturas where chassis = p_chassis;
  if not found then raise exception 'Viatura não encontrada.' using errcode = 'P0002'; end if;
  if jsonb_typeof(p) is distinct from 'object' then raise exception 'Dados inválidos.' using errcode = '22023'; end if;

  ch := case when p ? 'chassis' then upper(btrim(coalesce(p ->> 'chassis', ''))) else v.chassis end;
  if ch = '' or length(ch) > 40 then raise exception 'Chassis em falta ou inválido.' using errcode = '22023'; end if;
  if ch <> v.chassis and exists (select 1 from public.viaturas where upper(chassis) = ch) then
    raise exception 'Já existe uma viatura com o chassis %.', ch using errcode = '23505';
  end if;

  mat := v.matricula;
  if p ? 'matricula' then
    mat := upper(regexp_replace(coalesce(p ->> 'matricula', ''), '[^A-Za-z0-9]', '', 'g'));
    if length(mat) <> 6 then raise exception 'Matrícula inválida (formato AA-00-BB).' using errcode = '22023'; end if;
    mat := substr(mat, 1, 2) || '-' || substr(mat, 3, 2) || '-' || substr(mat, 5, 2);
    if exists (select 1 from public.viaturas x
               where x.chassis <> v.chassis
                 and upper(regexp_replace(coalesce(x.matricula, ''), '[^A-Za-z0-9]', '', 'g')) = replace(mat, '-', '')) then
      raise exception 'A matrícula % já está associada a outra viatura.', mat using errcode = '23505';
    end if;
  end if;

  enc := case when p ? 'encomenda' then btrim(coalesce(p ->> 'encomenda', '')) else v.encomenda end;
  if coalesce(enc, '') = '' then raise exception 'Encomenda em falta.' using errcode = '22023'; end if;
  v_modelo := case when p ? 'modelo' then btrim(coalesce(p ->> 'modelo', '')) else v.modelo end;
  v_versao := case when p ? 'versao' then btrim(coalesce(p ->> 'versao', '')) else v.versao end;
  if coalesce(v_modelo, '') = '' or coalesce(v_versao, '') = '' then
    raise exception 'Modelo e versão são obrigatórios.' using errcode = '22023';
  end if;

  negocio := case when p ? 'estado_negocio' then coalesce(nullif(p ->> 'estado_negocio', ''), 'VD') else v.estado_negocio end;
  if negocio not in ('VD', 'VU') then raise exception 'Tipo de viatura inválido.' using errcode = '22023'; end if;

  v_marca := case when p ? 'marca' then coalesce(nullif(p ->> 'marca', ''), 'BMW') else null end;
  if v_marca is not null and v_marca not in ('BMW', 'BMW Motorrad') then
    raise exception 'Marca inválida.' using errcode = '22023';
  end if;

  loc := case when p ? 'local' then p -> 'local' else v.local end;
  tip := case when p ? 'tipologia' then coalesce(p -> 'tipologia', '[]'::jsonb) else v.tipologia end;
  if p ? 'local' and (jsonb_typeof(loc) is distinct from 'array' or jsonb_array_length(loc) = 0) then
    raise exception 'Indica a localização da viatura.' using errcode = '22023';
  end if;
  if p ? 'tipologia' and jsonb_typeof(tip) is distinct from 'array' then
    raise exception 'Tecnologia inválida.' using errcode = '22023';
  end if;
  if (p ? 'local' and exists (select 1 from jsonb_array_elements(loc) l where jsonb_typeof(l) <> 'string'))
     or (p ? 'tipologia' and exists (select 1 from jsonb_array_elements(tip) t where jsonb_typeof(t) <> 'string')) then
    raise exception 'Listas inválidas.' using errcode = '22023';
  end if;

  dmat := v.data_matricula;
  if p ? 'data_matricula' then
    begin dmat := nullif(p ->> 'data_matricula', '')::date; exception when others then
      raise exception 'Data de matrícula inválida.' using errcode = '22023'; end;
  end if;
  v_kms := v.kms;
  if p ? 'kms' then
    begin v_kms := nullif(p ->> 'kms', '')::int; exception when others then
      raise exception 'Quilómetros inválidos.' using errcode = '22023'; end;
    if v_kms < 0 then raise exception 'Quilómetros inválidos.' using errcode = '22023'; end if;
  end if;

  update public.viaturas set
    chassis = ch,
    matricula = mat,
    encomenda = enc,
    modelo = v_modelo,
    versao = v_versao,
    estado_negocio = negocio,
    marca = case when v_marca is null then marca else jsonb_build_array(v_marca)::text end,
    local = loc,
    tipologia = tip,
    data_matricula = dmat,
    kms = v_kms,
    estado_entrega = case when p ? 'estado_entrega' then nullif(btrim(coalesce(p ->> 'estado_entrega', '')), '') else estado_entrega end,
    link_fotos = case when p ? 'link_fotos' then nullif(btrim(coalesce(p ->> 'link_fotos', '')), '') else link_fotos end,
    iva_dedutivel = case when p ? 'iva_dedutivel' then coalesce((p ->> 'iva_dedutivel')::boolean, false) else iva_dedutivel end
  where chassis = p_chassis
  returning * into row_;

  insert into public.historico (tabela, acao, registo_id, detalhes)
    values ('viaturas', 'EDITAR_DADOS', ch,
            jsonb_build_object('editado_por', auth.jwt() ->> 'email', 'origem', 'baviera-vision-pro',
                               'chassis_anterior', p_chassis,
                               'alterados', (select jsonb_agg(key) from jsonb_object_keys(p) key)));
  return to_jsonb(row_);
end;
$$;

revoke all on function public.demos_editar_viatura(text, jsonb) from public, anon;
grant execute on function public.demos_editar_viatura(text, jsonb) to authenticated;
