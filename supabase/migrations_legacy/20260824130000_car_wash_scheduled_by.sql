-- Interlocutor do agendamento: quem agendou (ou reagendou) a lavagem.
-- Permite saber, na slot da agenda, com quem falar sobre a marcação.
ALTER TABLE public.car_wash_cycles
  ADD COLUMN IF NOT EXISTS scheduled_by text;
