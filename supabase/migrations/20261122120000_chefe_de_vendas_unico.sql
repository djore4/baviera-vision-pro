-- Função única 'Chefe de Vendas' (substitui 'Chefe de Vendas VN' e 'Chefe de Vendas VU'), com o
-- acesso diferenciado pela equipa (app_users.equipa). Sem alterar o acesso de ninguém:
--   base ........... vazia (o 'Chefe de Vendas VN' não tinha nenhum tab)
--   camada BMW VN .. vazia
--   camada BMW VU .. a matriz que o 'Chefe de Vendas VU' tinha (copiada da função)
-- Os utilizadores passam de perfil e recebem a equipa correspondente. As funções antigas ficam
-- intactas (sem utilizadores) até o administrador as apagar. 'Chefe de Vendas Motorrad' não muda.
-- Pré-requisito: 20261122100000_permissoes_por_equipa.sql. Idempotente.

insert into public.app_roles (name, is_admin, permissions, permissions_local, permissions_equipa)
select 'Chefe de Vendas', false, '{}'::jsonb, '{}'::jsonb,
       jsonb_build_object('BMW VN', '{}'::jsonb, 'BMW VU', vu.permissions)
from public.app_roles vu where vu.name = 'Chefe de Vendas VU'
on conflict (name) do nothing;

update public.app_users set equipa = 'BMW VN' where perfil = 'Chefe de Vendas VN' and equipa is null;
update public.app_users set equipa = 'BMW VU' where perfil = 'Chefe de Vendas VU' and equipa is null;
update public.app_users set perfil = 'Chefe de Vendas' where perfil in ('Chefe de Vendas VN', 'Chefe de Vendas VU');
