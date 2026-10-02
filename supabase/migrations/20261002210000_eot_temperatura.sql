-- Temperatura do negócio (Frio / Morno / Quente), classificada pelo vendedor.
-- Coluna nova e opcional; a reimportação do mapa (upsert por contrato) não lhe toca.
alter table public.eot_contracts
  add column if not exists temperatura text;

alter table public.eot_contracts
  drop constraint if exists eot_contracts_temperatura_check;
alter table public.eot_contracts
  add constraint eot_contracts_temperatura_check
  check (temperatura is null or temperatura in ('frio', 'morno', 'quente'));
