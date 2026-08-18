# MerlostoreChat - Instrucoes para Agentes IA

Sistema de atendimento multicanal (WhatsApp / Instagram / Facebook / TikTok) +
CRM + pedidos + IA para a Merlo Store.

## Estado Atual do Projeto (LEIA ANTES DE CODAR)

| Item | Padrao da base | Neste projeto HOJE | Acao |
|------|----------------|--------------------|------|
| ORM | Drizzle | **Prisma** (`prisma/schema.prisma`, 628 linhas) | migracao pendente — ver `docs/adr/0002-orm-transicao-prisma-drizzle.md` |
| Banco | PostgreSQL | PostgreSQL (OK) | rodar via `docker-compose.yml` (porta **5437**) |
| Soft delete | obrigatorio | **ausente** na maioria dos models | adicionar `deleted_at` / `is_deleted` |
| Auditoria | `created_at`, `updated_at`, `deleted_at`, `is_deleted`, `modified_by` | so `created_at` / `updated_at` | completar por model |
| Camada de escrita | Server Actions | 50 Route Handlers (`src/app/api/**`) | aceitavel (webhooks precisam de HTTP); regras continuam valendo |
| Auth | sessao em toda mutacao | middleware exige sessao em `/api/**`; 9 excecoes com gate proprio | OK (corrigido 17/08) |
| RBAC | obrigatorio | middleware aplica papel por caminho+metodo (`src/lib/rbac.ts`) | OK na API; falta nas paginas |
| Multi-loja | — | Centro e Cerro Azul; escopo em toda consulta (`src/lib/loja.ts`) + seletor no cabecalho | OK |
| Autoria | vem da sessao | `usuarioDaSessao()` em toda escrita (`src/lib/sessao.ts`) | OK (corrigido 17/08) |
| Trilha de auditoria | toda mutacao registra | so grava se o front chamar `/api/activity-logs` | automatizar |
| Porta dev | — | **3005** (`.claude/launch.json`) | manter |

Antes de mexer em qualquer rota, leia a secao dela em
[docs/api.md](docs/api.md) — as 50 estao documentadas com validacao, efeitos
colaterais e os desvios de regra conhecidos.

Enquanto a migracao do ORM nao acontece, o hook `pre-write-guard.mjs` esta com
`MIGRACAO_ORM_EM_ANDAMENTO = true`: Prisma gera **aviso**, nao bloqueio. Todas as
demais regras (SQLite, delete fisico, `.env`) continuam bloqueando de verdade.
Ao concluir a migracao, mudar a flag para `false`.

**Nao introduza Prisma em codigo novo.** Codigo novo que toca banco deve nascer
em Drizzle (`src/lib/db/schema/`), convivendo com o Prisma legado ate a virada.

## Comandos do Projeto

```bash
npm run dev              # Next.js na porta 3005
docker compose up -d     # PostgreSQL 16 (5437) + Redis (6382)
npm run compliance       # auditor de conformidade
npm run map              # mapa do projeto para a IA
npm run docs:check       # drift codigo <-> docs
npm run ai-marks         # marcas invisiveis de IA em docs/ (--write corrige)
npm test                 # Vitest
npm run build            # build de producao
```

## Stack Obrigatoria

- **Linguagem**: TypeScript (strict mode)
- **Framework**: Next.js (usar server-side nativo, sem API separada quando possivel)
- **ORM**: Drizzle ORM (https://orm.drizzle.team/) — NUNCA usar Prisma
- **Banco**: PostgreSQL — NUNCA usar SQLite
- **Principios**: SOLID (alta coesao, baixo acoplamento)

## Ferramentas da Base (para a IA)

Antes de codar, use estas ferramentas — elas tornam as regras automaticas.

| Recurso | Para que | Como |
|---------|----------|------|
| `scripts/check-compliance.mjs` | Audita violacoes (Prisma, SQLite, delete fisico, tabela sem auditoria, >500 linhas, secrets) | `node scripts/check-compliance.mjs` |
| `scripts/project-map.mjs` | Mapa do projeto (tabelas, rotas, actions) p/ se orientar sem ler tudo | `node scripts/project-map.mjs` |
| `scripts/docs-check.mjs` | Detecta drift entre codigo e docs (refs quebradas, codigo sem cobertura) | `node scripts/docs-check.mjs` (`--json` / `--strict`) |
| `scripts/remove-ai-marks.mjs` | Remove marcas invisiveis de texto gerado por IA (zero-width, marca d'agua, bidi) | `npm run ai-marks` |
| Hooks (`.claude/hooks/`) | BLOQUEIAM gravacao que viola as regras (enforcement a 100%, nao 70%) | automatico (Pre/PostToolUse) |
| Skills `/criar-tabela`, `/criar-crud`, `/criar-componente`, `/repo-docs-sync`, `/remove-ai-marks` | Workflows guiados que ja seguem todas as regras | invocar a skill |
| `templates/` | Arquivos-ouro p/ copiar (schema, action, componente, teste) | copiar e ajustar |
| `docs/api.md` | Referencia das 50 rotas (validacao, efeitos, desvios de regra) | ler antes de tocar em `src/app/api/**` |
| `docs/back.md` | Arquitetura do backend, modelo de dados e padrao-alvo | ler antes de mexer em banco |
| `docs/components.md` | Padrao de componentes (colocation, server/client, shadcn) | ler antes de UI |
| `docs/adr/` | Decisoes de arquitetura (o "porque") | consultar/registrar |
| `docs/definition-of-done.md` | Checklist final antes de concluir | verificar |
| `docs/git-commits.md` | Conventional Commits | seguir no commit |

Fluxo: `project-map` (orientar) -> skill correspondente -> `check-compliance` (validar) -> Definition of Done.

## Regras Absolutas de Banco de Dados

### Nunca Fazer
- NUNCA usar SQLite em nenhum ambiente (nem dev, nem teste)
- NUNCA usar Prisma como ORM
- NUNCA fazer DELETE fisico — todo delete e logico (soft delete)
- NUNCA criar tabela sem as colunas de auditoria
- NUNCA criar tabela sem Foreign Keys (FK) corretamente configuradas

### Sempre Fazer
- SEMPRE usar PostgreSQL em dev identico a producao (via Docker)
- SEMPRE usar Drizzle ORM para schema e queries
- SEMPRE incluir em TODA tabela:
  ```
  created_at  TIMESTAMP  NOT NULL  DEFAULT now()
  updated_at  TIMESTAMP  NOT NULL  DEFAULT now()
  deleted_at  TIMESTAMP  NULL
  is_deleted  BOOLEAN    NOT NULL  DEFAULT false
  ```
- SEMPRE registrar qual usuario fez a modificacao (coluna `user_id` ou `modified_by`)
- SEMPRE configurar FK com constraints adequadas (ON DELETE RESTRICT, nunca CASCADE para dados criticos)
- SEMPRE nomear tabelas de forma hierarquica:
  ```
  contratos
  contratos_lancamentos
  contratos_lancamentos_categorias
  ```

### Docker Local
Todo desenvolvedor deve rodar localmente o mesmo banco de producao:
```yaml
# docker-compose.yml minimo
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_DB: projeto_dev
      POSTGRES_USER: dev
      POSTGRES_PASSWORD: dev
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
volumes:
  pgdata:
```

## Controle de Colisao (Optimistic Locking)

Quando dois usuarios editam o mesmo registro ao mesmo tempo, o sistema deve
detectar e rejeitar a segunda gravacao para evitar sobrescrever dados.

```typescript
// Ao fazer UPDATE, verificar se updated_at nao mudou desde que o usuario abriu o registro
const resultado = await db.update(tabela)
  .set({ ...dadosNovos, updated_at: new Date(), modified_by: userId })
  .where(and(
    eq(tabela.id, id),
    eq(tabela.updated_at, updatedAtOriginal), // se alguem mexeu, este where falha
    eq(tabela.is_deleted, false),
  ))
  .returning();

if (resultado.length === 0) {
  throw new Error('Registro alterado por outro usuario. Recarregue e tente novamente.');
}
```

Aplicar em toda tabela que multiplos usuarios podem editar ao mesmo tempo.

## Regras de Soft Delete

Todo delete no sistema segue este padrao:
```typescript
// CORRETO - delete logico
await db.update(tabela)
  .set({ is_deleted: true, deleted_at: new Date(), modified_by: userId })
  .where(eq(tabela.id, id));

// PROIBIDO - delete fisico
// await db.delete(tabela).where(eq(tabela.id, id));
```

Queries devem sempre filtrar registros deletados:
```typescript
// Toda query padrao
.where(eq(tabela.is_deleted, false))
```

## Validacao e UX

### Regex para Validacao
Usar regex para validar entradas criticas. Quando o usuario lanca dados, validar se a descricao bate com a categoria selecionada.

### Modal de Confirmacao com Block
Para acoes criticas (salvar lancamentos, excluir registros), implementar modal que:
1. Bloqueia a tela inteira por 3 segundos
2. Nao permite fechar com ESC, clicar fora, ou apertar botoes
3. Mostra resumo claro do que vai acontecer
4. Apos 3 segundos, libera os botoes "Confirmar" e "Cancelar"

```typescript
// Exemplo de comportamento esperado
function ModalConfirmacaoBlock({ mensagem, onConfirm, onCancel }) {
  const [bloqueado, setBloqueado] = useState(true);
  
  useEffect(() => {
    const timer = setTimeout(() => setBloqueado(false), 3000);
    return () => clearTimeout(timer);
  }, []);
  
  // Modal sem fechar por ESC/click-fora enquanto bloqueado
}
```

## Auditoria e Compliance

### Trilha de Auditoria
Toda acao do usuario deve ser registrada:
- **Quem**: user_id que executou
- **O que**: descricao da acao (criou, alterou campo X de Y para Z, deletou)
- **Quando**: timestamp exato

### Versionamento de Documentos/PDFs
Quando o sistema gera documentos (PDFs, relatorios):
1. Salvar cada versao com numero incremental (v1, v2, v3...)
2. Se nada mudou nos dados, salvar automaticamente proxima versao
3. Sempre apresentar ao usuario a ultima versao
4. Manter historico completo para auditoria

### Dashboard Owner/Admin
Criar painel administrativo que mostra:
- Alertas de lancamentos com erros/inconsistencias
- Volume de erros por usuario
- Detalhes de cada erro (o que foi lancado vs o que deveria ser)
- Registros deletados (quem deletou, quando, o que era)

## Estrutura de Pastas do Projeto

```
projeto/
  CLAUDE.md              # Este arquivo - instrucoes para agentes IA (Claude Code)
  AGENTS.md              # Instrucoes universais (Codex, Cursor, Copilot, Gemini)
  Agente.md              # Regras especificas de comportamento dos agentes
  docker-compose.yml     # Banco PostgreSQL local
  .claude/
    settings.json        # Hooks de enforcement (team-shared)
    hooks/
      pre-write-guard.mjs    # BLOQUEIA Prisma/SQLite/delete fisico/.env
      post-write-check.mjs   # Roda compliance no arquivo editado
    skills/
      criar-tabela/        # Workflow: nova tabela Drizzle
      criar-crud/          # Workflow: CRUD completo
      criar-componente/    # Workflow: componente no padrao
      repo-docs-sync/      # Workflow: auditar e sincronizar docs com o codigo
  .github/
    pull_request_template.md
  templates/             # Arquivos-ouro (copiar e ajustar)
    schema.ts
    server-action.ts
    component.tsx
    component.test.tsx
  scripts/
    check-compliance.mjs # Auditor de conformidade
    project-map.mjs      # Mapa do projeto p/ a IA
    docs-check.mjs       # Detector de drift entre codigo e docs
  docs/
    api.md               # Referencia das 50 rotas de API
    rbac.md              # Controle de acesso e permissoes
    front.md             # Documentacao do frontend
    back.md              # Documentacao do backend
    regras-negocio.md    # Regras de negocio do cliente
    oauth.md             # Autenticacao e autorizacao
    components.md        # Padrao de componentes
    definition-of-done.md # Checklist de conclusao
    git-commits.md       # Conventional Commits
    adr/                 # Architecture Decision Records
  src/
    app/                 # Next.js App Router
    components/
      ui/                # Primitivos genericos (shadcn)
    lib/
      db/
        schema/          # Schemas Drizzle ORM
        migrations/      # Migracoes do banco
      actions/           # Server Actions centralizadas
      validators/        # Validacoes com regex e zod
      audit/             # Sistema de auditoria
    types/               # Tipos TypeScript compartilhados
  tests/                 # Testes
  config/                # Configuracoes
```

## Principios SOLID Aplicados

### S - Single Responsibility
Cada arquivo/modulo faz UMA coisa. Nao misturar logica de negocio com UI.

### O - Open/Closed
Extender comportamento sem modificar codigo existente. Usar composicao.

### L - Liskov Substitution
Subtipos devem ser substituiveis por seus tipos base.

### I - Interface Segregation
Interfaces pequenas e especificas. Nao forcar implementacao de metodos desnecessarios.

### D - Dependency Inversion
Depender de abstracoes, nao de implementacoes concretas.

### Na Pratica
- Centralizar regras de negocio em um unico lugar (ex: `src/lib/channels/gateway.ts`,
  que concentra o processamento de mensagem para os 4 canais)
- Se uma regra muda, mudar em UM lugar e refletir em todos os menus/telas
- NAO duplicar logica entre arquivos diferentes
- Reusar componentes e funcoes entre telas relacionadas

## Git Flow — Branching e Deploy

### Branches

| Branch | Proposito | Deploy |
|--------|-----------|--------|
| `develop` | Desenvolvimento ativo, features e fixes | HML (Homologacao) |
| `master` | Codigo estavel, validado em HML | PRD (Producao) |

### Fluxo

```
develop ──push──> GitHub Actions ──> Deploy HML (Homologacao)
   │
   │ (validado em HML, aprovado)
   │
   └──merge──> master ──push──> GitHub Actions ──> Deploy PRD (Producao)
```

### Regras de Branch

1. NUNCA commitar direto na `master`
2. Todo codigo entra pela `develop`
3. Merge para `master` somente apos validacao em HML
4. Hotfix: branch a partir de `master`, merge de volta em `master` E `develop`

### GitHub Actions (CI/CD)

```yaml
# .github/workflows/deploy.yml — logica de decisao
# If branch = develop → Deploy HML
#   passo 1: build + testes
#   passo 2: deploy para servidor HML
#   Done
# Else (master) → Deploy PRD
#   passo 1: build + testes
#   passo 2: deploy para servidor PRD
#   Done
```

Pipeline obrigatorio:
1. **Lint + Type Check** — `npm run lint && tsc --noEmit`
2. **Testes** — `npm test`
3. **Build** — `npm run build`
4. **Deploy** — SSH para VPS ou script de deploy

## Infraestrutura — Padrao VPS Hostinger

### Arquitetura por Ambiente

Cada projeto segue a separacao Frontend/Backend em VPS distintas:

```
┌─────────────────────────────────────────────────────────┐
│  HML — Homologacao                                      │
│                                                         │
│  VPS1 (Frontend)          VPS2 (Backend)                │
│  2 vcpus, 8 vram          4 vcpus, 16 vram             │
│  100GB ROM, 8t bandwidth   240GB ROM, 16t bandwidth     │
│  ┌──────────┐             ┌──────────┬──────────┐       │
│  │ FrontEnd │ ──────────> │ BackEnd  │ SQL      │       │
│  │ (Next.js)│             │ (API)    │ NoSQL    │       │
│  └──────────┘             └──────────┴──────────┘       │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  PRD — Producao                                         │
│                                                         │
│  VPS3 (Frontend)          VPS4 (Backend)                │
│  2 vcpus, 8 vram          4 vcpus, 16 vram             │
│  100GB ROM, 8t bandwidth   240GB ROM, 16t bandwidth     │
│  ┌──────────┐             ┌──────────┬──────────┐       │
│  │ FrontEnd │ ──────────> │ BackEnd  │ SQL      │       │
│  │ (Next.js)│             │ (API)    │ NoSQL    │       │
│  └──────────┘             └──────────┴──────────┘       │
└─────────────────────────────────────────────────────────┘
```

### Especificacoes Minimas

| Servidor | vCPUs | vRAM | Disco | Bandwidth | Funcao |
|----------|-------|------|-------|-----------|--------|
| VPS Frontend | 2 | 8 GB | 100 GB | 8 TB | Next.js (SSR/SSG) |
| VPS Backend | 4 | 16 GB | 240 GB | 16 TB | API + PostgreSQL + Redis/NoSQL |

### Regras de Infra

- Frontend e Backend SEMPRE em VPS separadas (isolamento de falha)
- HML deve ser replica exata de PRD (mesmas versoes, mesma config)
- PostgreSQL roda na VPS Backend (mesma maquina que a API)
- Redis/NoSQL na VPS Backend quando necessario

## Fila de Processamento (FIFO)

Para jobs de longa duracao (envio de emails, processamento de PDFs, sync externo),
usar fila FIFO (First In, First Out):

```
              FIFO — First In and First Out
Out <──────────────────────────────────── In

┌───┬───┬───┬───┬───┬───┐
│ 0 │ 1 │ 2 │ 3 │ 4 │ 5 │  ← posicoes na fila
└───┴───┴───┴───┴───┴───┘
  ↑                     ↑
  sai primeiro          entra por ultimo
```

### Implementacao com Redis (BullMQ)

```typescript
import { Queue, Worker } from "bullmq";
import Redis from "ioredis";

const connection = new Redis({ host: "localhost", port: 6379 });

// Criar fila
const fila = new Queue("processar-documentos", { connection });

// Adicionar job
await fila.add("gerar-pdf", { contratoId: "abc123", versao: 3 });

// Worker que processa
const worker = new Worker("processar-documentos", async (job) => {
  if (job.name === "gerar-pdf") {
    await gerarPDF(job.data.contratoId, job.data.versao);
  }
}, { connection });
```

### Regras de Fila

- FIFO obrigatorio — ordem de entrada e ordem de processamento
- Jobs devem ser idempotendes (reprocessar nao causa efeito colateral)
- Dead Letter Queue (DLQ) para jobs que falharam apos N tentativas
- Registrar cada job executado na trilha de auditoria
- NUNCA processar jobs criticos em memoria (usar Redis persistente)

## Backup de Banco de Dados

### Comando Padrao (pg_dump)

```bash
pg_dump "postgres://USUARIO:SENHA@HOST:PORTA/BANCO" \
  --no-owner \
  --no-acl \
  --clean \
  --if-exists \
  --file="~/Documents/DB_backups/backup_$(date +%d_%m_%Y_%H_%M).sql"
```

| Flag | Motivo |
|------|--------|
| `--no-owner` | Nao incluir ALTER OWNER (portabilidade entre ambientes) |
| `--no-acl` | Nao incluir GRANT/REVOKE (permissoes gerenciadas por ambiente) |
| `--clean` | Incluir DROP antes de CREATE (restore limpo) |
| `--if-exists` | Evitar erro se objeto nao existir no DROP |

### Politica de Backup

| Frequencia | Tipo | Retencao |
|------------|------|----------|
| Diario | Full dump (pg_dump) | 30 dias |
| Semanal | Full dump comprimido | 90 dias |
| Antes de deploy PRD | Snapshot manual | Permanente |

### Nomenclatura

```
backup_DD_MM_YYYY_HH_MM.sql
```

Exemplo: `backup_12_03_2026_17_29.sql`

### Regras de Backup

- SEMPRE fazer backup ANTES de deploy em PRD
- SEMPRE testar restore do backup em HML antes de confiar
- NUNCA armazenar backups no mesmo servidor do banco
- NUNCA incluir credenciais no nome do arquivo de backup
- Manter script de restore documentado e testado

### Restore

```bash
psql "postgres://USUARIO:SENHA@HOST:PORTA/BANCO" \
  < ~/Documents/DB_backups/backup_12_03_2026_17_29.sql
```

## Disaster Recovery

- NUNCA dropar banco de dados
- SEMPRE ter backup atualizado ANTES de qualquer operacao destrutiva
- Manter snapshots periodicos dos dados criticos (politica de backup acima)
- Toda alteracao de contrato/regra que impacta calculos deve ser versionada
- Ter procedimento de rollback documentado e testado em HML
- Backup testado = restore executado com sucesso em HML

### Procedimento de Rollback

1. Pausar deploy/operacao
2. Identificar ultimo backup valido
3. Restaurar em HML primeiro — validar integridade
4. Se OK, restaurar em PRD
5. Registrar incidente na trilha de auditoria

## Processo de Desenvolvimento

1. Ler documentacao do framework ANTES de implementar
2. Configurar Docker com PostgreSQL ANTES de codar
3. Criar schemas Drizzle com todas as colunas obrigatorias
4. Implementar soft delete em toda operacao de exclusao
5. Adicionar validacao com regex e modal de confirmacao
6. Testar com banco identico ao de producao
7. Documentar regras de negocio em docs/regras-negocio.md
8. Commitar na `develop`, validar em HML, merge para `master`
9. Backup do banco ANTES de deploy em PRD

## Build e Teste

```bash
npm run build && npm test
```

SEMPRE rodar testes apos alteracoes de codigo.
SEMPRE verificar que o build passa antes de commitar.
NUNCA fazer deploy em PRD sem backup do banco.
