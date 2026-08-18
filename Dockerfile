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

# O standalone JA traz `@prisma`, `.prisma`, `pg` e `sharp` — verificado no
# build, nao suposto. O que ele NAO traz e o CLI do `prisma`, que e
# devDependency e nao e importado por codigo.
#
# Sem o CLI na imagem, `npx prisma db push` tenta BAIXAR o pacote do registry
# de dentro do container e morre com EACCES. Custa ~60 MB e e o que torna a
# migracao possivel sem subir um container separado so para isso.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.bin ./node_modules/.bin

# Schema e scripts para rodar `prisma db push && node scripts/db-constraints.mjs`
# apos o primeiro deploy.
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts

USER nextjs
EXPOSE 3005

CMD ["node", "server.js"]
