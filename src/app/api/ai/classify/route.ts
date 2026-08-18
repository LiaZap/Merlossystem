import { NextResponse } from "next/server"
import { classifyMessage } from "@/lib/ai/classify"
import { prisma } from "@/lib/db/prisma"
import { usuarioDaSessao, semSessao } from "@/lib/sessao"
import { escopoDaLoja, lojaAtiva } from "@/lib/loja"
import { Prisma } from "@prisma/client"
import { z } from "zod"

const schema = z.object({
  messageId: z.string(),
})

export async function POST(req: Request) {
  try {
    const usuario = await usuarioDaSessao()
    if (!usuario) return semSessao()

    const body = await req.json()
    const { messageId } = schema.parse(body)

    // A mensagem so vale se for da loja de quem pediu. Sem o escopo, um
    // vendedor do Centro mandava o id de uma mensagem do Cerro Azul e recebia
    // o texto da cliente de la, e as tags sugeridas iam parar no contato
    // daquela loja.
    const message = await prisma.message.findFirst({
      where: { id: messageId, ...escopoDaLoja(usuario, lojaAtiva(req)) },
      include: {
        conversation: {
          include: {
            contact: { select: { name: true, preferredSize: true, tags: true } },
          },
        },
      },
    })

    // Mensagem de outra loja responde igual a inexistente: separar os dois
    // casos ja confirmaria que aquele id existe.
    if (!message || !message.content) {
      return NextResponse.json({ error: "Mensagem não encontrada" }, { status: 404 })
    }

    const contactContext = message.conversation.contact
      ? `Nome: ${message.conversation.contact.name || "?"}, Tamanho: ${message.conversation.contact.preferredSize || "?"}, Tags: ${message.conversation.contact.tags.join(", ")}`
      : undefined

    const classification = await classifyMessage(message.content, contactContext)

    // Save classification to message
    await prisma.message.update({
      where: { id: messageId },
      data: {
        aiClassification: classification as unknown as Prisma.InputJsonValue,
      },
    })

    // Auto-add suggested tags to contact
    if (classification.tags_suggested.length > 0) {
      const contact = message.conversation.contact
      const currentTags = contact.tags || []
      const newTags = classification.tags_suggested.filter(
        (t) => !currentTags.includes(t)
      )

      if (newTags.length > 0) {
        await prisma.contact.update({
          where: { id: message.conversation.contactId },
          data: { tags: [...currentTags, ...newTags] },
        })
      }
    }

    return NextResponse.json({ classification })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    console.error("[AI Classify] Error:", error)
    return NextResponse.json({ error: "Erro ao classificar" }, { status: 500 })
  }
}
