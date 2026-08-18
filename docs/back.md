# Backend — Documentacao

Estado real do backend do MerlostoreChat. A referencia rota a rota esta em
[docs/api.md](api.md); aqui ficam arquitetura, padroes e o alvo para codigo novo.

## Stack

| Item | Hoje | Alvo |
|------|------|------|
| Runtime | Node.js 20 via Next.js 14 (App Router) | mesmo |
| Camada de escrita | Route Handlers (`src/app/api/**/route.ts`) | Route Handlers para webhooks; Server Actions para o resto |
| ORM | **Prisma 7** com adapter `@prisma/adapter-pg` | Drizzle ORM ([ADR-0002](adr/0002-orm-transicao-prisma-drizzle.md)) |
| Banco | PostgreSQL 16 (`docker-compose.yml`, porta 5437) | mesmo |
| Validacao | Zod em 24 dos 50 arquivos de rota | Zod em toda entrada |
| Auth | NextAuth (Credentials + JWT) + RBAC, exigidos em `/api/**` pelo middleware | mesmo, estendido as paginas |
| Fila | nao implementada | BullMQ sobre Redis (porta 6382) |

## Arquivos fonte de verdade

| Caminho | O que e |
|---------|---------|
| `prisma/schema.prisma` | Schema do banco — 24 models |
| `src/lib/db/prisma.ts` | Cliente Prisma (singleton com pool `pg`, reaproveitado em dev) |
| `src/lib/auth.ts` | `authOptions` do NextAuth: provider Credentials, bcrypt, JWT com `id` e `role` |
| `src/middleware.ts` | Porta unica de autenticacao: paginas redirecionam para `/login`, `/api/**` responde `401` |
| `src/lib/api-publica.ts` | As 9 rotas que o middleware nao protege por sessao |
| `src/lib/rbac.ts` | Quem pode o que, por caminho + metodo HTTP |
| `src/lib/sessao.ts` | `usuarioDaSessao()` — autoria de toda escrita |
| `src/lib/webhook-auth.ts` | Assinatura Meta (HMAC), segredo de gateway e `CRON_SECRET` |
| `src/lib/channels/index.ts` | `getAdapter(channel)` → adapter de WhatsApp, Instagram, Facebook ou TikTok |
| `src/lib/channels/gateway.ts` | `processIncomingMessage`, `processStatusUpdate`, `saveOutgoingMessage` |
| `src/lib/ai/` | `classify`, `suggest`, `summarize`, `prompts`, `client` (Anthropic SDK) |
| `src/lib/alerts/engine.ts` | `checkAlerts()` — motor de alertas, disparado por cron |
| `src/lib/media/upload.ts` | Cloudinary: upload, delete, deteccao de tipo |
| `src/lib/payments/index.ts` | `getPaymentProvider()` — hoje devolve sempre o mock |
| `src/lib/transcription/` | Transcricao de audio (Whisper) |
| `prisma/seed.ts` | Dados de exemplo (`npm run db:seed`) |

## Modelo de dados

24 models em `prisma/schema.prisma`, agrupados por dominio:

| Dominio | Models |
|---------|--------|
| Usuarios | `User` |
| Atendimento | `Contact`, `Conversation`, `Message`, `MessageMedia` |
| Midia | `MediaFile`, `Lookbook` |
| Catalogo | `Product` |
| CRM | `Deal`, `DealEvent` |
| Pedidos | `Order`, `OrderEvent`, `Payment`, `Return` |
| Operacao | `Alert`, `QuickReply`, `WhatsappTemplate`, `ScheduledMessage`, `Broadcast`, `BroadcastRecipient` |
| Pos-venda | `SatisfactionSurvey`, `KnowledgeArticle` |
| Compliance | `ConsentLog`, `ActivityLog` |

Convencao do schema: campo em `camelCase` no TypeScript e `@map("snake_case")`
na coluna; tabela em `@@map("plural_snake_case")`.

### Divida conhecida no schema

Medida por `npm run compliance` (17/08/2026):

- **24 de 24 models sem o conjunto completo de colunas de auditoria.** Quase
  todos tem `createdAt`/`updatedAt`; nenhum tem `deletedAt`, `isDeleted` e
  `modifiedBy`. O `CLAUDE.md` exige os cinco.
- **`prisma/schema.prisma` com 629 linhas** (limite 500). Prisma 7 suporta pasta
  de schema — quebrar por dominio quando a migracao para Drizzle comecar.
- Sem soft delete, 10 rotas fazem delete fisico (lista em [api.md](api.md)).

## Padroes reais da API

Detalhes por rota em [docs/api.md](api.md). Em resumo:

1. **Route Handler por recurso**: `route.ts` exporta `GET`/`POST`/`PUT`/`DELETE`.
2. **Parametro dinamico e Promise** (Next 15+): `{ params }: { params: Promise<{ id: string }> }`, sempre com `await params`.
3. **Zod no topo do arquivo**, quando existe, num `const xSchema = z.object({...})`.
4. **Erros**: `400` validacao (`{ error: issues }`), `404` nao encontrado,
   `500` interno com mensagem em PT-BR. Criacao devolve `201`.
5. **Paginacao**: `?page` e `?limit`, resposta `{ <itens>, total, page, limit }`.
6. **Filtro `all`**: query com valor `"all"` significa "sem filtro".
7. **Eventos**: mudancas de estado em deal e pedido geram `DealEvent`/`OrderEvent`.

### O que NAO seguir (padroes atuais fora da regra)

Estao documentados para voce reconhecer, nao para replicar:

| Anti-padrao presente | Regra violada |
|----------------------|---------------|
| 10 rotas com `prisma.X.delete()` | soft delete obrigatorio |
| Nenhuma rota usa optimistic locking | controle de colisao |
| Nenhuma mutacao grava em `ActivityLog` | trilha de auditoria |
| PUT que monta `data` a partir do body cru, sem Zod | validar entrada na fronteira |
| `limit` de paginacao sem teto | protecao contra abuso |
| `DELETE /api/lgpd` roda ~20 exclusoes fora de transacao | atomicidade |

## Padrao-alvo para codigo novo (Drizzle)

Codigo novo que toca banco nasce em Drizzle, convivendo com o Prisma legado no
mesmo PostgreSQL. Os arquivos-ouro estao em `templates/`:

| Template | Para que |
|----------|----------|
| `templates/schema.ts` | Tabela Drizzle com as 5 colunas de auditoria e FK `restrict` |
| `templates/server-action.ts` | CRUD com auth, RBAC, Zod, soft delete, optimistic locking e auditoria |
| `templates/component.tsx` | Componente com estados obrigatorios e modal block de 3s |
| `templates/component.test.tsx` | Teste do caminho critico |

Toda tabela nova, sem excecao:

```typescript
// src/lib/db/schema/[entidade].ts
export const entidade = pgTable("entidade", {
  id: uuid("id").primaryKey().defaultRandom(),

  // ...colunas do dominio

  // FK — nunca cascade em dado critico
  contato_id: uuid("contato_id").notNull()
    .references(() => contatos.id, { onDelete: "restrict" }),

  // === OBRIGATORIAS ===
  created_at: timestamp("created_at").notNull().defaultNow(),
  updated_at: timestamp("updated_at").notNull().defaultNow(),
  deleted_at: timestamp("deleted_at"),
  is_deleted: boolean("is_deleted").notNull().default(false),
  modified_by: uuid("modified_by").notNull(),
});
```

O auditor bloqueia tabela Drizzle sem essas colunas (erro, nao aviso) — use a
skill `/criar-tabela` e ela ja sai correta.

### Exclusao

```typescript
// CORRETO
await db.update(t)
  .set({ is_deleted: true, deleted_at: new Date(), modified_by: userId })
  .where(eq(t.id, id));

// PROIBIDO — o hook pre-write-guard bloqueia a gravacao
// await db.delete(t).where(eq(t.id, id));
```

Unica excecao: exclusao exigida pela LGPD (`src/app/api/lgpd/route.ts`),
marcada com o comentario `compliance:delete-fisico-lgpd`.

### Colisao (optimistic locking)

```typescript
const r = await db.update(t)
  .set({ ...dados, updated_at: new Date(), modified_by: userId })
  .where(and(
    eq(t.id, id),
    eq(t.updated_at, updatedAtOriginal), // falha se outro usuario mexeu
    eq(t.is_deleted, false),
  ))
  .returning();

if (r.length === 0) throw new Error("Registro alterado por outro usuario. Recarregue.");
```

## Comandos

```bash
docker compose up -d     # PostgreSQL 5437 + Redis 6382
npm run db:push          # aplica o schema Prisma no banco
npm run db:seed          # dados de exemplo
npm run db:studio        # Prisma Studio
npm run db:backup        # dump em ~/Documents/DB_backups
npm run compliance       # auditoria das regras
npm run map              # regenera docs/PROJECT_MAP.md
npm run docs:check       # drift entre codigo e docs
```

## Antes de alterar o backend

1. Ler [docs/api.md](api.md) na secao da rota que voce vai tocar.
2. Rodar `npm run compliance` e nao aumentar a contagem de avisos.
3. Toda entrada nova validada com Zod — sem excecao, mesmo em PUT.
4. Exclusao nova e sempre soft delete.
5. Atualizar a linha da rota em `docs/api.md` na mesma PR.
6. Fechar pelo [Definition of Done](definition-of-done.md).
