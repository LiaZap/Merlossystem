import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { usuarioDaSessao, semSessao } from "@/lib/sessao"
import { escopoDaLoja, lojaAtiva } from "@/lib/loja"
import { limiteDaPagina, paginaAtual } from "@/lib/paginacao"

export async function GET(req: Request) {
  const usuario = await usuarioDaSessao()
  if (!usuario) return semSessao()

  const { searchParams } = new URL(req.url)
  const type = searchParams.get("type") || ""
  const severity = searchParams.get("severity") || ""
  const acknowledged = searchParams.get("acknowledged") || ""
  const page = paginaAtual(searchParams.get("page"))
  const limit = limiteDaPagina(searchParams.get("limit"), 30)

  const where: Record<string, unknown> = { ...escopoDaLoja(usuario, lojaAtiva(req)) }

  if (type && type !== "all") where.type = type
  if (severity && severity !== "all") where.severity = severity
  if (acknowledged === "false") where.acknowledgedAt = null
  else if (acknowledged === "true") where.acknowledgedAt = { not: null }

  const [alerts, total, unacknowledgedCount] = await Promise.all([
    prisma.alert.findMany({
      where,
      include: {
        conversation: {
          select: { id: true, channel: true },
        },
        contact: {
          select: { id: true, name: true, phone: true },
        },
        order: {
          select: { id: true, orderNumber: true },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.alert.count({ where }),
    prisma.alert.count({ where: { acknowledgedAt: null } }),
  ])

  return NextResponse.json({ alerts, total, unacknowledgedCount, page, limit })
}
