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

# O standalone JA traz `@prisma/client`, `.prisma`, `pg` e `sharp` — verificado
# no build, nao suposto. O que falta e o CLI do `prisma` (devDependency, nao
# importado por codigo) e as dependencias dele.
#
# Sem o CLI, `npx prisma db push` tenta BAIXAR o pacote do registry de dentro
# do container e morre com EACCES. Com o CLI mas sem `@prisma/engines`, morre
# com "Cannot find module '@prisma/engines'".
#
# Os pacotes sao listados um a um de proposito. Copiar `@prisma` inteiro
# custaria 161 MB e traria `studio-core` (36 MB) e `query-plan-executor`, que
# `db push` nao usa. Assim sao ~45 MB.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.bin ./node_modules/.bin
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma/engines ./node_modules/@prisma/engines
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma/engines-version ./node_modules/@prisma/engines-version
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma/fetch-engine ./node_modules/@prisma/fetch-engine
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma/get-platform ./node_modules/@prisma/get-platform
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma/debug ./node_modules/@prisma/debug
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma/config ./node_modules/@prisma/config

# Schema e scripts para rodar `prisma db push && node scripts/db-constraints.mjs`
# apos o primeiro deploy.
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts

# `prisma.config.mjs` e obrigatorio, nao conveniencia: o Prisma 7 removeu `url`
# da schema (P1012), entao e ELE quem diz onde e o banco.
#
# `.mjs` e nao `.ts`: transpilar o config exigiria `typescript` na imagem.
# E ele importa `dotenv`, que o tracing do Next nao inclui porque nenhum codigo
# da aplicacao usa.
COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.mjs ./prisma.config.mjs
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/dotenv ./node_modules/dotenv

USER nextjs
EXPOSE 3005

CMD ["node", "server.js"]
