import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db/prisma"
import { usuarioDaSessao, semSessao } from "@/lib/sessao"
import { escopoDaLoja, lojaAtiva, lojaParaGravar, faltaLoja } from "@/lib/loja"
import { limiteDaPagina, paginaAtual } from "@/lib/paginacao"

export async function GET(req: Request) {
  const usuario = await usuarioDaSessao()
  if (!usuario) return semSessao()

  const { searchParams } = new URL(req.url)
  const userId = searchParams.get("userId") || ""
  const action = searchParams.get("action") || ""
  const entityType = searchParams.get("entityType") || ""
  const page = paginaAtual(searchParams.get("page"))
  const limit = limiteDaPagina(searchParams.get("limit"), 50)

  const where: Record<string, unknown> = { ...escopoDaLoja(usuario, lojaAtiva(req)) }
  if (userId) where.userId = userId
  if (action) where.action = action
  if (entityType) where.entityType = entityType

  const [logs, total] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      include: { user: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.activityLog.count({ where }),
  ])

  return NextResponse.json({ logs, total, page, limit })
}

/**
 * POST: grava uma entrada na trilha de auditoria.
 *
 * `userId` e `ipAddress` vem do servidor. Trilha em que o autor escolhe o
 * proprio nome — e o proprio IP — nao serve para auditar ninguem.
 */
export async function POST(req: Request) {
  const usuario = await usuarioDaSessao()
  if (!usuario) return semSessao()

  const storeId = lojaParaGravar(usuario, lojaAtiva(req))
  if (!storeId) return faltaLoja()

  const body = await req.json()

  const log = await prisma.activityLog.create({
    data: {
      storeId,
      userId: usuario.id,
      action: body.action,
      entityType: body.entityType || null,
      entityId: body.entityId || null,
      details: (body.details || {}) as Prisma.InputJsonValue,
      ipAddress:
        req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
        req.headers.get("x-real-ip") ||
        null,
    },
  })

  return NextResponse.json(log, { status: 201 })
}
