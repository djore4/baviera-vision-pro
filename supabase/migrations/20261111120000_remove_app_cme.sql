-- A data de Apping (app) e o CME (cme) deixaram de ser controlados.
-- O CSC passa a ser uma flag 0/1 (como QoR, xEV, BEV, M): normaliza os valores antigos.
alter table public.control_records    drop column if exists app, drop column if exists cme;
alter table public.control_records_vu drop column if exists app, drop column if exists cme;

update public.control_records    set csc = 1 where csc is not null and csc > 0;
update public.control_records_vu set csc = 1 where csc is not null and csc > 0;
