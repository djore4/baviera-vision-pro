-- Web Push para a Prospeção: subscrições de dispositivos + registo de envios
-- (dedup). Tabelas FECHADAS: RLS ativo sem políticas, só a service role
-- (edge functions) lê/escreve — o browser passa sempre pela função prospec-subscribe.
-- Reutiliza as chaves VAPID já existentes em cs_config.

CREATE TABLE IF NOT EXISTS public.prospec_push_subs (
  endpoint    text PRIMARY KEY,
  p256dh      text NOT NULL,
  auth        text NOT NULL,
  user_email  text,                        -- destinatário (âmbito das tarefas)
  ua          text,
  last_ok     timestamptz,
  fail_count  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS prospec_push_subs_email_idx ON public.prospec_push_subs (lower(user_email));
ALTER TABLE public.prospec_push_subs ENABLE ROW LEVEL SECURITY;

-- Dedup de envios: uma notificação por referência (tarefa/conta), por
-- destinatário, por dia. day_key = 'YYYY-MM-DD' (Europa/Lisboa) para tarefas;
-- day_key = 'acct' (sentinela "uma vez para sempre") para novos clientes.
CREATE TABLE IF NOT EXISTS public.prospec_push_sent (
  day_key     text NOT NULL,
  ref         text NOT NULL,               -- 'task:<id>' | 'acct:<id>'
  user_email  text NOT NULL,
  sent_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (day_key, ref, user_email)
);
ALTER TABLE public.prospec_push_sent ENABLE ROW LEVEL SECURITY;

-- Agendamento (pg_cron): corre o emissor de 15 em 15 minutos.
-- select cron.schedule('prospec-push-15m', '*/15 * * * *', $$
--   select net.http_post(
--     url := 'https://<PROJECT_REF>.supabase.co/functions/v1/prospec-push',
--     headers := jsonb_build_object('Content-Type','application/json',
--       'apikey','<PUBLISHABLE_KEY>','Authorization','Bearer <PUBLISHABLE_KEY>'),
--     body := '{}'::jsonb, timeout_milliseconds := 120000);
-- $$);
