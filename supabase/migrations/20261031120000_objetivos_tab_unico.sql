-- Objetivos VN e VU passam a um só tab ('objetivos', secção Transversal).
--
--  * vu_objetivos: a escrita aceita também o tab 'objetivos' (edit), além de
--    'objetivos-vu' e 'dados'. A chave antiga fica aceite por segurança durante a
--    transição (código antigo ainda a usa); pode ser retirada mais tarde.
--  * objetivos_orcamento / objetivos_resp já aceitam 'objetivos' (edit): sem alterações.
--  * as funções com 'objetivos-vu' ficam com o mesmo nível no tab 'objetivos'
--    (hoje só o perfil 'CV VU'). Não se apaga a chave antiga.

drop policy if exists vu_objetivos_insert on public.vu_objetivos;
drop policy if exists vu_objetivos_update on public.vu_objetivos;
drop policy if exists vu_objetivos_delete on public.vu_objetivos;

create policy vu_objetivos_insert on public.vu_objetivos for insert to authenticated
  with check ((select public.has_any_access(array['objetivos', 'objetivos-vu', 'dados'], 'edit')));
create policy vu_objetivos_update on public.vu_objetivos for update to authenticated
  using ((select public.has_any_access(array['objetivos', 'objetivos-vu', 'dados'], 'edit')))
  with check ((select public.has_any_access(array['objetivos', 'objetivos-vu', 'dados'], 'edit')));
create policy vu_objetivos_delete on public.vu_objetivos for delete to authenticated
  using ((select public.has_any_access(array['objetivos', 'objetivos-vu', 'dados'], 'edit')));

update public.app_roles
set permissions = permissions || jsonb_build_object('objetivos', permissions ->> 'objetivos-vu')
where permissions ->> 'objetivos-vu' in ('view', 'edit')
  and not (permissions ? 'objetivos');
