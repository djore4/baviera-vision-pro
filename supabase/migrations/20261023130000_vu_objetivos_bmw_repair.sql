-- Reparação de 20261023120000_vu_objetivos_bmw_caetano.sql.
--
-- Essa migração não chegou a ser aplicada em produção (o guardar dos objetivos VU
-- falhava com "Could not find the 'bmw' column of 'vu_objetivos'") e foi aplicada
-- à mão em passos. Esta migração repõe o mesmo estado final e é idempotente: onde
-- a anterior já correu não altera nada. Usa ALTER POLICY em vez de DROP/CREATE.

alter table public.vu_objetivos
  add column if not exists bmw numeric not null default 0;

comment on column public.vu_objetivos.faturas is 'Orçamento Caetano (nº de faturas VU no mês).';
comment on column public.vu_objetivos.bmw is 'Objetivo BMW (nº de faturas VU no mês).';

alter policy vu_objetivos_insert on public.vu_objetivos
  with check ((select public.has_any_access(array['objetivos-vu', 'dados'], 'edit')));
alter policy vu_objetivos_update on public.vu_objetivos
  using ((select public.has_any_access(array['objetivos-vu', 'dados'], 'edit')))
  with check ((select public.has_any_access(array['objetivos-vu', 'dados'], 'edit')));
alter policy vu_objetivos_delete on public.vu_objetivos
  using ((select public.has_any_access(array['objetivos-vu', 'dados'], 'edit')));

update public.app_roles
set permissions = permissions || jsonb_build_object('objetivos-vu', permissions ->> 'wip')
where permissions ->> 'wip' in ('view', 'edit')
  and not (permissions ? 'objetivos-vu');
