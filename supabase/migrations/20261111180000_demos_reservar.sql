-- Demos: o chefe de vendas reserva uma viatura por 24 horas (fica destacada para todos).
--  * demos_reservar_viatura(p_chassis, p_libertar): reserva (agora + 24 h) ou liberta. Usa as colunas
--    reserva_expira / reserva_user que a tabela `viaturas` já tem.
--  * Quem pode: administrador, ou quem tem 'demos:reservar' (edit) nas viaturas dos seus locais.
--  * Uma reserva ativa de outra pessoa só a própria pessoa ou o administrador liberta/substitui.
--  * Regista em `historico`.
-- Depende de 20261109211555 (viaturas_local_ok).

create or replace function public.demos_reservar_viatura(p_chassis text, p_libertar boolean default false)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v public.viaturas;
  eu text := lower(coalesce(auth.jwt() ->> 'email', ''));
  adm boolean := (select public.is_app_admin());
  nome text;
  ativa boolean;
  minha boolean;
  nova_expira timestamptz;
  novo_user text;
begin
  select * into v from public.viaturas where chassis = p_chassis for update;
  if not found then raise exception 'Viatura não encontrada.' using errcode = 'P0002'; end if;
  if not (adm or ((select public.has_access('demos:reservar', 'edit')) and public.viaturas_local_ok(v.local))) then
    raise exception 'Sem permissão para reservar esta viatura.' using errcode = '42501';
  end if;

  select coalesce(nullif(btrim(u.nome), ''), eu) into nome from public.app_users u where lower(u.email) = eu;
  nome := coalesce(nome, eu);
  ativa := v.reserva_expira is not null and v.reserva_expira > now();
  minha := coalesce(v.reserva_user, '') = nome;

  if ativa and not adm and not minha then
    raise exception 'Reservada por % até %: só essa pessoa ou o administrador pode alterar.',
      coalesce(v.reserva_user, 'outra pessoa'), to_char(v.reserva_expira at time zone 'Europe/Lisbon', 'DD/MM HH24:MI')
      using errcode = '42501';
  end if;

  if p_libertar then
    nova_expira := null; novo_user := null;
  else
    nova_expira := now() + interval '24 hours'; novo_user := nome;
  end if;

  update public.viaturas set reserva_expira = nova_expira, reserva_user = novo_user where chassis = p_chassis;

  insert into public.historico (tabela, acao, registo_id, detalhes)
    values ('viaturas', case when p_libertar then 'LIBERTAR_RESERVA' else 'RESERVAR' end, p_chassis,
            jsonb_build_object('por', eu, 'origem', 'baviera-vision-pro', 'reserva_expira', nova_expira));

  return jsonb_build_object('reserva_expira', nova_expira, 'reserva_user', novo_user);
end;
$$;

revoke all on function public.demos_reservar_viatura(text, boolean) from public, anon;
grant execute on function public.demos_reservar_viatura(text, boolean) to authenticated;

-- Capacidade para a interface saber que a função existe (só então mostra a permissão e os botões).
create or replace function public.app_capabilities()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select '{"lavagem_granular": true, "eot_granular": true, "eot_responsaveis": true, "viaturas_local": true, "demos_precos": true, "demos_gestao": true, "demos_reservas": true}'::jsonb;
$$;

revoke all on function public.app_capabilities() from public, anon;
grant execute on function public.app_capabilities() to authenticated;
