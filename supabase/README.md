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
- **Exceções por email:** tabela `app_access_exceptions` (só eleva, nunca reduz),
  **única fonte** — a RLS usa-a em `access_rank` e a interface lê-a com
  `my_access_exceptions()`. Já não há cópia em `src/clients/<cliente>/config.ts`.
  Para criar uma: `insert into app_access_exceptions (email, tab, level) values
  ('alguem@x.pt', 'stock', 'edit')` (email em minúsculas).
- **Permissões por ação** (`lavagem:reagendar`, `lavagem:iniciar`,
  `lavagem:qualidade`, `lavagem:registos`): chaves `'<tab>:<ação>'` em
  `app_roles.permissions`, geridas na matriz (Utilizadores → Funções). Substituem
  as regras por NOME de função que estavam no código da Lavagem. Definidas em
  `SUB_PERMISSIONS` (`src/lib/permissions.ts`) e impostas pela RLS
  (`20261003140000`). A BD não distingue "iniciar" de "qualidade" dentro de um
  update; a interface sim.
- **Diário (prospeção):** cada vendedor só vê e altera as suas contas e tarefas
  (`owner_email`, sem distinguir maiúsculas); contactos e interações herdam da
  conta. O administrador (diretor) vê e reatribui tudo (`20261003120000`).
- **Outras aplicações no mesmo projeto:** a Caetano Sales Force partilha este
  projeto e tem as suas próprias políticas (`salesforce_users*` em `historico`,
  `viaturas`, `utilizadores`; ver `20260930141317`). As políticas somam-se (OR) e
  `apply_rls` só apaga as que a plataforma gere — nunca as de outra aplicação.
- Ao acrescentar uma tabela nova: ativar RLS e dar-lhe políticas explícitas
  (sem políticas só o service role acede). Ao acrescentar um tab: dizer em que
  tabelas lê e escreve, e acrescentar o caso a `tests/rls.test.sql`.
- Quem tem `view` num tab **não** escreve nas tabelas dele (sem a permissão por
  ação correspondente, nas áreas que as têm).

### Importações atómicas

- `replace_rows(tabela, linhas jsonb, p_allow_empty)` (`20261003110000`) substitui
  todas as linhas de `control_records`, `control_records_vu` ou `angariacoes_vu`
  numa única transação: ou entra tudo, ou fica tudo como estava.
- `import_control_excel(control, orcamento, resp)` (`20261003150000`) faz o mesmo
  para o Excel de control inteiro: registos **e** objetivos na mesma transação
  (uma falha nos objetivos desfaz também os registos).
- Ambas são `security invoker`: as políticas RLS decidem quem importa. A app usa-as
  através de `src/lib/replace-rows.ts` e `src/lib/control-records.ts`. 20 mil
  linhas demoram cerca de 1 s; o limite prático é o tamanho do pedido HTTP.
- **Compatibilidade enquanto as migrações não estão aplicadas:** se a função não
  existir (`PGRST202`), a app recorre ao caminho antigo (apagar + inserir em
  lotes), **sem atomicidade**, e regista um aviso na consola. Remover esse
  recurso (`legacyReplace` e o ramo `isMissingRpc`) quando as migrações estiverem
  aplicadas em todos os ambientes.
- Não há histórico dos snapshots anteriores: reverter uma importação *correta
  mas errada* só é possível a partir do Excel de backup.

### Compatibilidade enquanto as migrações não estão aplicadas

O código foi feito para funcionar com a base de dados **antes e depois** das
migrações, para que o deploy do frontend não dependa da ordem em que se aplicam.
São três recursos temporários, todos a remover quando as migrações estiverem
aplicadas em todos os ambientes:

| O quê | Sem a migração | Com a migração | Remover |
| --- | --- | --- | --- |
| Importar o Excel (`replace_rows`, `import_control_excel`) | caminho antigo (apagar + inserir em lotes), **sem atomicidade**, com aviso na consola | uma transação | `legacyReplace` e o ramo `isMissingRpc` em `src/lib/replace-rows.ts` e `src/lib/control-records.ts` |
| Exceções por email (`my_access_exceptions`) | cópia em `legacyTabAccessExceptions` do config do cliente | tabela `app_access_exceptions` | `legacyTabAccessExceptions` (config e tipo) e o ramo `PGRST202` de `getMyAccessExceptions` |
| Permissões da Lavagem (`app_capabilities`) | regras antigas por nome de função (Lavador, Preparador, APV) | permissões por ação na matriz | o ramo `legacy` de `src/lib/lavagem-access.ts`; passa a mostrar sempre as permissões por ação em `RolesPanel` |

A Lavagem decide pelo marcador `app_capabilities()` (criado na migração
`20261003140000`) e não pelos dados, para que um administrador que remova todas
as chaves `lavagem:*` de uma função não reative sem querer as regras por nome.
Os testes `src/test/lavagem-access.test.ts` garantem que, com a base antiga, as
permissões são exatamente as do código anterior para todas as funções.

### Testes e tipos

```sh
supabase/tests/run.sh          # RLS, importações e migração de dados
supabase/tests/gen-types.sh    # regenera src/integrations/supabase/types.ts
```

`run.sh` cria um Postgres temporário (sem Supabase), aplica `migrations/*.sql` e o
seed, e corre `rls.test.sql` (cada perfil: admin, vendedor, CV, finance, lavador,
APV, Sales Force, estranho, anon…), `import.test.sql` (atomicidade e validações) e
`lavagem.test.sql` (migração de dados). Falha se alguma política deixar de se
comportar como esperado. Corre também no CI, tal como `tsc` e a verificação de
que `types.ts` está em dia com as migrações (`gen-types.sh` + `git diff`).

### Histórico de migrações (produção)

O repositório e o histórico remoto (`supabase_migrations.schema_migrations`) têm
de usar as mesmas versões, senão o `supabase db push` tenta reaplicar migrações.
Estado a 2026-10-03 (projeto `yifxgiwmibjaornighvt`):

| Versão | Migração | Em produção |
| --- | --- | --- |
| `20260926130000` | `baseline` | reproduz a produção (não consta do histórico remoto: `repair`, abaixo) |
| `20260927174306` | `is_platform_admin` | aplicada |
| `20260930141317` | `acesso_salesforce_sem_crm` | aplicada (copiada do histórico remoto) |
| `20261002203833` | `eot_temperatura` | aplicada |
| `20261003100000` … `20261003160000` | RLS por perfil, RPCs, Diário, exceções, Lavagem, `responsavel_interno` | **por aplicar** |

Ao aplicar as últimas com o MCP/dashboard, o histórico remoto regista a versão
com a hora da aplicação, não a do ficheiro: depois, renomear os ficheiros locais
para essas versões (ou `supabase migration repair`).

`20260711140000_demo_emprestimos_responsavel_interno` (legada) **nunca foi
aplicada**: a página Empréstimos escreve `responsavel_interno` e falhava ao
guardar. A migração `20261003160000` acrescenta a coluna.

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
   matrícula) e novo projeto Vercel ligado ao mesmo
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

O esquema corresponde à baseline mais as três migrações aplicadas depois dela
(ver a tabela em «Histórico de migrações»). Faltam aplicar as de
`20261003100000` em diante, **por ordem de versão** (as seguintes dependem das
funções e da tabela criadas pela RLS por perfil). Só `replace_rows` (`…110000`) e
`responsavel_interno` (`…160000`) são independentes e aditivas, e podem ir já.
As que restringem acesso (RLS por perfil, Diário, Lavagem) devem ser verificadas
com utilizadores reais logo a seguir. O histórico de migrações remoto tem versões antigas que não existem
localmente. Antes de usar `supabase db push` contra este projeto, alinhar o
histórico:

```sh
supabase migration list                      # ver versões só remotas
supabase migration repair --status reverted <versões antigas>
supabase migration repair --status applied 20260926130000
```
