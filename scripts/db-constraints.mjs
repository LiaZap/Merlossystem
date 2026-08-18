#!/usr/bin/env node
// @ts-check
/**
 * db-constraints.mjs — Aplica as constraints que o Prisma nao declara.
 *
 * `prisma db push` sincroniza tabelas, colunas e indices, mas nao CHECK
 * constraint. Sem este passo, a regra "so papel de gestao fica sem loja" viraria
 * comentario no schema — e comentario nao impede insert.
 *
 * Roda junto do push (`npm run db:push`). Idempotente.
 */

import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)
const raiz = join(dirname(fileURLToPath(import.meta.url)), "..")

/** Le DATABASE_URL do ambiente ou do .env, sem depender de pacote externo. */
function urlDoBanco() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  try {
    const env = readFileSync(join(raiz, ".env"), "utf8")
    const m = env.match(/^\s*DATABASE_URL\s*=\s*["']?([^"'\r\n]+)/m)
    if (m) return m[1]
  } catch {
    // sem .env — segue para o erro abaixo
  }
  return null
}

async function main() {
  const url = urlDoBanco()
  if (!url) {
    console.error("DATABASE_URL nao encontrada (nem no ambiente, nem no .env).")
    process.exit(1)
  }

  const sql = readFileSync(join(raiz, "prisma", "sql", "constraints.sql"), "utf8")

  /** @type {any} */
  const pg = require("pg")
  const client = new pg.Client({ connectionString: url })

  try {
    await client.connect()
    await client.query(sql)
    console.log("Constraints aplicadas.")
  } catch (e) {
    console.error("Falha ao aplicar constraints:", e instanceof Error ? e.message : e)
    process.exitCode = 1
  } finally {
    await client.end().catch(() => {})
  }
}

main()
