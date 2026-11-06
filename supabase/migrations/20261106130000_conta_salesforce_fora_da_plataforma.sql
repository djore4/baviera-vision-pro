-- A conta partilhada da Sales Force (caetanosalesforce@caetano.pt) não pode ter
-- acesso ao Baviera Vision Pro, mas mantém o acesso à Caetano Sales Force.
--
-- Utilizador da plataforma = email em app_users ou platform_admins; todas as
-- funções de acesso (is_platform_user, is_app_admin, access_rank, has_any_tab…) e,
-- por isso, todas as políticas RLS e a interface derivam destas duas tabelas
-- e de app_access_exceptions. Retirar a conta daí corta o acesso a tudo.
--
-- O acesso da Sales Force NÃO é tocado: assenta em `utilizadores`
-- (is_salesforce_user, migração acesso_salesforce_sem_crm) e em nenhuma destas tabelas.

delete from public.app_users             where lower(email) = 'caetanosalesforce@caetano.pt';
delete from public.platform_admins       where lower(email) = 'caetanosalesforce@caetano.pt';
delete from public.app_access_exceptions where lower(email) = 'caetanosalesforce@caetano.pt';

-- Impede que volte a ser criada (ex.: pelo tab Utilizadores / edge function admin-users).
create or replace function public.bloquear_contas_fora_da_plataforma()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if lower(new.email) = any (array['caetanosalesforce@caetano.pt']) then
    raise exception 'A conta % não pode ter acesso a esta plataforma', new.email
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists bloquear_conta_app_users on public.app_users;
create trigger bloquear_conta_app_users
  before insert or update of email on public.app_users
  for each row execute function public.bloquear_contas_fora_da_plataforma();

drop trigger if exists bloquear_conta_platform_admins on public.platform_admins;
create trigger bloquear_conta_platform_admins
  before insert or update of email on public.platform_admins
  for each row execute function public.bloquear_contas_fora_da_plataforma();

drop trigger if exists bloquear_conta_access_exceptions on public.app_access_exceptions;
create trigger bloquear_conta_access_exceptions
  before insert or update of email on public.app_access_exceptions
  for each row execute function public.bloquear_contas_fora_da_plataforma();
