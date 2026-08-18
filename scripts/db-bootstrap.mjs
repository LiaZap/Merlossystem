/**
 * Cria o schema do banco em producao, sem o CLI do Prisma.
 *
 * POR QUE existe: o CLI do Prisma 7 arrasta uma arvore enorme para rodar
 * (`@prisma/dev` sozinho puxa pglite, hono, effect...). Colocar isso na imagem
 * levaria o runtime de 48 MB para mais de 800 MB — 17x, para um comando usado
 * duas vezes por ano.
 *
 * Entao o SQL e gerado no BUILD (onde o CLI existe) por
 * `prisma migrate diff --from-empty --to-schema`, e aqui so aplicamos com `pg`,
 * que ja vem no bundle da aplicacao.
 *
 * Uso, no terminal do container, apos o primeiro deploy:
 *   node scripts/db-bootstrap.mjs
 *
 * E IDEMPOTENTE no sentido que importa: se o banco ja tem tabelas, nao recria
 * nada e avisa. Nunca derruba dado.
 *
 * DUAS ETAPAS, e a segunda roda SEMPRE:
 *   1. schema.sql       — so em banco vazio (criacao das tabelas);
 *   2. sql/constraints.sql — em toda execucao.
 *
 * A etapa 2 foi acrescentada em 18/08/2026 porque faltava: o script aplicava
 * apenas o schema, e as constraints que o Prisma nao sabe declarar
 * (`users_loja_por_papel`, indices de idempotencia) NUNCA chegavam ao banco de
 * producao — elas so eram aplicadas por `npm run db:push`, que exige o CLI e o
 * repositorio, e portanto nunca rodou contra o deploy. O banco publicado
 * ficava sem as regras que o codigo assume existirem.
 *
 * Por isso `constraints.sql` e escrito para ser reaplicavel (DROP IF EXISTS +
 * ADD, CREATE INDEX IF NOT EXISTS): rodar a cada start e o canal por onde uma
 * constraint nova alcanca um banco que ja existe.
 *
 * LIMITE que continua valendo: isto NAO altera tabela existente (coluna nova,
 * tipo trocado). Para isso, `npx prisma db push` de uma maquina com o
 * repositorio, apontando DATABASE_URL para producao.
 */
import { readFileSync, existsSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)
const pg = require("pg")

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..")
const caminhoSql = join(raiz, "prisma", "schema.sql")

const caminhoConstraints = join(raiz, "prisma", "sql", "constraints.sql")

/**
 * Aplica as regras que o Prisma nao declara. Roda em TODA execucao.
 *
 * Fora da transacao do schema de proposito: se uma constraint nova falhar
 * porque o banco tem dado que a viola (ex.: mensagem duplicada de antes do
 * indice), o schema ja criado nao pode ser desfeito junto. O erro e reportado
 * e o container sobe — a aplicacao funciona sem a regra, e o operador ve o
 * aviso no log em vez de um container que nao inicia.
 */
async function aplicarConstraints(cliente) {
  if (!existsSync(caminhoConstraints)) {
    console.warn(`Sem ${caminhoConstraints} — nenhuma constraint aplicada.`)
    return
  }
  const sql = readFileSync(caminhoConstraints, "utf8").replace(/^﻿/, "")
  try {
    await cliente.query(sql)
    console.log("Constraints aplicadas.")
  } catch (e) {
    console.error(
      "AVISO: falha ao aplicar as constraints — o banco pode ter dado que as viola.\n" +
        `Motivo: ${e.message}\n` +
        "A aplicacao sobe assim mesmo. Resolva o dado e rode de novo."
    )
  }
}

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error("DATABASE_URL nao definida.")
    process.exit(1)
  }

  if (!existsSync(caminhoSql)) {
    console.error(
      `Nao achei ${caminhoSql}.\n` +
        "Ele e gerado no build da imagem. Se voce esta rodando fora do container,\n" +
        "use `npx prisma db push` em vez deste script."
    )
    process.exit(1)
  }

  const cliente = new pg.Client({ connectionString: url })
  await cliente.connect()

  try {
    // Banco ja povoado: sair sem tocar em nada. Reaplicar o SQL de criacao
    // falharia no meio e deixaria o schema pela metade.
    const { rows } = await cliente.query(
      `select count(*)::int as n from information_schema.tables
       where table_schema = 'public' and table_type = 'BASE TABLE'`
    )
    if (rows[0].n > 0) {
      console.log(
        `O banco ja tem ${rows[0].n} tabela(s) — schema preservado.\n` +
          "Para ALTERAR tabela (coluna nova, tipo trocado), rode `npx prisma db push`\n" +
          "de uma maquina com o repositorio, com DATABASE_URL apontando para este banco."
      )
    } else {
      // `replace(/^﻿/, "")`: um BOM no inicio faz o Postgres responder
      // `syntax error at or near ""`, sem dizer o que e. Gerar o arquivo no
      // Windows (PowerShell `Out-File`) produz exatamente isso.
      const sql = readFileSync(caminhoSql, "utf8").replace(/^﻿/, "")
      // Tudo ou nada: schema pela metade e pior do que schema nenhum, porque o
      // guard acima passaria a achar que o banco esta pronto.
      await cliente.query("BEGIN")
      await cliente.query(sql)
      await cliente.query("COMMIT")

      const { rows: criadas } = await cliente.query(
        `select count(*)::int as n from information_schema.tables
         where table_schema = 'public' and table_type = 'BASE TABLE'`
      )
      console.log(`Schema criado: ${criadas[0].n} tabelas.`)
    }

    await aplicarConstraints(cliente)
  } catch (e) {
    await cliente.query("ROLLBACK").catch(() => {})
    throw e
  } finally {
    await cliente.end()
  }
}

main().catch((e) => {
  console.error("Falha ao criar o schema:", e.message)
  process.exit(1)
})
