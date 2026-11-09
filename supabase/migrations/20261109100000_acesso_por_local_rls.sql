-- Acesso por local também na base de dados.
-- A interface (src/lib/permissions.ts: restritoPeloLocal) já tira todos os tabs, exceto o
-- End-of-Term, a quem opera só em locais que não incluem Aveiro. A RLS não o fazia: seguia só
-- a função, pelo que, por exemplo, um Genius da Feira lia os dados de Aveiro via API.
-- Passa a valer o mesmo aqui: administradores e exceções por email (app_access_exceptions)
-- ficam de fora; sem local, ou sem nenhum local reconhecido, não há restrição.
-- Manter a lista de locais sincronizada com client.locais (src/clients/baviera/config.ts).
create or replace function public.access_rank(p_tab text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when (select public.is_app_admin()) then 2
    else coalesce((
      select max(case lvl when 'edit' then 2 when 'view' then 1 else 0 end)
      from (
        select r.permissions ->> p_tab as lvl
        from public.app_users u
        join public.app_roles r on r.name = u.perfil
        where lower(u.email) = lower(auth.jwt() ->> 'email')
          and (
            p_tab = 'end-of-term' or p_tab like 'end-of-term:%'
            or u.local ? 'Aveiro'
            or not coalesce(u.local ?| array['Maia', 'Porto', 'Gaia', 'Feira'], false)
            or exists (
              select 1 from public.app_access_exceptions x
              where x.email = lower(auth.jwt() ->> 'email') and x.tab = p_tab
            )
          )
        union all
        select e.level
        from public.app_access_exceptions e
        where e.email = lower(auth.jwt() ->> 'email') and e.tab = p_tab
      ) levels
    ), 0)
  end;
$$;
