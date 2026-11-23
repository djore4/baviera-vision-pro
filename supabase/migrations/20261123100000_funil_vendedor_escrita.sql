-- Funil VN: o vendedor passa a poder criar, editar e eliminar os SEUS negócios.
--
-- Até aqui control_records só aceitava escrita de quem edita 'dados' ou 'database', pelo que dar
-- 'funil: edit' a um vendedor não tinha efeito (nem na interface, nem na base de dados).
--
-- Regra nova (só acrescenta; quem já escrevia continua a escrever tudo):
--   quem tem 'funil' em edição escreve numa linha de control_records se
--     * o estado (antigo e novo) é do funil: Frio, Morno ou Quente; e
--     * o RESP (antigo e novo) são as iniciais da própria pessoa.
--   Ou seja, não toca em negócios de colegas, não passa negócios para outro responsável e
--   não os move para fora do funil (Carteira, Retail, …): isso continua nos tabs de gestão.
--
-- "As iniciais da pessoa" (minhas_iniciais): as de eot_owners (fonte autoritativa, geridas no
-- End-of-Term → Responsáveis) ou, se a pessoa não estiver lá, as do nome em app_users
-- (primeira + última palavra, a mesma convenção que a interface já usa). Pelo nome só valem se
-- forem únicas entre os utilizadores: com iniciais repetidas ninguém as herda por engano.
--
-- Dá também 'funil: edit' à equipa 'BMW VN' da função 'Vendedor'. Idempotente.

create or replace function public.iniciais_do_nome(p_nome text)
returns text
language sql
immutable
set search_path = ''
as $$
  with p as (
    select regexp_split_to_array(
      btrim(upper(translate(coalesce(p_nome, ''),
        'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç',
        'AAAAAEEEEIIIIOOOOOUUUUCAAAAAEEEEIIIIOOOOOUUUUC'))),
      '\s+') as w
  )
  select nullif(
    left(w[1], 1) || case when array_length(w, 1) > 1 then left(w[array_length(w, 1)], 1) else '' end, '')
  from p;
$$;

create or replace function public.minhas_iniciais()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select array_agg(distinct upper(btrim(o.iniciais)))
       from public.eot_owners o
      where o.email = lower(auth.jwt() ->> 'email')),
    (select array[public.iniciais_do_nome(u.nome)]
       from public.app_users u
      where lower(u.email) = lower(auth.jwt() ->> 'email')
        and public.iniciais_do_nome(u.nome) is not null
        and (select count(*) from public.app_users x
              where public.iniciais_do_nome(x.nome) = public.iniciais_do_nome(u.nome)) = 1
      limit 1),
    '{}'::text[]
  );
$$;

-- O negócio é do funil e é meu (e tenho o funil em edição)?
create or replace function public.funil_negocio_meu(p_status text, p_resp text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_access('funil', 'edit')
     and coalesce(p_status, '') in ('Frio', 'Morno', 'Quente')
     and upper(btrim(coalesce(p_resp, ''))) = any (public.minhas_iniciais());
$$;

revoke all on function public.iniciais_do_nome(text), public.minhas_iniciais(), public.funil_negocio_meu(text, text)
  from public, anon;
grant execute on function public.iniciais_do_nome(text), public.minhas_iniciais(), public.funil_negocio_meu(text, text)
  to authenticated;

-- ── control_records: a escrita de sempre OU o negócio do funil que é meu ─────────────────────
drop policy if exists control_records_insert on public.control_records;
create policy control_records_insert on public.control_records for insert to authenticated
  with check (
    (select public.has_any_access(array['dados', 'database'], 'edit'))
    or (select public.funil_negocio_meu(status, resp))
  );

drop policy if exists control_records_update on public.control_records;
create policy control_records_update on public.control_records for update to authenticated
  using (
    (select public.has_any_access(array['dados', 'database'], 'edit'))
    or (select public.funil_negocio_meu(status, resp))
  )
  with check (
    (select public.has_any_access(array['dados', 'database'], 'edit'))
    or (select public.funil_negocio_meu(status, resp))
  );

drop policy if exists control_records_delete on public.control_records;
create policy control_records_delete on public.control_records for delete to authenticated
  using (
    (select public.has_any_access(array['dados', 'database'], 'edit'))
    or (select public.funil_negocio_meu(status, resp))
  );

-- ── Vendedor (equipa BMW VN): funil passa de consulta a edição ──────────────────────────────
update public.app_roles
   set permissions_equipa = jsonb_set(permissions_equipa, '{"BMW VN","funil"}', '"edit"'::jsonb)
 where name = 'Vendedor'
   and jsonb_typeof(permissions_equipa -> 'BMW VN') = 'object';
