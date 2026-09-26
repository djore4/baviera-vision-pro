-- Coluna RET (retoma) na tabela control_records.
--   * ret = indica se o processo tem retoma (viatura usada dada como parte do
--     pagamento). Preenchida no ficheiro Excel (sheet CONTROL, coluna "RET"):
--     1 = processo com retoma; 0 ou vazio = sem retoma. Importada pela app e
--     usada como filtro nos separadores Retails, Produção e Carteira.
--
-- Nota: control_records é normalmente gerida fora das migrações (ver seed).
-- Correr esta instrução no Supabase (Project > SQL Editor) ANTES do próximo
-- upload do Excel, para que a retoma seja gravada em vez de rejeitada.
ALTER TABLE public.control_records
  ADD COLUMN IF NOT EXISTS ret smallint NOT NULL DEFAULT 0;
