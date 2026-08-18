import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import pg from "pg"
import { comSoftDelete } from "./soft-delete"

type ClienteComSoftDelete = ReturnType<typeof comSoftDelete<PrismaClient>>

const globalForPrisma = globalThis as unknown as {
  prisma: ClienteComSoftDelete | undefined
  pool: pg.Pool | undefined
}

function createPrismaClient() {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
  })
  globalForPrisma.pool = pool
  const adapter = new PrismaPg(pool)
  // O soft delete mora aqui, nao em cada consulta: registro excluido nao volta
  // por esquecimento de um `where` (src/lib/db/soft-delete.ts).
  return comSoftDelete(new PrismaClient({ adapter }))
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma
