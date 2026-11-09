-- Sales Force: perfil "Inserção" para quem tem 'demos:inserir-viaturas' (migração 20261109110000).
-- A Sales Force só deixava entrar quem constava de `utilizadores` — linha que dá escrita total em
-- `viaturas` (todos os locais, apagar incluído). Esta função devolve o perfil mínimo com que a app
-- deixa entrar quem tem a permissão fina da plataforma: sem linha em `utilizadores`, e por isso
-- limitado pela RLS (viaturas_local_ok) aos seus locais, sem apagar.
-- Devolve null a quem não tem a permissão, ou não tem local definido.
-- negocio/marca: os de app_users, ou VD / BMW por omissão (a Sales Force filtra por eles).
create or replace function public.sf_perfil_insercao()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'id', u.id::text,
           'nome', u.nome,
           'email', lower(u.email),
           'local', u.local,
           'negocio', coalesce(u.negocio, '["VD"]'::jsonb),
           'marca', coalesce(u.marca, '["BMW"]'::jsonb)
         )
  from public.app_users u
  where lower(u.email) = lower(auth.jwt() ->> 'email')
    and jsonb_typeof(u.local) = 'array' and jsonb_array_length(u.local) > 0
    and (select public.has_access('demos:inserir-viaturas', 'edit'))
  limit 1;
$$;

revoke all on function public.sf_perfil_insercao() from public, anon;
grant execute on function public.sf_perfil_insercao() to authenticated;
