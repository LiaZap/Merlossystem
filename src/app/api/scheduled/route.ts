import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { usuarioDaSessao, semSessao } from "@/lib/sessao"
import { escopoDaLoja, lojaAtiva, foraDaLoja } from "@/lib/loja"
import { z } from "zod"

const scheduleSchema = z.object({
  contactId: z.string(),
  conversationId: z.string().optional().nullable(),
  content: z.string().min(1),
  contentType: z.string().default("text"),
  templateId: z.string().optional().nullable(),
  templateVars: z.array(z.string()).default([]),
  mediaIds: z.array(z.string()).default([]),
  scheduledFor: z.string(), // ISO date string
  triggerType: z.string(), // manual | follow_up | post_sale | abandoned | reactivation | birthday | promotion
  // `createdBy` NAO entra aqui: quem agendou vem da sessao.
})

export async function GET(req: Request) {
  const usuario = await usuarioDaSessao()
  if (!usuario) return semSessao()

  const { searchParams } = new URL(req.url)
  const status = searchParams.get("status") || ""
  const triggerType = searchParams.get("triggerType") || ""
  const contactId = searchParams.get("contactId") || ""

  const where: Record<string, unknown> = { ...escopoDaLoja(usuario, lojaAtiva(req)) }
  if (status && status !== "all") where.status = status
  if (triggerType && triggerType !== "all") where.triggerType = triggerType
  if (contactId) where.contactId = contactId

  const messages = await prisma.scheduledMessage.findMany({
    where,
    include: {
      contact: { select: { id: true, name: true, phone: true } },
      template: { select: { id: true, name: true } },
    },
    orderBy: { scheduledFor: "asc" },
    take: 50,
  })

  return NextResponse.json(messages)
}

export async function POST(req: Request) {
  try {
    const usuario = await usuarioDaSessao()
    if (!usuario) return semSessao()

    const body = await req.json()
    const data = scheduleSchema.parse(body)

    // A loja vem do contato — e a busca com escopo impede agendar para
    // contato de outra loja.
    const contato = await prisma.contact.findFirst({
      where: { id: data.contactId, ...escopoDaLoja(usuario, lojaAtiva(req)) },
      select: { storeId: true },
    })
    if (!contato) return foraDaLoja("Contato")

    const message = await prisma.scheduledMessage.create({
      data: {
        ...data,
        storeId: contato.storeId,
        scheduledFor: new Date(data.scheduledFor),
        createdBy: usuario.id,
      },
      include: {
        contact: { select: { id: true, name: true } },
      },
    })

    return NextResponse.json(message, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    return NextResponse.json({ error: "Erro ao agendar mensagem" }, { status: 500 })
  }
}
