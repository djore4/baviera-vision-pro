# Supabase

## Estrutura

- `migrations/` — fonte de verdade do esquema. Começa em
  `20260926130000_baseline.sql`, que reproduz a produção a 2026-09-26
  (validado: 36 tabelas idênticas em colunas, restrições, índices, triggers e
  políticas RLS). Alterações novas entram como migrações posteriores.
- `migrations_legacy/` — migrações antigas, só para histórico. Não aplicar:
  não criavam várias tabelas (`control_records`, `demos`, `viaturas`, …).
- `seeds/new_client_defaults.sql` — perfis-modelo e ciclo de multas inicial
  para um cliente novo.
- `functions/` — edge functions.

## Criar um cliente novo

Um projeto Supabase por cliente (região UE).

1. Criar o projeto no dashboard (ou `supabase projects create`).
2. Aplicar o esquema:
   ```sh
   supabase link --project-ref <ref>
   supabase db push
   ```
3. Dados iniciais e primeiro administrador: no SQL Editor, colar o conteúdo
   de `seeds/new_client_defaults.sql` e depois
   ```sql
   insert into public.platform_admins (email) values ('admin@cliente.pt');
   ```
4. Edge functions: `supabase functions deploy` (`admin-users` usa
   `verify_jwt = false`, já definido em `config.toml`).
5. Auth: desligar "Allow new users to sign up" e ligar "Leaked password
   protection". Criar o utilizador do administrador em Authentication.
6. Frontend: novo deploy com `VITE_SUPABASE_URL`,
   `VITE_SUPABASE_PUBLISHABLE_KEY` e `VITE_SUPABASE_PROJECT_ID` do projeto.

### Ainda não parametrizado (bloqueia um segundo cliente)

- Email de admin fixo em `src/App.tsx`, `src/contexts/PermissionsContext.tsx`
  e `functions/admin-users/index.ts` (a base de dados já usa
  `platform_admins`).
- Notificações push da Prospeção: as chaves VAPID são lidas de `cs_config`,
  tabela de outra aplicação que partilha o projeto atual, e a chave pública
  está fixa em `src/lib/prospecPush.ts`. O agendamento (`pg_cron`,
  `prospec-push-15m`) é criado à mão com o URL e a chave do projeto.
- Regras do cliente atual no esquema: `objetivos_orcamento.tipo` só aceita
  `'GSC'`/`'BMW'`.

## Produção atual (Baviera)

O esquema já corresponde à baseline; não há nada a aplicar. O histórico de
migrações remoto tem versões antigas que não existem localmente. Antes de
usar `supabase db push` contra este projeto, alinhar o histórico:

```sh
supabase migration list                      # ver versões só remotas
supabase migration repair --status reverted <versões antigas>
supabase migration repair --status applied 20260926130000
```
