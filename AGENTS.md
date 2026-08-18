# MerlostoreChat - Instrucoes para Agentes IA (Codex, Cursor, Copilot, Gemini)

> Leia este arquivo INTEGRALMENTE antes de qualquer tarefa.

## Estado do projeto

Atendimento multicanal (WhatsApp/Instagram/Facebook/TikTok) + CRM + pedidos + IA.
Next.js 14 App Router, NextAuth, PostgreSQL 16 (Docker, porta 5437), dev na 3005.

O projeto nasceu **fora** do padrao da base e esta em transicao:

| Item | Padrao | Hoje | Onde ler |
|------|--------|------|----------|
| ORM | Drizzle | Prisma 7 (24 models) | [ADR-0002](docs/adr/0002-orm-transicao-prisma-drizzle.md) |
| Escrita | Server Actions | 50 Route Handlers | [docs/api.md](docs/api.md) |
| Soft delete | obrigatorio | ausente; 10 rotas deletam fisico | [docs/api.md](docs/api.md) |
| Auth na API | obrigatoria | middleware exige sessao em `/api/**` | [docs/api.md](docs/api.md) |
| RBAC na API | obrigatorio | middleware aplica papel por caminho+metodo | [docs/rbac.md](docs/rbac.md) |
| RBAC nas paginas | obrigatorio | ausente — qualquer logado abre `/settings` | [docs/rbac.md](docs/rbac.md) |
| Autoria | da sessao | `usuarioDaSessao()` em toda escrita | [docs/api.md](docs/api.md) |

**Codigo novo nasce no padrao**: Drizzle, soft delete, auditoria, Zod, sessao
verificada. Nao replique o legado — ele esta catalogado, nao aprovado.
Rode `npm run compliance` antes de concluir.

## Stack

- **Linguagem**: TypeScript (strict mode)
- **Framework**: Next.js 14 (App Router)
- **ORM**: Drizzle ORM em codigo novo — Prisma so no legado, ver ADR-0002
- **Banco**: PostgreSQL 16 — NUNCA usar SQLite
- **Principios**: SOLID (alta coesao, baixo acoplamento)

## Regras Absolutas

### Banco de Dados
1. NUNCA usar SQLite em nenhum ambiente (nem dev, nem teste)
2. NUNCA usar Prisma como ORM — sempre Drizzle
3. NUNCA fazer DELETE fisico — todo delete e logico (soft delete)
4. NUNCA criar tabela sem as colunas de auditoria:
   - `created_at TIMESTAMP NOT NULL DEFAULT now()`
   - `updated_at TIMESTAMP NOT NULL DEFAULT now()`
   - `deleted_at TIMESTAMP NULL`
   - `is_deleted BOOLEAN NOT NULL DEFAULT false`
5. NUNCA criar tabela sem FK constraints configuradas
6. NUNCA criar tabela sem coluna de rastreio (`modified_by` ou `user_id`)
7. NUNCA usar CASCADE em FK de dados criticos — usar RESTRICT

### Codigo
8. NUNCA duplicar logica de negocio em multiplos arquivos — centralizar
9. NUNCA criar endpoint/action sem validacao de entrada (Zod + regex)
10. NUNCA expor dados sem verificar permissao do usuario (RBAC)
11. NUNCA ignorar tratamento de erro em operacoes de banco
12. NUNCA commitar secrets, .env ou credenciais

### Estrutura
13. NUNCA criar arquivos na raiz — usar pastas corretas (`src/`, `tests/`, `docs/`, `config/`, `scripts/`)
14. NUNCA criar arquivo com mais de 500 linhas — quebrar em modulos
15. NUNCA criar documentacao a menos que explicitamente pedido
16. NUNCA pular documentacao de regra de negocio nova — registrar em `docs/regras-negocio.md`

## Soft Delete

```typescript
// CORRETO — delete logico
await db.update(tabela)
  .set({ is_deleted: true, deleted_at: new Date(), modified_by: userId })
  .where(eq(tabela.id, id));

// PROIBIDO — delete fisico
// await db.delete(tabela).where(eq(tabela.id, id));

// TODA query filtra deletados
.where(eq(tabela.is_deleted, false))
```

## Optimistic Locking

```typescript
const resultado = await db.update(tabela)
  .set({ ...dadosNovos, updated_at: new Date(), modified_by: userId })
  .where(and(
    eq(tabela.id, id),
    eq(tabela.updated_at, updatedAtOriginal),
    eq(tabela.is_deleted, false),
  ))
  .returning();

if (resultado.length === 0) {
  throw new Error('Registro alterado por outro usuario. Recarregue e tente novamente.');
}
```

## Templates

### Nova Tabela (Drizzle)
```typescript
import { pgTable, uuid, text, boolean, timestamp } from 'drizzle-orm/pg-core';

export const exemplo = pgTable('exemplo', {
  id: uuid('id').primaryKey().defaultRandom(),
  // ... colunas especificas ...
  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at').notNull().defaultNow(),
  deleted_at: timestamp('deleted_at'),
  is_deleted: boolean('is_deleted').notNull().default(false),
  modified_by: uuid('modified_by').notNull(),
});
```

### Server Action (CRUD)
```typescript
'use server';
import { db } from '@/lib/db';
import { tabela } from '@/lib/db/schema/tabela';
import { eq, and, desc } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { schema } from '@/lib/validators/tabela';

export async function listar() {
  const session = await getSession();
  if (!session) throw new Error('Nao autenticado');

  return db.select().from(tabela)
    .where(eq(tabela.is_deleted, false))
    .orderBy(desc(tabela.created_at));
}

export async function criar(dados: unknown) {
  const session = await getSession();
  if (!session) throw new Error('Nao autenticado');

  const validado = schema.parse(dados);

  return db.insert(tabela).values({
    ...validado,
    modified_by: session.userId,
  }).returning();
}

export async function excluir(id: string) {
  const session = await getSession();
  if (!session) throw new Error('Nao autenticado');

  return db.update(tabela)
    .set({ is_deleted: true, deleted_at: new Date(), modified_by: session.userId })
    .where(and(eq(tabela.id, id), eq(tabela.is_deleted, false)));
}
```

### Validacao (Zod)
```typescript
import { z } from 'zod';

export const schema = z.object({
  descricao: z.string().min(3).max(500),
  valor: z.number().positive(),
  categoria_id: z.string().uuid(),
});
```

### Modal de Confirmacao (3s block)
```typescript
'use client';
import { useState, useEffect } from 'react';

export function ModalConfirmacaoBlock({ aberto, mensagem, onConfirmar, onCancelar }) {
  const [bloqueado, setBloqueado] = useState(true);
  const [segundos, setSegundos] = useState(3);

  useEffect(() => {
    if (!aberto) return;
    setBloqueado(true);
    setSegundos(3);
    const timer = setInterval(() => {
      setSegundos(prev => {
        if (prev <= 1) { clearInterval(timer); setBloqueado(false); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [aberto]);

  if (!aberto) return null;
  // Modal com botoes disabled enquanto bloqueado
}
```

## Estrutura de Pastas

```
projeto/
  AGENTS.md                # Este arquivo
  CLAUDE.md                # Instrucoes Claude Code
  Agente.md                # Regras de comportamento
  docker-compose.yml       # PostgreSQL local
  docs/
    rbac.md                # Controle de acesso
    front.md               # Documentacao frontend
    back.md                # Documentacao backend
    regras-negocio.md      # Regras de negocio
    oauth.md               # Autenticacao
  src/
    app/                   # Next.js App Router
    components/            # Componentes reutilizaveis
    lib/
      db/
        schema/            # Schemas Drizzle ORM
        migrations/        # Migracoes
      actions/             # Server Actions centralizadas
      validators/          # Zod + regex
      auth/                # RBAC, sessao, middleware
      audit/               # Sistema de auditoria
    types/                 # Tipos TypeScript
  tests/
  config/
  scripts/
```

## RBAC

4 roles padrao:
| Role | Nivel | Acesso |
|------|-------|--------|
| `super_admin` | 0 | Tudo, dashboard de erros |
| `admin` | 1 | Gerencia usuarios e relatorios |
| `operador` | 2 | CRUD em lancamentos |
| `visualizador` | 3 | Somente leitura |

```typescript
import { temPermissao } from '@/lib/auth';

export async function action() {
  const session = await getSession();
  if (!temPermissao(session, 'operador')) throw new Error('Sem permissao');
}
```

## Docker

```yaml
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

## Comandos

```bash
# Setup
docker compose up -d
npm install
npx drizzle-kit push

# Dev
npm run dev

# Build e teste
npm run build && npm test
```

## Checklist

Antes de finalizar qualquer tarefa:
- [ ] Tabela nova tem `created_at`, `updated_at`, `deleted_at`, `is_deleted`, `modified_by`?
- [ ] FK tem constraint RESTRICT (nao CASCADE)?
- [ ] Delete e logico (soft delete)?
- [ ] Query filtra `is_deleted = false`?
- [ ] Acao critica tem modal de confirmacao com block de 3s?
- [ ] Entrada validada (Zod + regex)?
- [ ] Modificacao gera registro de auditoria?
- [ ] Logica centralizada (nao duplicada)?
- [ ] RBAC verificado?
- [ ] Nenhum secret exposto?
- [ ] Build passa?
