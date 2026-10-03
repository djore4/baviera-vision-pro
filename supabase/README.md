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

## Permissões (RLS por perfil)

A matriz de permissões (`app_roles.permissions`, tab → `view`/`edit`) é imposta
pela base de dados, não só pela interface. `20261003100000_rls_por_perfil.sql`
define as funções `has_access(tab, nível)`, `has_any_access(tabs, nível)`,
`has_any_tab()` e `is_app_admin()`, e uma política por operação em cada tabela
(ver o mapa tabela → tabs no cabeçalho de cada bloco da migração). O storage
segue a mesma lógica (`can_write_excel_file(nome)` decide por ficheiro).

- Admin = email em `platform_admins` **ou** perfil com `is_admin`: `edit` em tudo.
- Exceções por email: tabela `app_access_exceptions` (só eleva, nunca reduz).
  Espelha `tabAccessExceptions` do `config.ts` do cliente — **manter as duas em
  sincronia** até a UI passar a ler da BD.
- Ao acrescentar uma tabela nova: ativar RLS e dar-lhe políticas explícitas
  (sem políticas só o service role acede). Ao acrescentar um tab: dizer em que
  tabelas lê e escreve, e acrescentar o caso a `tests/rls.test.sql`.
- Limitações: `lavagem` — a UI decide algumas ações pelo nome do perfil
  (Lavador, Preparador, APV); a BD só distingue `view`/`edit`. `prospecao` — o
  isolamento por vendedor (cada um só vê as suas contas) continua na aplicação.
  Quem tem `view` num tab **não** escreve nas tabelas dele, exceto em `lavagem`
  e `prospecao`, onde `view` basta para operar.

### Importações atómicas

`replace_rows(tabela, linhas jsonb, p_allow_empty)` (migração
`20261003110000`) substitui todas as linhas de `control_records`,
`control_records_vu` ou `angariacoes_vu` numa única transação: ou entra tudo, ou
fica tudo como estava. É `security invoker`, por isso as políticas RLS decidem
quem importa. A app usa-a através de `src/lib/replace-rows.ts`. Uma chamada com
20 mil linhas demora cerca de 1 s; o limite prático é o tamanho do pedido HTTP,
não a BD. Não há histórico dos snapshots anteriores: se for preciso reverter uma
importação *correta mas errada*, tem de vir do Excel de backup.

### Testes

```sh
supabase/tests/run.sh
```

Cria um Postgres temporário (sem Supabase), aplica `migrations/*.sql` e o seed, e
corre `tests/rls.test.sql` como cada perfil (admin, vendedor, CV, finance,
lavador, estranho, anon…). Falha se alguma política deixar de se comportar como
esperado. Corre também no CI.

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
6. Frontend: configuração do cliente em `src/clients/<id>/config.ts` (nome,
   logótipo, cores, tipo de letra, tabs desativados, destinatários da
   matrícula, exceções de acesso) e novo projeto Vercel ligado ao mesmo
   repositório, com `VITE_CLIENT=<id>`, `VITE_SUPABASE_URL`,
   `VITE_SUPABASE_PUBLISHABLE_KEY` e `VITE_SUPABASE_PROJECT_ID` do projeto.
   Sem `VITE_CLIENT` a instalação é a Baviera.

### Ainda não parametrizado (bloqueia um segundo cliente)

- Notificações push da Prospeção: as chaves VAPID são lidas de `cs_config`,
  tabela de outra aplicação que partilha o projeto atual, e a chave pública
  está fixa em `src/lib/prospecPush.ts`. O agendamento (`pg_cron`,
  `prospec-push-15m`) é criado à mão com o URL e a chave do projeto.
- Regras do cliente atual no esquema: `objetivos_orcamento.tipo` só aceita
  `'GSC'`/`'BMW'` (e os ecrãs de Objetivos, Produção e Retails usam esses
  nomes).
- Módulos da Baviera ainda no núcleo: Bónus BMW (ficha de margem), "Link
  Caetano" no Stock, importação dos Excel do DMS da Caetano.

## Produção atual (Baviera)

O esquema já corresponde à baseline; não há nada a aplicar. O histórico de
migrações remoto tem versões antigas que não existem localmente. Antes de
usar `supabase db push` contra este projeto, alinhar o histórico:

```sh
supabase migration list                      # ver versões só remotas
supabase migration repair --status reverted <versões antigas>
supabase migration repair --status applied 20260926130000
```
