-- Perfil APV: Maia e Porto passam a ter a mesma matriz que Aveiro (todas as equipas).
-- (Já aplicada na base de dados como "apv_matriz_maia_porto"; mantida aqui para o histórico.)
update public.app_roles
   set permissions_matriz = permissions_matriz
         || jsonb_build_object('Maia', permissions_matriz->'Aveiro', 'Porto', permissions_matriz->'Aveiro'),
       updated_at = now()
 where name = 'APV' and permissions_matriz ? 'Aveiro';
