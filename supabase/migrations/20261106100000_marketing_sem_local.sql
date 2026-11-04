-- Marketing: quem não tem local definido (ou nenhum local reconhecido) deixa de ser barrado,
-- igual à interface (src/lib/permissions.ts: restritoPeloLocal). Continua barrado quem opera
-- só em locais que não incluem Aveiro.
-- Manter a lista de locais sincronizada com client.locais (src/clients/baviera/config.ts).
create or replace function public.marketing_local_ok()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select public.is_app_admin())
    or exists (
      select 1 from public.app_access_exceptions e
      where e.email = lower(auth.jwt() ->> 'email') and e.tab = 'marketing'
    )
    or exists (
      select 1 from public.app_users u
      where lower(u.email) = lower(auth.jwt() ->> 'email')
        and (
          u.local ? 'Aveiro'
          or not coalesce(u.local ?| array['Maia', 'Porto', 'Gaia', 'Feira'], false)
        )
    );
$$;
