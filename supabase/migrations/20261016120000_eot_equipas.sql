-- End-of-Term: o chefe de equipa vê a SUA EQUIPA (os vendedores que lhe estão
-- atribuídos), e não o local.
--
-- Substitui a regra por local da migração 20261015120000_eot_responsaveis:
--   * eot_owners.chefe_email: o chefe de equipa de cada responsável (opcional).
--   * quem tem a permissão 'end-of-term:local' vê e altera os contratos cujo dono é
--     ele próprio ou alguém da sua equipa. Os contratos sem dono não os vê (atribui-os
--     o administrador ou o Finance à equipa); também não os passa a quem não é da equipa.
--   * o chefe gere só a sua equipa: acrescenta responsáveis (ficam na sua equipa),
--     edita-os e mapeia-lhes nomes do Excel. Não altera a sua própria ficha, nem a de
--     outros chefes: quem o põe como chefe e define a equipa é o administrador/Finance.
--   * o local de um responsável (eot_owners.locais) fica só para sugerir quem atribuir.
--   * desaparece o local calculado no contrato (eot_contracts.local): a RLS já não o usa.
--   * o perfil 'Supervisor EoT' passa a ver todos os contratos (end-of-term:todos),
--     como o Finance.

-- ── 1. Chefe de equipa ─────────────────────────────────────────────────────────
alter table public.eot_owners
  add column if not exists chefe_email text
  references public.eot_owners (email) on update cascade on delete set null;

do $$ begin
  alter table public.eot_owners add constraint eot_owners_chefe_check check (chefe_email is distinct from email);
exception when duplicate_object then null; end $$;

create index if not exists eot_owners_chefe_idx on public.eot_owners (chefe_email);

-- Emails da equipa do utilizador atual: ele próprio e quem o tem como chefe.
create or replace function public.eot_my_team()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
           (select array_agg(o.email) from public.eot_owners o
             where o.chefe_email = lower(auth.jwt() ->> 'email')),
           '{}'::text[])
         || array[lower(auth.jwt() ->> 'email')];
$$;

revoke all on function public.eot_my_team() from public, anon;
grant execute on function public.eot_my_team() to authenticated;

-- ── 2. RLS ─────────────────────────────────────────────────────────────────────
do $$
declare
  me  constant text := 'lower((select auth.jwt() ->> ''email''))';
  t   constant text := '(select public.has_access(''end-of-term''))';
  e   constant text := '(select public.has_access(''end-of-term'', ''edit''))';
  tod constant text := '(select public.has_access(''end-of-term:todos''))';
  lid constant text := '(select public.has_access(''end-of-term:local'', ''edit''))';
  team constant text := '(select public.eot_my_team())';
  imp constant text := '(select public.has_access(''dados'', ''edit''))';
  -- chefe de equipa: contratos cujo dono é da sua equipa (sem dono não entra: lower(null) não pertence)
  lead_c constant text := '(' || lid || ' and array[lower(owner_email)] <@ ' || team || ')';
  can_read  text := '((' || t || ' and (' || tod || ' or ' || lead_c || ' or lower(owner_email) = ' || me || ')) or ' || imp || ')';
  can_write text := '((' || e || ' and (' || tod || ' or ' || lead_c || ' or lower(owner_email) = ' || me || ')) or ' || imp || ')';
  -- responsáveis: o chefe só mexe na sua equipa
  own_team constant text := '(' || lid || ' and chefe_email = ' || me || ')';
  map_team constant text := '(' || lid || ' and exists (select 1 from public.eot_owners o where o.email = owner_email and o.chefe_email = ' || me || '))';
  tbl text;
  op text;
begin
  foreach op in array array['select', 'insert', 'update', 'delete'] loop
    execute format('drop policy if exists %I on public.eot_contracts', 'eot_contracts_' || op);
  end loop;
  execute format('create policy eot_contracts_select on public.eot_contracts for select to authenticated using (%s)', can_read);
  execute format('create policy eot_contracts_insert on public.eot_contracts for insert to authenticated with check (%s)', can_write);
  execute format('create policy eot_contracts_update on public.eot_contracts for update to authenticated using (%s) with check (%s)', can_write, can_write);
  execute format('create policy eot_contracts_delete on public.eot_contracts for delete to authenticated using (%s)', can_write);

  foreach tbl in array array['eot_owners', 'eot_vendedor_map'] loop
    foreach op in array array['insert', 'update', 'delete'] loop
      execute format('drop policy if exists %I on public.%I', tbl || '_' || op, tbl);
    end loop;
  end loop;

  execute format('create policy eot_owners_insert on public.eot_owners for insert to authenticated with check (%s and (%s or %s))', e, tod, own_team);
  execute format('create policy eot_owners_update on public.eot_owners for update to authenticated using (%1$s and (%2$s or %3$s)) with check (%1$s and (%2$s or %3$s))', e, tod, own_team);
  execute format('create policy eot_owners_delete on public.eot_owners for delete to authenticated using (%s and (%s or %s))', e, tod, own_team);

  execute format('create policy eot_vendedor_map_insert on public.eot_vendedor_map for insert to authenticated with check (%s and (%s or %s))', e, tod, map_team);
  execute format('create policy eot_vendedor_map_update on public.eot_vendedor_map for update to authenticated using (%1$s and (%2$s or %3$s)) with check (%1$s and (%2$s or %3$s))', e, tod, map_team);
  execute format('create policy eot_vendedor_map_delete on public.eot_vendedor_map for delete to authenticated using (%s and (%s or %s))', e, tod, map_team);
end $$;

-- ── 3. Já não se usa o local calculado ─────────────────────────────────────────
drop trigger if exists eot_contracts_local on public.eot_contracts;
drop function if exists public.eot_contracts_set_local();
drop index if exists public.eot_contracts_local_idx;
alter table public.eot_contracts drop column if exists local;
drop function if exists public.eot_local_of(text, text);
drop function if exists public.eot_my_locais();

-- ── 4. Supervisor EoT vê tudo (como o Finance) ─────────────────────────────────
update public.app_roles
   set permissions = permissions || '{"end-of-term:todos": "edit"}'::jsonb
 where name = 'Supervisor EoT';
