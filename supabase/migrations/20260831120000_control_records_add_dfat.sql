-- Coluna DFAT (data de fatura) na tabela control_records.
--   * dfat = data em que a viatura foi faturada. Preenchida no ficheiro Excel
--     (sheet CONTROL, coluna "DFAT") e importada pela app; usada nas tabelas
--     "Detalhe" dos separadores Produção e Retails e, futuramente, como KPI.
--
-- Nota: control_records é normalmente gerida fora das migrações (ver seed).
-- Correr esta instrução no Supabase (Project > SQL Editor) ANTES do próximo
-- upload do Excel, para que a data de fatura seja gravada em vez de rejeitada.
ALTER TABLE public.control_records
  ADD COLUMN IF NOT EXISTS dfat date;
