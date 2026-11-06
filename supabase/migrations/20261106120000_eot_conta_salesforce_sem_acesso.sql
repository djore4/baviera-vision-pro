-- End-of-Term: a conta partilhada da Sales Force (caetanosalesforce@caetano.pt)
-- não pode ter acesso a NENHUMA EoT, seja qual for o perfil/permissões que tenha.
--
-- Imposto pela base de dados com políticas RESTRICTIVE (somam-se em AND às
-- permissivas existentes), por isso nem 'end-of-term:todos', nem a edição do tab
-- 'dados' (importação do mapa), nem uma exceção por email lhe dão acesso.
-- Para bloquear mais contas, acrescentar o email (minúsculas) à função.

-- ── 1. Contas sem acesso ───────────────────────────────────────────────────────
create or replace function public.eot_conta_bloqueada()
returns boolean
language sql
stable
set search_path = ''
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) = any (array['caetanosalesforce@caetano.pt']);
$$;

revoke all on function public.eot_conta_bloqueada() from public, anon;
grant execute on function public.eot_conta_bloqueada() to authenticated;

-- Remove exceções por email que lhe dessem acesso a qualquer end-of-term*.
delete from public.app_access_exceptions
 where email = 'caetanosalesforce@caetano.pt'
   and (tab = 'end-of-term' or tab like 'end-of-term:%');

-- ── 2. Políticas restritivas em todas as tabelas EoT ───────────────────────────
do $$
declare
  tbl text;
begin
  foreach tbl in array array['eot_contracts', 'eot_activities', 'eot_owners', 'eot_vendedor_map'] loop
    execute format('drop policy if exists %I on public.%I', tbl || '_sem_conta_bloqueada', tbl);
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated '
      'using (not (select public.eot_conta_bloqueada())) '
      'with check (not (select public.eot_conta_bloqueada()))',
      tbl || '_sem_conta_bloqueada', tbl);
  end loop;
end $$;
