import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { usuarioDaSessao, semSessao } from "@/lib/sessao"
import { escopoDaLoja, lojaAtiva, foraDaLoja } from "@/lib/loja"
import { z } from "zod"

const surveySchema = z.object({
  contactId: z.string(),
  conversationId: z.string().optional().nullable(),
  orderId: z.string().optional().nullable(),
  triggerType: z.string(),
})

export async function GET(req: Request) {
  const usuario = await usuarioDaSessao()
  if (!usuario) return semSessao()

  const { searchParams } = new URL(req.url)
  const contactId = searchParams.get("contactId") || ""

  const where: Record<string, unknown> = { ...escopoDaLoja(usuario, lojaAtiva(req)) }
  if (contactId) where.contactId = contactId

  const surveys = await prisma.satisfactionSurvey.findMany({
    where,
    include: {
      contact: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  })

  // Calculate CSAT average
  const scored = surveys.filter((s) => s.score !== null)
  const avgScore = scored.length > 0
    ? scored.reduce((sum, s) => sum + (s.score || 0), 0) / scored.length
    : 0

  return NextResponse.json({ surveys, avgScore, totalResponses: scored.length })
}

export async function POST(req: Request) {
  try {
    const usuario = await usuarioDaSessao()
    if (!usuario) return semSessao()


    const body = await req.json()
    const data = surveySchema.parse(body)

    // A loja vem do contato, nao de um parametro: se o contato nao esta no
    // escopo de quem pediu, a busca nao acha e o registro nao nasce.
    const contato = await prisma.contact.findFirst({
      where: { id: data.contactId, ...escopoDaLoja(usuario, lojaAtiva(req)) },
      select: { storeId: true },
    })
    if (!contato) return foraDaLoja("Contato")
    const storeId = contato.storeId

    const survey = await prisma.satisfactionSurvey.create({
      data: {
        storeId,
        ...data,
        sentAt: new Date(),
      },
    })

    return NextResponse.json(survey, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    return NextResponse.json({ error: "Erro ao criar pesquisa" }, { status: 500 })
  }
}
