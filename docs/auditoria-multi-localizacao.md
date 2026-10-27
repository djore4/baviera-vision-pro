# Auditoria: expandir para outros stands do mesmo grupo

Âmbito: outros stands do mesmo grupo, mesma marca, equipas similares, **na mesma instalação** (um só Supabase / um só deploy). Só leitura de código e migrações; nada foi alterado.

Base: `supabase/migrations/*` (baseline + 18 migrações), `src/**`, `src/clients/baviera/config.ts`. Não li a lógica interna de todas as páginas; as linhas marcadas **(a confirmar)** assentam em inferência e devem ser validadas com quem usa o tab.

---

## 1. Conclusão em 6 pontos

1. **Nenhuma tabela de negócio tem hoje coluna de localização.** O que existe são vestígios: `demos.local` (texto), `viaturas.local` (jsonb, tabela partilhada com a app Caetano), `eot_owners.locais` (text[]), `app_users.local` (jsonb, **não usado pela RLS**) e `eot_contracts.local` (calculado a partir do nome do concessionário).
2. **A RLS é por tab, não por linha.** `has_access('tab')` abre *todas* as linhas da tabela. Só o Diário (`owner_email`) e o EoT (dono/equipa) filtram por linha, e filtram por **pessoa**, não por stand.
3. **O maior bloqueio não é a RLS, é a importação.** `control_records`, `control_records_vu` e `angariacoes_vu` são carregadas com `replace_rows` / `import_control_excel`: **apaga tudo e insere o snapshot** numa transação. Se o stand B importar o seu Excel, apaga os dados do stand A. O mesmo vale para os ficheiros fixos do storage (`bmw-business-control.xlsx`, `escala-*.json`).
4. **Há chaves primárias/únicas sem localização** que colidem entre stands: `vu_objetivos(mes)`, `objetivos_orcamento(ano,mes,tipo)`, `quality_scores(year,month,vendedor)`, `objetivos_resp(ano,mes,responsavel)`.
5. **A identidade é por nome em texto** (`resp`, `vendedor`, `responsavel`), não por id de utilizador. Dois "João Silva" em stands diferentes misturam objetivos e qualidade.
6. **Há precedente útil e um aviso.** O EoT já lida com vários locais (Aveiro, Gaia…), mas a migração `20261016120000_eot_equipas` **abandonou a RLS por local** e passou para equipa, e removeu `eot_contracts.local` da RLS. Deduzir o local a partir de texto livre (`eot_local_of` com regex sobre o nome do concessionário) foi frágil. A solução definitiva tem de ser uma **chave explícita**, não texto parseado.

Legenda de esforço: **0** = nada a fazer · **S** = pequeno · **M** = médio · **L** = grande · **XL** = redesenho.

---

## 2. Matriz de tabelas

Âmbito alvo: **G** global do grupo · **L** por localização · **U** por utilizador (já isolado) · **L+G** por localização com vista consolidada para direção.

### 2.1 Identidade e acessos

| Tabela | Tab(s) | Chave / dono hoje | Localização hoje | Alvo | Esforço | Notas |
|---|---|---|---|---|---|---|
| `app_users` | Utilizadores | email | `local`, `negocio`, `marca` jsonb livres, não usados pela RLS | G + nova tabela `user_locations` | M | É o ponto de partida: substituir o jsonb por associação estruturada utilizador↔localização (N:N, há quem trabalhe em dois stands). |
| `app_roles` | Utilizadores | name | — | G | 0 | Funções partilhadas pelo grupo. Se um stand precisar de funções próprias, é decisão de produto. |
| `app_access_exceptions` | — | (email, tab) | — | G (ou L) | S | Exceção por tab; se uma exceção devesse valer só num stand, ganha `location_id`. |
| `platform_admins` | — | email | — | G | 0 | Super-admin do grupo. |
| `utilizadores` | — (legado) | id | `local` jsonb | — | 0 | Legada, só admin. Candidata a remoção. |

### 2.2 Vendas VN

| Tabela | Tab(s) | Chave / dono hoje | Localização hoje | Alvo | Esforço | Notas |
|---|---|---|---|---|---|---|
| `control_records` | WIP/Retails, Funil, Produção, Carteira, Performance, Pendentes, Database, Dados | uuid; `resp` texto | **nenhuma**; importação = replace total | **L+G** | **XL** | O núcleo. Precisa de `location_id`, de importação com *replace por localização*, e de todos os dashboards (`useData()`) com seletor de âmbito. Nada de VN funciona sem isto. |
| `objetivos_orcamento` | Objetivos | unique (ano, mes, tipo GSC/BMW) | nenhuma | L | M | Orçamento por mês é por stand. Muda a constraint. `tipo` BMW/GSC mantém-se (mesma marca). |
| `objetivos_resp` | Objetivos, Performance | unique (ano, mes, responsavel texto) | nenhuma; implícita no nome | L (via vendedor) | M | Resolve-se melhor ligando o vendedor a um id/localização do que repetindo o nome. |
| `quality_scores` | Performance (radar) | PK (year, month, vendedor texto) | nenhuma | L (via vendedor) | M | Mesmo problema de identidade por nome. |
| `infractions` | Multas | uuid | nenhuma | G | 0 | Catálogo de infrações; global. |
| `penalty_cycles` | Multas | int | nenhuma | L | S | Ciclo de multas por stand **(a confirmar)**. |
| `penalties` | Multas | `resp` texto | nenhuma | L (via vendedor) | S | Arquivado (Arquivo). |
| `historico` | Diário / auditoria | bigint | nenhuma | L ou G | S | Registo de ações; só precisa de local se for consultado por stand. |
| `crm_notes`, `crm_reminders` | — | `resp` | nenhuma | — | 0 | Sem uso na app, só admin. Candidatas a remoção. |

### 2.3 Vendas VU

| Tabela | Tab(s) | Chave / dono hoje | Localização hoje | Alvo | Esforço | Notas |
|---|---|---|---|---|---|---|
| `control_records_vu` | WIP VU, Funil VU, Performance | uuid; `resp` texto | **nenhuma**; importação = replace total | **L+G** | **XL** | Mesmo problema do VN. |
| `vu_objetivos` | Objetivos VU, WIP VU | **PK = mes** (texto) | nenhuma | L | **L** | A PK precisa de passar a (mes, location_id): migração de chave primária numa tabela em uso. |
| `angariacoes_vu` | Angariação | uuid; replace total | nenhuma | L | L | Importação snapshot, como o control. |
| `retomas` | Stock VU | uuid | nenhuma | L | M | O stock de usados é físico, por stand. |

### 2.4 Demos, parque e empréstimos

| Tabela | Tab(s) | Chave / dono hoje | Localização hoje | Alvo | Esforço | Notas |
|---|---|---|---|---|---|---|
| `viaturas` | Demos | chassis | **`local` jsonb (já existe)** | L + G | M | Partilhada com a app Caetano Sales Force (só leitura aqui). Já é a única tabela quase pronta. O filtro por defeito `'Aveiro'` está hardcoded em `DemosPage.tsx:366`. |
| `demos` | Demos, Empréstimos | uuid | `local` texto | L | S | Já tem coluna; falta normalizá-la para o id de localização. |
| `demo_emprestimos` | Empréstimos | uuid | via `demo_id` | L (herda) | S | |
| `demo_capas` | Demos | chassis | — | G | 0 | Chassis é único globalmente. |
| `demo_pessoas`, `demo_afetacoes` | — | | | — | 0 | Sem uso, só admin. |

### 2.5 End-of-Term

| Tabela | Tab(s) | Chave / dono hoje | Localização hoje | Alvo | Esforço | Notas |
|---|---|---|---|---|---|---|
| `eot_contracts` | End-of-Term | PK `contrato` (global) | `local` calculado de texto livre | L+G | M | **Já está o mais perto.** Substituir o texto parseado por `location_id` explícito. Isolamento hoje por dono/equipa. |
| `eot_activities` | End-of-Term | `owner_email` | herda | U / L | S | |
| `eot_owners` | End-of-Term | email | `locais text[]` | G + ligação a localização | S | `chefe_email` já modela equipa. |
| `eot_vendedor_map` | End-of-Term | nome do Excel → responsável | — | G ou L | S | Já prevê homónimos "em locais diferentes". |

### 2.6 Diário (prospeção)

| Tabela | Tab(s) | Chave / dono hoje | Localização hoje | Alvo | Esforço | Notas |
|---|---|---|---|---|---|---|
| `prospec_accounts`, `_tasks` | Diário | `owner_email`, RLS por dono | — | **U** | **0** | Já isolado por utilizador; é indiferente ao stand. Está arquivado "para já". |
| `prospec_contacts`, `_interactions` | Diário | herda da conta | — | U | 0 | |
| `prospec_push_subs`, `_push_sent` | Diário (push) | email | — | G | 0 | Só service role. |

### 2.7 Transversal

| Tabela | Tab(s) | Chave / dono hoje | Localização hoje | Alvo | Esforço | Notas |
|---|---|---|---|---|---|---|
| `car_wash_cycles` | Lavagem | uuid, matrícula | nenhuma | L | M | O estaleiro de lavagem é físico, **por stand**. A agenda e a fila (`queue_order`) não podem ser partilhadas. |
| `car_wash_events` | Lavagem (auditoria) | uuid | nenhuma | L (herda) | S | |
| `instalacoes_ocorrencias` | Instalações | uuid; `piso` texto | nenhuma; plantas vêm de `client.plantas` | L | M | As plantas estão na **config do cliente** (`piso-0`, `piso-1`): passam a depender da localização. |
| `instalacoes_historico` | Instalações | via ocorrência | herda | L | S | |
| `notifications` | sino | `audience` = 'all' ou nome de tab | nenhuma | G (+L opcional) | S | Avisos gerais ao grupo; filtrar por stand só se for pedido. |
| `notification_reads` | sino | (notificação, email) | — | U | 0 | |
| Catálogo Produto (`modelos`, `op_*`, …) | Produto | — | **projeto Supabase externo** | G | 0 | Já é global e fora desta base. |

### 2.8 Storage e funções

| Item | Uso | Problema | Alvo | Esforço |
|---|---|---|---|---|
| `excel-files/bmw-business-control.xlsx` | Backup/fallback do Excel de control | Nome fixo, um por instalação | prefixo por localização | S |
| `excel-files/escala-teste.json`, `escala-vu.json`, `escala-repsol.json` | Escalas | Nome fixo; `can_write_excel_file()` decide pelo nome | pasta por localização + atualizar a função | M |
| `demo-capas` | Capas das demos | Por chassis | G | 0 |
| Edge `admin-users` | Criar/editar utilizadores e funções | Sem noção de localização | aceitar localizações ao criar utilizador | S |
| Edge `foto-preview`, `prospec-*` | Utilitários | — | G | 0 |

### 2.9 Código com valores do stand fixos

| Onde | O quê | Esforço |
|---|---|---|
| `src/clients/baviera/config.ts` | `loginSubtitle: "…equipa de Aveiro"`, `documentHeader: "Caetano BMW Aveiro"`, destinatários de matrícula (`matricula.to/cc`), plantas | M — passa a ser por localização, não por cliente |
| `DemosPage.tsx` | Filtro por defeito `'Aveiro'` | S |
| `EndOfTermPage.tsx` | `DEFAULT_LOCAL = 'Aveiro'` | S |
| `EscalaBoard.tsx` e páginas de escala | Equipa e ficheiro JSON únicos; `RETIRED_MEMBERS` em `team.ts` | M |
| `EstacionamentoMap.tsx` | Mapa de estacionamento de Aveiro | M (ou deixar por stand) |
| `objetivos.ts` | `tipo` GSC/BMW | 0 (mesma marca) |

---

## 3. O que a matriz diz

**Resumo por tipo de trabalho**

| Tipo | Tabelas | Observação |
|---|---|---|
| Já resolvido (U/G) | prospec_*, notification_reads, demo_capas, catálogo Produto, infractions, roles | ~10 tabelas, trabalho zero |
| Pequeno (herdam ou já têm vestígios) | demos, demo_emprestimos, viaturas, eot_*, car_wash_events, historico | Coluna + backfill |
| Médio | objetivos_*, quality_scores, retomas, car_wash_cycles, instalacoes_* | Coluna + constraint + RLS + UI |
| **Núcleo (bloqueante)** | **control_records, control_records_vu, angariacoes_vu, vu_objetivos** | Importação por localização, PK, todos os dashboards |

**Dependências que ditam a ordem**

1. `locations` + `user_locations` + função `my_locations()` antes de qualquer outra coisa.
2. Backfill de **tudo o que existe hoje para a localização "Aveiro"** (a migração é aditiva e reversível se `location_id` começar nullable).
3. Importação por localização **antes** de abrir o segundo stand, senão o primeiro import dele apaga os dados de Aveiro.
4. Só depois a RLS por localização (`... and location_id = any(my_locations())`), com a suite em `supabase/tests/` alargada primeiro.
5. Dashboards: seletor de âmbito (o meu stand / grupo) na camada `DataContext`.

**Riscos principais**

- **Perda de dados na importação** (ponto 3 acima).
- **Fuga entre stands**: é a mesma classe de problema que a migração `rls_por_perfil` corrigiu em outubro (a UI escondia, a base de dados não). Fazer a localização só na UI repete o erro.
- **Identidade por nome**: sem id de vendedor, objetivos e qualidade ficam ambíguos. Mitigação mínima: chave (localização, nome).
- **`viaturas` é partilhada com a Caetano Sales Force**: qualquer mudança de forma à coluna `local` afeta essa app.
- **Utilizadores em vários stands**: o modelo N:N custa pouco agora e muito depois.

---

## 4. Perguntas que a matriz não consegue responder

1. **O Excel `bmw-business-control.xlsx` já traz os outros stands?** Os contratos EoT já referem Gaia e outros, mas não sei se o control de vendas também. Se já traz, o problema é só filtrar; se não, é preciso que cada stand exporte o seu e alguém o carregue.
2. **Quem importa os dados de cada stand?** Uma pessoa central ou cada stand? Define quem precisa de `edit` em *Dados* e se a importação é por localização ou única.
3. **Visibilidade:** cada stand só vê o seu? Direção e chefias veem o consolidado? Podem comparar stands entre si (ranking)?
4. **As pessoas mudam de stand ou trabalham em dois?** (decide N:N vs 1:N)
5. **Os outros stands têm lavagem, parque de demos, estacionamento e instalações próprios, ou usam os de Aveiro?**
6. **A marca "Caetano M Pro" e o texto "equipa de Aveiro" têm de passar a neutros?**
7. **Os vendedores de outros stands vão ter o mesmo formato de nomes/Excel (mesmo DMS)?** Se não, o parser em `excel-parser.ts` é o próximo problema.

---

## 5. Proposta de fases (a discutir, não é compromisso)

| Fase | Entrega | Risco | Valor visível |
|---|---|---|---|
| 0 | `locations`, `user_locations`, `my_locations()`, backfill = Aveiro. Sem mudança de comportamento. | Baixo | Nenhum (prepara) |
| 1 | Piloto de **1 stand** só nos tabs *independentes*: Lavagem, Instalações, Demos/Empréstimos, Stock VU. | Baixo/médio | O 2.º stand já usa a ferramenta |
| 2 | Importação por localização + `location_id` em `control_records*`, `vu_objetivos`, objetivos. | **Alto** (núcleo) | WIP/Funil/Produção por stand |
| 3 | Vista de grupo (consolidado, ranking) e RLS final por localização. | Médio | Direção |
| 4 | Limpeza: remover texto parseado (`eot_local_of`), tabelas mortas, hardcodes 'Aveiro'. | Baixo | Manutenção |

A fase 1 é a que responde à pressão com menos risco: dá um segundo stand a usar a ferramenta sem tocar nos dados de Aveiro. A fase 2 é a que decide o prazo real e deve ser estimada **depois** de responderes às perguntas 1, 2 e 7.
