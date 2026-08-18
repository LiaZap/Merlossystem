import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db/prisma"
import { usuarioDaSessao, semSessao } from "@/lib/sessao"
import { escopoDaLoja, lojaAtiva, lojaParaGravar, faltaLoja, foraDaLoja } from "@/lib/loja"
import { z } from "zod"

const broadcastSchema = z.object({
  name: z.string().min(1),
  templateId: z.string(),
  channel: z.string().default("whatsapp"),
  segmentFilter: z.record(z.string(), z.unknown()),
  content: z.string().optional().nullable(),
  mediaIds: z.array(z.string()).default([]),
  scheduledFor: z.string().optional().nullable(),
  // `createdBy` NAO entra aqui: quem criou a campanha vem da sessao.
})

export async function GET(req: Request) {
  const usuario = await usuarioDaSessao()
  if (!usuario) return semSessao()

  const { searchParams } = new URL(req.url)
  const status = searchParams.get("status") || ""

  const where: Record<string, unknown> = { ...escopoDaLoja(usuario, lojaAtiva(req)) }
  if (status && status !== "all") where.status = status

  const broadcasts = await prisma.broadcast.findMany({
    where,
    include: {
      template: { select: { id: true, name: true } },
      creator: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json(broadcasts)
}

export async function POST(req: Request) {
  try {
    const usuario = await usuarioDaSessao()
    if (!usuario) return semSessao()

    const body = await req.json()
    const data = broadcastSchema.parse(body)

    const storeId = lojaParaGravar(usuario, lojaAtiva(req))
    if (!storeId) return faltaLoja()

    // O `templateId` vem do corpo, entao o escopo da listagem nao alcanca ele:
    // sem esta conferencia o Centro montava campanha com o template aprovado do
    // Cerro Azul e disparava o texto da outra loja para os clientes dele.
    const template = await prisma.whatsappTemplate.findFirst({
      where: { id: data.templateId, storeId },
      select: { id: true },
    })
    if (!template) return foraDaLoja("Template")

    // Count recipients based on segment filter
    const filter = data.segmentFilter as Record<string, unknown>
    // A contagem de destinatarios tambem e por loja: campanha do Centro nao
    // conta cliente do Cerro Azul.
    const contactWhere: Record<string, unknown> = { optOut: false, storeId }

    if (filter.tags && Array.isArray(filter.tags) && filter.tags.length > 0) {
      contactWhere.tags = { hasEvery: filter.tags as string[] }
    }
    if (filter.preferred_size) {
      contactWhere.preferredSize = filter.preferred_size
    }
    if (filter.min_spent) {
      contactWhere.totalSpent = { gte: filter.min_spent }
    }
    if (filter.max_days_since_purchase) {
      const since = new Date()
      since.setDate(since.getDate() - (filter.max_days_since_purchase as number))
      contactWhere.lastContactAt = { gte: since }
    }

    const recipientCount = await prisma.contact.count({ where: contactWhere })

    const broadcast = await prisma.broadcast.create({
      data: {
        storeId,
        name: data.name,
        templateId: data.templateId,
        channel: data.channel,
        segmentFilter: data.segmentFilter as Prisma.InputJsonValue,
        content: data.content || null,
        mediaIds: data.mediaIds,
        totalRecipients: recipientCount,
        status: data.scheduledFor ? "scheduled" : "draft",
        scheduledFor: data.scheduledFor ? new Date(data.scheduledFor) : null,
        createdBy: usuario.id,
      },
      include: {
        template: { select: { id: true, name: true } },
      },
    })

    return NextResponse.json(broadcast, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    console.error("[Broadcasts] Error:", error)
    return NextResponse.json({ error: "Erro ao criar broadcast" }, { status: 500 })
  }
}
