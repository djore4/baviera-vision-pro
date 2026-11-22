-- Função única 'Vendedor' com o acesso diferenciado pela equipa (app_users.equipa).
--
-- Mantém EXATAMENTE os acessos atuais:
--   base (comum às duas funções antigas) ........ demos, lavagem, produto, instalacoes (view); end-of-term, ficha-margem (edit)
--   camada 'BMW VN' (o que só 'Vendedor VN' tinha) funil, retails, carteira, producao, marketing, vendedores (view);
--                                                  escala, multas, prospecao, campanha-i3 (edit)
--   camada 'BMW VU' (o que só 'Vendedor VU' tinha) wip, stock, funil-vu, escala-vu, angariacao (view); prospecao (none)
-- Quem fique sem equipa só tem a base. Os utilizadores passam de perfil e recebem a equipa correspondente;
-- as funções antigas ficam intactas (sem utilizadores) até o administrador as apagar. Idempotente.
-- Pré-requisito: 20261122100000_permissoes_por_equipa.sql e a interface que a lê.

insert into public.app_roles (name, is_admin, permissions, permissions_local, permissions_equipa)
values (
  'Vendedor', false,
  '{"demos":"view","lavagem":"view","produto":"view","instalacoes":"view","end-of-term":"edit","ficha-margem":"edit"}'::jsonb,
  '{}'::jsonb,
  '{
    "BMW VN": {"funil":"view","retails":"view","carteira":"view","producao":"view","marketing":"view","vendedores":"view",
               "escala":"edit","multas":"edit","prospecao":"edit","campanha-i3":"edit"},
    "BMW VU": {"wip":"view","stock":"view","funil-vu":"view","escala-vu":"view","angariacao":"view","prospecao":"none"}
  }'::jsonb
)
on conflict (name) do nothing;

update public.app_users set equipa = 'BMW VN' where perfil = 'Vendedor VN' and equipa is null;
update public.app_users set equipa = 'BMW VU' where perfil = 'Vendedor VU' and equipa is null;
update public.app_users set perfil = 'Vendedor' where perfil in ('Vendedor VN', 'Vendedor VU');
