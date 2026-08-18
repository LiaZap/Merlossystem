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

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# O tracing do Next nao acha o cliente do Prisma (ele e gerado, nao importado
# estaticamente). Sem estas duas copias o container sobe e morre na primeira
# consulta com "@prisma/client did not initialize yet".
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
# `prisma db push` e rodado na mao apos o primeiro deploy; o schema precisa
# estar na imagem para isso.
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts

USER nextjs
EXPOSE 3005

CMD ["node", "server.js"]
