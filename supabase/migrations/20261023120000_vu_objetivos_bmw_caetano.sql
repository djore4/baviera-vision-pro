-- Objetivos VU: dois valores por mês, objetivo BMW e orçamento Caetano.
--
--  * vu_objetivos.faturas passa a ser o orçamento Caetano (os valores que já
--    existem ficam como Caetano); vu_objetivos.bmw é o objetivo BMW (começa a 0).
--  * o novo tab 'objetivos-vu' (secção VU) é onde se definem; a escrita deixa de
--    exigir 'dados' (edit) e passa a aceitar também 'objetivos-vu' (edit).
--  * as funções que já viam/editavam a WIP VU ficam com o mesmo nível no novo tab
--    (os gauges da WIP mostram estes valores, por isso ver não revela nada novo).

alter table public.vu_objetivos
  add column if not exists bmw numeric not null default 0;

comment on column public.vu_objetivos.faturas is 'Orçamento Caetano (nº de faturas VU no mês).';
comment on column public.vu_objetivos.bmw is 'Objetivo BMW (nº de faturas VU no mês).';

drop policy if exists vu_objetivos_insert on public.vu_objetivos;
drop policy if exists vu_objetivos_update on public.vu_objetivos;
drop policy if exists vu_objetivos_delete on public.vu_objetivos;

create policy vu_objetivos_insert on public.vu_objetivos for insert to authenticated
  with check ((select public.has_any_access(array['objetivos-vu', 'dados'], 'edit')));
create policy vu_objetivos_update on public.vu_objetivos for update to authenticated
  using ((select public.has_any_access(array['objetivos-vu', 'dados'], 'edit')))
  with check ((select public.has_any_access(array['objetivos-vu', 'dados'], 'edit')));
create policy vu_objetivos_delete on public.vu_objetivos for delete to authenticated
  using ((select public.has_any_access(array['objetivos-vu', 'dados'], 'edit')));

update public.app_roles
set permissions = permissions || jsonb_build_object('objetivos-vu', permissions ->> 'wip')
where permissions ->> 'wip' in ('view', 'edit')
  and not (permissions ? 'objetivos-vu');
