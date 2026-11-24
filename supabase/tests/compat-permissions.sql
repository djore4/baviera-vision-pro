-- SÓ PARA TESTES. Os testes SQL anteriores à matriz criam perfis com `insert into app_roles (name, is_admin, permissions)`.
-- Depois de a migração remover a coluna `permissions`, este adaptador repõe-na como ENTRADA e converte-a em
-- permissions_matriz (Aveiro e sem local: tudo; outros locais: End-of-Term, demos:inserir-viaturas e os tabs de
-- app_tabs_por_local), para esses testes continuarem a validar o resto da plataforma sem os reescrever.
-- Nunca aplicar num projeto real.
alter table public.app_roles add column if not exists permissions jsonb not null default '{}'::jsonb;

create or replace function public.t_perm_para_matriz(p jsonb) returns jsonb language plpgsql as $$
declare
  outros jsonb := coalesce((select jsonb_object_agg(k, v) from jsonb_each(p) x(k, v)
                            where k = 'end-of-term' or k like 'end-of-term:%' or k = 'demos:inserir-viaturas'
                               or split_part(k, ':', 1) in (select t.tab from public.app_tabs_por_local t)), '{}'::jsonb);
  m jsonb := '{}'::jsonb; l text; e text; por_equipa jsonb; cel jsonb;
begin
  foreach l in array public.app_locais() || array['_']::text[] loop
    por_equipa := '{}'::jsonb;
    cel := case when l in ('Aveiro', '_') then p else outros end;
    if cel <> '{}'::jsonb then
      foreach e in array public.app_equipas() || array['_']::text[] loop
        por_equipa := por_equipa || jsonb_build_object(e, cel);
      end loop;
      m := m || jsonb_build_object(l, por_equipa);
    end if;
  end loop;
  return m;
end $$;

create or replace function public.t_roles_compat() returns trigger language plpgsql as $$
begin
  if not new.is_admin and new.permissions <> '{}'::jsonb and (tg_op = 'INSERT' or new.permissions is distinct from old.permissions) then
    new.permissions_matriz := public.t_perm_para_matriz(new.permissions);
  end if;
  return new;
end $$;
drop trigger if exists t_roles_compat on public.app_roles;
create trigger t_roles_compat before insert or update on public.app_roles for each row execute function public.t_roles_compat();
