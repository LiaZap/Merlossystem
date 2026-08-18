import { NextResponse } from "next/server"
import { filtroDoSegmento } from "@/lib/broadcasts/disparo"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db/prisma"
import { usuarioDaSessao, semSessao } from "@/lib/sessao"
import { escopoDaLoja, lojaAtiva, lojaParaGravar, faltaLoja, foraDaLoja } from "@/lib/loja"
import { z } from "zod"

const broadcastSchema = z.object({
  /** Por qual conta a campanha sai. Obrigatoria quando a loja tem mais de uma. */
  storeIntegracaoId: z.string().optional().nullable(),
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

    // O MESMO filtro que o disparo usa (lib/broadcasts/disparo.ts). Quando a
    // contagem e o envio tinham cada um a sua copia, "vai para 300 clientes" e
    // "saiu para 287" divergiam sem ninguem entender por que.
    const contactWhere = filtroDoSegmento(storeId, data.segmentFilter)
    const recipientCount = await prisma.contact.count({ where: contactWhere })

    // A conta de envio tem que ser da loja. O id vem do corpo do request.
    let contaId: string | null = data.storeIntegracaoId ?? null
    if (contaId) {
      const conta = await prisma.storeIntegracao.findFirst({
        where: { id: contaId, storeId, isDeleted: false },
        select: { id: true },
      })
      if (!conta) return foraDaLoja("Conta de envio")
    } else {
      // Loja com UMA conta do canal: usar aquela nao e adivinhar. Com duas ou
      // mais, a escolha fica para quem cria — mandar marketing pelo numero do
      // SAC e um erro que so aparece depois de a cliente receber.
      const contas = await prisma.storeIntegracao.findMany({
        where: { storeId, isDeleted: false, provedor: { in: ["whatsapp_oficial", "uazapi"] } },
        select: { id: true },
      })
      if (contas.length === 1) contaId = contas[0].id
    }

    const broadcast = await prisma.broadcast.create({
      data: {
        storeId,
        name: data.name,
        templateId: data.templateId,
        channel: data.channel,
        storeIntegracaoId: contaId,
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
