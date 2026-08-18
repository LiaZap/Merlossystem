// Configuracao do Prisma CLI.
//
// `.mjs` e nao `.ts` de proposito: na imagem de producao nao ha `typescript`
// para transpilar o config, e sem o config o CLI nao sabe onde e o banco — o
// Prisma 7 removeu `url` da schema (P1012). JavaScript puro carrega direto.
import "dotenv/config"
import { defineConfig } from "prisma/config"

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
})
