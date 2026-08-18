# MerlostoreChat

Atendimento multicanal (WhatsApp, Instagram, Facebook, TikTok) + CRM + pedidos
+ IA para a Merlo Store.

## Rodar local

Pre-requisitos: Node 20+, Docker, cliente PostgreSQL (`pg_dump` para backup).

```bash
cp .env.example .env      # preencher os secrets (o .env nao vai para o git)
docker compose up -d      # PostgreSQL 16 na 5437 + Redis na 6382
npm ci
npm run db:push           # aplica o schema no banco local
npm run db:seed           # dados de exemplo
npm run dev               # http://localhost:3005
```

## Comandos

| Comando | O que faz |
|---------|-----------|
| `npm run dev` | Next.js em modo dev (porta 3005) |
| `npm run build` | build de producao |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest (`config/vitest.config.ts`) |
| `npm run compliance` | auditor das regras do projeto |
| `npm run map` | gera `docs/PROJECT_MAP.md` |
| `npm run docs:check` | drift entre codigo e documentacao |
| `npm run ai-marks` | marcas invisiveis de IA em `docs/` (`-- --write` corrige) |
| `npm run db:up` / `db:down` | sobe/derruba Postgres + Redis |
| `npm run db:backup` | dump em `~/Documents/DB_backups` |

## Stack

TypeScript (strict) · Next.js 14 (App Router) · PostgreSQL 16 · Prisma (legado,
migrando para Drizzle — [ADR-0002](docs/adr/0002-orm-transicao-prisma-drizzle.md))
· NextAuth · Tailwind + shadcn/ui · Anthropic SDK · Cloudinary · BullMQ/Redis.

## Estrutura

```
.claude/          hooks de enforcement + skills (criar-tabela, criar-crud, ...)
.github/          CI/CD (develop -> HML, master -> PRD) e template de PR
config/           configuracao de teste (vitest)
docs/             api, back, front, rbac, oauth, regras de negocio, ADRs
prisma/           schema legado (24 models) + seed
scripts/          check-compliance, project-map, docs-check, db-backup
src/app/(auth)/   login e cadastro
src/app/(dashboard)/  inbox, contatos, pipeline, pedidos, produtos, ...
src/app/api/      50 route handlers — referencia em docs/api.md
src/components/   UI por dominio (chat, crm, inbox, orders, gallery) + ui/
src/lib/          ai, alerts, channels, media, payments, transcription, auth, db
templates/        arquivos-ouro para copiar ao criar codigo novo
tests/            testes
```

## Documentacao

| Doc | Quando ler |
|-----|------------|
| [docs/api.md](docs/api.md) | Antes de tocar em qualquer rota — as 50 documentadas |
| [docs/integracoes.md](docs/integracoes.md) | Especificacao de multi-loja + Bling, TikTok Shop, Instagram e WhatsApp |
| [docs/back.md](docs/back.md) | Arquitetura, modelo de dados, padrao-alvo |
| [docs/front.md](docs/front.md) | Estrutura de telas e padroes de UI |
| [docs/rbac.md](docs/rbac.md) | Papeis e permissoes (modelo-alvo) |
| [docs/oauth.md](docs/oauth.md) | Como a autenticacao funciona hoje |
| [docs/adr/](docs/adr/) | Decisoes de arquitetura e o porque delas |
| [docs/PROJECT_MAP.md](docs/PROJECT_MAP.md) | Mapa gerado do codigo (`npm run map`) |

## Autenticacao

Toda rota `/api/**` exige sessao NextAuth — quem barra e o `src/middleware.ts`,
entao rota nova nasce protegida. As 9 excecoes (NextAuth, cadastro, webhooks e
crons) estao em `src/lib/api-publica.ts`, cada uma com gate proprio: assinatura
HMAC da Meta, segredo do gateway ou `CRON_SECRET`. Tabela completa em
[docs/api.md](docs/api.md).

**Sem o segredo configurado a rota recusa (403).** Antes de religar canais ou
crons, preencha no `.env`: `CRON_SECRET`, `META_APP_SECRET`,
`INSTAGRAM_VERIFY_TOKEN`, `FACEBOOK_VERIFY_TOKEN`, `TIKTOK_VERIFY_TOKEN`,
`PAYMENT_WEBHOOK_SECRET`.

Primeiro acesso: com o banco vazio, `/register` cria o primeiro `admin`. Depois
disso o cadastro exige sessao de admin.

## Autoria das acoes

Quem executou vem sempre da sessao (`src/lib/sessao.ts`), nunca do corpo da
requisicao: `senderId`, `createdBy`, `changedBy`, `acknowledgedBy`,
`uploadedBy`, `resolvedBy` e o `userId`/`ipAddress` da trilha de auditoria.
Mandar um desses no body nao muda nada.

## Permissoes

O mesmo middleware aplica o papel do usuario em `/api/**` — sem permissao,
`403`. Regra padrao: `GET` para os tres papeis; `POST`/`PUT`/`PATCH` para
`admin` e `agent`; `DELETE` so `admin`. Excecoes (LGPD, trilha de auditoria,
cancelamento de agendamento) e o racional de cada uma em
[docs/rbac.md](docs/rbac.md).

## Pendencias conhecidas

Da auditoria de 17/08/2026, em ordem de gravidade:

1. Sem soft delete: 10 rotas apagam fisicamente (LGPD e a unica excecao legitima).
2. Trilha de auditoria nao automatica — nenhuma mutacao grava em `ActivityLog`
   sozinha (o "quem" ja e confiavel; falta o "toda mutacao").
3. **Paginas sem RBAC**: qualquer usuario logado abre `/settings`. O dado so sai
   pela API (travada), mas o menu mostra o que ele nao consegue usar.
4. `DELETE /api/lgpd` roda ~20 exclusoes fora de transacao.
5. Paginacao sem teto (`?limit=999999`) e upload sem limite de tamanho/MIME.
6. Provider de pagamento e sempre o mock (`src/lib/payments/index.ts`).
7. `DATABASE_URL` do `.env` aponta para a porta **5435**, que o
   `docker-compose.yml` nao usa (ele sobe na **5437**) — e a 5435 ja e de outro
   projeto da maquina. Alinhar os dois.
8. Migracao Prisma → Drizzle ([ADR-0002](docs/adr/0002-orm-transicao-prisma-drizzle.md)).

Detalhe de cada uma em [docs/api.md](docs/api.md).

## Regras do projeto

As regras obrigatorias (PostgreSQL, soft delete, colunas de auditoria, optimistic
locking, modal de confirmacao com block de 3s, backup antes de deploy em PRD)
estao em [CLAUDE.md](CLAUDE.md). Elas nao sao sugestao: os hooks em
`.claude/hooks/` bloqueiam gravacao que as viola e `npm run compliance` audita
o repositorio inteiro.

Antes de abrir PR: [docs/definition-of-done.md](docs/definition-of-done.md).

## Git

`develop` -> deploy automatico em HML · `master` -> deploy em PRD (com backup do
banco antes). Nunca commitar direto na `master`. Commits no padrao
[Conventional Commits](docs/git-commits.md).
