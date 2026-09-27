-- Remove as colunas LOCAL, ORIGIN e PROFILE da tabela control_records.
--   * A informação destas colunas deixou de ser recolhida no ficheiro Excel
--     (sheet CONTROL) e todas as tabelas/gráficos/filtros que dependiam delas
--     foram removidos da aplicação.
--   * A partir deste ponto o Excel é carregado já sem estas colunas.
--
-- Nota: control_records é normalmente gerida fora das migrações (ver seed).
-- Correr esta instrução no Supabase (Project > SQL Editor) para alinhar o
-- esquema da base de dados com a nova estrutura do ficheiro Excel.
ALTER TABLE public.control_records
  DROP COLUMN IF EXISTS local,
  DROP COLUMN IF EXISTS origin,
  DROP COLUMN IF EXISTS profile;
