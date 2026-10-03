-- Dados iniciais para um cliente novo (correr uma vez, depois da baseline).
--
-- Perfis-modelo com a matriz de permissões por tab. Ajustar aos nomes e
-- funções do cliente no tab Utilizadores; o perfil Administrador é o único
-- obrigatório.
insert into public.app_roles (name, is_admin, permissions) values
  ('Administrador', true, '{}'),
  ('Vendedor VN', false, '{"funil": "view", "escala": "view", "lavagem": "view", "retails": "view", "carteira": "view", "producao": "view", "prospecao": "view", "vendedores": "view", "ficha-margem": "view"}'),
  ('Vendedor VU', false, '{"wip": "view", "stock": "view", "lavagem": "view", "funil-vu": "view", "escala-vu": "view", "angariacao": "view"}'),
  ('CV VU', false, '{"wip": "edit", "dados": "view", "funil": "view", "stock": "edit", "escala": "view", "retails": "view", "carteira": "view", "funil-vu": "view", "producao": "view", "escala-vu": "edit", "prospecao": "view", "angariacao": "edit", "vendedores": "view", "ficha-margem": "view"}'),
  ('Finance', false, '{"carteira": "view", "producao": "view", "end-of-term": "edit"}'),
  ('Secretaria', false, '{"retails": "view", "carteira": "view", "producao": "view", "ficha-margem": "edit"}'),
  ('Gestor de Serviço', false, '{"lavagem": "edit"}'),
  ('Preparador', false, '{"lavagem": "edit", "lavagem:reagendar": "edit", "lavagem:qualidade": "edit", "retails": "view", "carteira": "view", "producao": "view"}'),
  ('Lavador', false, '{"lavagem": "view", "lavagem:iniciar": "edit"}')
on conflict (name) do nothing;

-- Ciclo de multas inicial (penalties.cycle_id tem default 1).
insert into public.penalty_cycles (id) values (1) on conflict do nothing;
