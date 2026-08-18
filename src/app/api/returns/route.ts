import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db/prisma"
import { usuarioDaSessao, semSessao } from "@/lib/sessao"
import { escopoDaLoja, lojaAtiva, foraDaLoja } from "@/lib/loja"
import { z } from "zod"

const returnSchema = z.object({
  orderId: z.string(),
  contactId: z.string(),
  conversationId: z.string().optional().nullable(),
  type: z.string(), // exchange | return | refund
  reason: z.string(), // wrong_size | defect | not_as_expected | changed_mind | other
  reasonDetail: z.string().optional().nullable(),
  items: z.array(z.record(z.string(), z.unknown())),
  mediaIds: z.array(z.string()).default([]),
})

export async function GET(req: Request) {
  const usuario = await usuarioDaSessao()
  if (!usuario) return semSessao()

  const { searchParams } = new URL(req.url)
  const status = searchParams.get("status") || ""

  const where: Record<string, unknown> = { ...escopoDaLoja(usuario, lojaAtiva(req)) }
  if (status && status !== "all") where.status = status

  const returns = await prisma.return.findMany({
    where,
    include: {
      contact: { select: { id: true, name: true, phone: true } },
      order: { select: { id: true, orderNumber: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json(returns)
}

export async function POST(req: Request) {
  try {
    const usuario = await usuarioDaSessao()
    if (!usuario) return semSessao()


    const body = await req.json()
    const data = returnSchema.parse(body)

    // A loja vem do contato, nao de um parametro: se o contato nao esta no
    // escopo de quem pediu, a busca nao acha e o registro nao nasce.
    const contato = await prisma.contact.findFirst({
      where: { id: data.contactId, ...escopoDaLoja(usuario, lojaAtiva(req)) },
      select: { storeId: true },
    })
    if (!contato) return foraDaLoja("Contato")
    const storeId = contato.storeId

    const ret = await prisma.return.create({
      data: {
        storeId,
        ...data,
        items: data.items as Prisma.InputJsonValue,
        status: "requested",
      },
      include: {
        contact: { select: { id: true, name: true } },
        order: { select: { id: true, orderNumber: true } },
      },
    })

    return NextResponse.json(ret, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    return NextResponse.json({ error: "Erro ao criar solicitação" }, { status: 500 })
  }
}
