-- Dados iniciais para um cliente novo (correr uma vez, depois da baseline e das migrações).
--
-- Perfis-modelo com a matriz de permissões (local → equipa → tab → nível). Cada perfil tem o mesmo acesso em
-- todas as equipas; em Aveiro e nas contas sem local vale a lista completa e nos outros locais só o End-of-Term
-- (e as suas permissões finas). Ajustar aos nomes e perfis do cliente no tab Utilizadores → Permissões; o perfil
-- Administrador é o único obrigatório.

create function pg_temp.perfil(p_nome text, p_perms jsonb) returns void language plpgsql as $$
declare
  completo jsonb := p_perms;
  outros jsonb := coalesce((select jsonb_object_agg(k, v) from jsonb_each(p_perms) x(k, v)
                            where k = 'end-of-term' or k like 'end-of-term:%'), '{}'::jsonb);
  m jsonb := '{}'::jsonb; l text; e text; por_equipa jsonb;
begin
  foreach l in array public.app_locais() || array['_']::text[] loop
    por_equipa := '{}'::jsonb;
    foreach e in array public.app_equipas() || array['_']::text[] loop
      if (case when l in ('Aveiro', '_') then completo else outros end) <> '{}'::jsonb then
        por_equipa := por_equipa || jsonb_build_object(e, case when l in ('Aveiro', '_') then completo else outros end);
      end if;
    end loop;
    if por_equipa <> '{}'::jsonb then m := m || jsonb_build_object(l, por_equipa); end if;
  end loop;
  insert into public.app_roles (name, is_admin, permissions_matriz) values (p_nome, false, m) on conflict (name) do nothing;
end $$;

insert into public.app_roles (name, is_admin) values ('Administrador', true) on conflict (name) do nothing;
select pg_temp.perfil('Vendedor VN', '{"funil": "view", "escala": "view", "lavagem": "view", "retails": "view", "carteira": "view", "producao": "view", "prospecao": "view", "vendedores": "view", "ficha-margem": "view"}');
select pg_temp.perfil('Vendedor VU', '{"wip": "view", "stock": "view", "lavagem": "view", "objetivos-vu": "view", "funil-vu": "view", "escala-vu": "view", "angariacao": "view"}');
select pg_temp.perfil('CV VU', '{"wip": "edit", "dados": "view", "funil": "view", "stock": "edit", "escala": "view", "retails": "view", "carteira": "view", "objetivos-vu": "edit", "funil-vu": "view", "producao": "view", "escala-vu": "edit", "prospecao": "view", "angariacao": "edit", "vendedores": "view", "ficha-margem": "view"}');
select pg_temp.perfil('Finance', '{"carteira": "view", "producao": "view", "end-of-term": "edit", "end-of-term:todos": "edit"}');
select pg_temp.perfil('Secretaria', '{"retails": "view", "carteira": "view", "producao": "view", "ficha-margem": "edit"}');
select pg_temp.perfil('Gestor de Serviço', '{"lavagem": "edit"}');
select pg_temp.perfil('Preparador', '{"lavagem": "edit", "lavagem:reagendar": "edit", "lavagem:qualidade": "edit", "retails": "view", "carteira": "view", "producao": "view"}');
select pg_temp.perfil('Lavador', '{"lavagem": "view", "lavagem:iniciar": "edit"}');

-- Ciclo de multas inicial (penalties.cycle_id tem default 1).
insert into public.penalty_cycles (id) values (1) on conflict do nothing;
