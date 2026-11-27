-- Tab Contratos (Transversal): tabelas de preços dos contratos de manutenção (BSI/MSI) e da extensão
-- de garantia, para consulta das equipas comerciais. Só leitura, sem tabelas novas.
-- Dá 'view' em "contratos" a cada célula (local × equipa) de cada perfil que já tem acesso ao Produto
-- (o outro tab de consulta do catálogo). Não mexe em perfis de administrador nem onde já haja valor.
-- Idempotente; o resto ajusta-se na matriz do tab Utilizadores.
update public.app_roles r
   set permissions_matriz = (
         select coalesce(jsonb_object_agg(l.key, coalesce((
           select jsonb_object_agg(
                    e.key,
                    case when e.value->>'produto' in ('view', 'edit') and not (e.value ? 'contratos')
                         then e.value || '{"contratos":"view"}'::jsonb
                         else e.value end)
             from jsonb_each(l.value) e
         ), '{}'::jsonb)), '{}'::jsonb)
           from jsonb_each(r.permissions_matriz) l
       ),
       updated_at = now()
 where r.modelo_matriz
   and not r.is_admin
   and jsonb_typeof(r.permissions_matriz) = 'object'
   and r.permissions_matriz <> '{}'::jsonb;
