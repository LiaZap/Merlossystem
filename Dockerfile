# Imagem de producao do MerlostoreChat.
#
# Debian slim, nao Alpine: `sharp` (miniaturas, ADR 0006) e o engine do Prisma
# usam binario nativo, e no Alpine (musl) os dois pedem pacote extra e quebram
# de formas dificeis de diagnosticar. O slim custa alguns MB e evita isso.
#
# Multi-estagio para a imagem final nao levar codigo-fonte, devDependencies nem
# cache de build.

FROM node:20-slim AS base
# `openssl` e exigido pelo engine do Prisma; sem ele o cliente nao inicia.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ---------------------------------------------------------------------------
# Dependencias
# ---------------------------------------------------------------------------
FROM base AS deps
# O schema entra ANTES do `npm ci` porque o `postinstall` roda
# `prisma generate` e falha sem ele.
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# O build do Next nao acessa o banco (as rotas sao todas dinamicas), mas o
# Prisma precisa do cliente gerado para o TypeScript resolver os tipos.
RUN npx prisma generate
RUN npm run build

# SQL de criacao do schema, gerado AQUI, onde o CLI existe.
#
# `--from-empty` nao toca em banco nenhum: le so a schema. O runtime aplica
# esse arquivo com `pg` (scripts/db-bootstrap.mjs), e assim o CLI do Prisma
# NAO precisa ir para a imagem final — ver o comentario no estagio runner.
RUN npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script \
  > prisma/schema.sql \
  && test -s prisma/schema.sql

# ---------------------------------------------------------------------------
# Runtime
# ---------------------------------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production
# `HOSTNAME` em 0.0.0.0: o padrao do Next standalone e localhost, e ai o
# container sobe mas nao aceita conexao de fora — parece healthcheck quebrado.
ENV HOSTNAME=0.0.0.0
ENV PORT=3005

# `--create-home` nao e detalhe: sem `/home/nextjs`, qualquer `npm`/`npx`
# rodado no terminal do container morre com
# `EACCES: permission denied, mkdir '/home/nextjs'` antes de fazer nada.
RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs --create-home --home-dir /home/nextjs nextjs
ENV HOME=/home/nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# O CLI do Prisma NAO vai para a imagem, e isso e decisao, nao esquecimento.
#
# No Prisma 7 ele arrasta uma arvore enorme: `prisma/build/index.js` exige
# `@prisma/config`, `@prisma/dev`, `@prisma/engines` e `@prisma/studio-core` ja
# no topo, e `@prisma/dev` sozinho puxa pglite, hono, effect e mais 14. Levar
# tudo faria o runtime sair de 48 MB para +800 MB — 17x, por um comando usado
# duas vezes por ano.
#
# No lugar dele: o SQL foi gerado no estagio de build, e `db-bootstrap.mjs` o
# aplica usando `pg`, que ja vem no bundle da aplicacao.
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts

USER nextjs
EXPOSE 3005

CMD ["node", "server.js"]
