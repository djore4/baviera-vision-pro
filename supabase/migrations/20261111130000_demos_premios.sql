-- Demos: prémio de venda por viatura (estímulo à venda), que acresce à comissão fixa por modelo.
-- Tabela própria (a tabela `viaturas` é partilhada com a plataforma Caetano e não se altera).
--  * Ler: quem vê o tab Demos (o vendedor tem de ver o prémio).
--  * Escrever (inserir/alterar/apagar): administrador, ou quem tem 'demos:precos' (edit) nas viaturas
--    dos seus locais — as mesmas pessoas que gerem os preços.
-- Depende de 20261109211511 (viatura_do_meu_local) e 20261109211555 (demos:precos).

create table if not exists public.demos_premios (
  chassis text not null,
  premio numeric not null check (premio > 0 and premio <= 100000),
  updated_by text,
  updated_at timestamp with time zone default now() not null,
  constraint demos_premios_pkey primary key (chassis)
);

alter table public.demos_premios enable row level security;

drop policy if exists demos_premios_select on public.demos_premios;
create policy demos_premios_select on public.demos_premios
  for select to authenticated
  using ((select public.is_app_admin()) or ((select public.has_access('demos')) and (select public.viatura_do_meu_local(chassis))));

drop policy if exists demos_premios_insert on public.demos_premios;
create policy demos_premios_insert on public.demos_premios
  for insert to authenticated
  with check ((select public.is_app_admin())
    or ((select public.has_access('demos:precos', 'edit')) and (select public.viatura_do_meu_local(chassis))));

drop policy if exists demos_premios_update on public.demos_premios;
create policy demos_premios_update on public.demos_premios
  for update to authenticated
  using ((select public.is_app_admin())
    or ((select public.has_access('demos:precos', 'edit')) and (select public.viatura_do_meu_local(chassis))))
  with check ((select public.is_app_admin())
    or ((select public.has_access('demos:precos', 'edit')) and (select public.viatura_do_meu_local(chassis))));

drop policy if exists demos_premios_delete on public.demos_premios;
create policy demos_premios_delete on public.demos_premios
  for delete to authenticated
  using ((select public.is_app_admin())
    or ((select public.has_access('demos:precos', 'edit')) and (select public.viatura_do_meu_local(chassis))));

grant select, insert, update, delete on public.demos_premios to authenticated;
