-- O ficheiro VU (Viaturas Usadas) tem um layout próprio (STATUS = FATURA/CARTEIRA)
-- com colunas específicas dos usados. Acrescenta essas colunas à control_records_vu
-- (que tinha sido criada com o schema do VN). As colunas VN que não se usam ficam,
-- mas passam a estar a NULL para os registos VU.
ALTER TABLE public.control_records_vu
  ADD COLUMN IF NOT EXISTS dt_fecho  date,
  ADD COLUMN IF NOT EXISTS prov      text,
  ADD COLUMN IF NOT EXISTS a360      integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recond    integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dgarant   text,
  ADD COLUMN IF NOT EXISTS garant3s  text;
