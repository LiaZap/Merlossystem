import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { getAdapterDaConta } from "@/lib/channels"
import { saveOutgoingMessage } from "@/lib/channels/gateway"
import { contaDaConversa, credenciaisDaConta } from "@/lib/roteamento"
import type { ChannelType } from "@/lib/channels/types"
import { usuarioDaSessao, semSessao } from "@/lib/sessao"
import { escopoDaLoja, lojaAtiva } from "@/lib/loja"
import { urlAssinada } from "@/lib/media/armazenamento"
import { z } from "zod"

// `senderId` NAO entra aqui: quem enviou vem da sessao.
const sendSchema = z.object({
  conversationId: z.string(),
  content: z.string().optional(),
  contentType: z.string().default("text"),
  mediaFileId: z.string().optional(),
  mediaCaption: z.string().optional(),
  isInternalNote: z.boolean().default(false),
})

/**
 * GET: List messages for a conversation
 */
export async function GET(req: Request) {
  const usuario = await usuarioDaSessao()
  if (!usuario) return semSessao()

  const { searchParams } = new URL(req.url)
  const conversationId = searchParams.get("conversationId")
  const limit = parseInt(searchParams.get("limit") || "50")
  const before = searchParams.get("before") // cursor-based pagination

  if (!conversationId) {
    return NextResponse.json(
      { error: "conversationId is required" },
      { status: 400 }
    )
  }

  // O escopo entra aqui tambem: sem ele bastava adivinhar um conversationId
  // para ler a conversa da outra loja.
  const messages = await prisma.message.findMany({
    where: {
      conversationId,
      ...escopoDaLoja(usuario, lojaAtiva(req)),
      ...(before && { createdAt: { lt: new Date(before) } }),
    },
    include: {
      media: {
        include: { mediaFile: true },
      },
      sender: {
        select: { id: true, name: true, avatarUrl: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  })

  // Return in chronological order
  return NextResponse.json(messages.reverse())
}

/**
 * POST: Send a message via the appropriate channel
 */
export async function POST(req: Request) {
  try {
    const usuario = await usuarioDaSessao()
    if (!usuario) return semSessao()

    const body = await req.json()
    const data = sendSchema.parse(body)

    // Get the conversation to determine channel and recipient.
    // `findFirst` + escopo em vez de `findUnique`: a conversa tem que estar na
    // loja de quem esta enviando. A mensagem herda a loja dela.
    const conversation = await prisma.conversation.findFirst({
      where: { id: data.conversationId, ...escopoDaLoja(usuario, lojaAtiva(req)) },
      include: { contact: true },
    })

    if (!conversation) {
      return NextResponse.json(
        { error: "Conversa não encontrada" },
        { status: 404 }
      )
    }

    // Internal notes don't get sent to the channel
    if (data.isInternalNote) {
      const message = await prisma.message.create({
        data: {
          storeId: conversation.storeId,
          conversationId: data.conversationId,
          senderType: "agent",
          senderId: usuario.id,
          content: data.content || null,
          contentType: "text",
          isInternalNote: true,
        },
      })
      return NextResponse.json(message, { status: 201 })
    }

    // Determine recipient ID for the channel
    const channel = conversation.channel as ChannelType
    const contact = conversation.contact
    const recipientId =
      channel === "whatsapp"
        ? contact.whatsappId || contact.phone
        : channel === "instagram"
          ? contact.instagramId
          : channel === "facebook"
            ? contact.facebookId
            : contact.tiktokId

    if (!recipientId) {
      return NextResponse.json(
        { error: `Contato não tem ID para o canal ${channel}` },
        { status: 400 }
      )
    }

    // Get media URL if sending media
    let mediaUrl: string | undefined
    if (data.mediaFileId) {
      // `findFirst` + loja da conversa, nao `findUnique` por id: o guard de
      // soft delete nao alcanca `findUnique`, entao arquivo ja excluido
      // continuaria enviavel — e o id vem do corpo, entao tambem servia para
      // mandar midia da outra loja para a cliente.
      const mediaFile = await prisma.mediaFile.findFirst({
        where: { id: data.mediaFileId, storeId: conversation.storeId },
      })
      // URL ASSINADA, nao `fileUrl`: quem baixa a midia e a Meta/uazapi, do
      // lado de fora, e `fileUrl` aponta para a nossa rota autenticada — eles
      // receberiam 401 e a mensagem chegaria sem imagem. TTL curto: a URL
      // viaja para fora do nosso perimetro (ADR 0006).
      if (mediaFile) mediaUrl = await urlAssinada(mediaFile.fileKey)
    }

    // Send via channel adapter
    // Responde pela MESMA conta em que a mensagem entrou: a cliente que
    // escreveu para o SAC nao pode receber resposta pelo numero de vendas.
    const conta = await contaDaConversa(data.conversationId)
    const credenciais = conta ? await credenciaisDaConta(conta.id) : null
    const adapter = getAdapterDaConta(channel, credenciais, conta?.provedor)
    let result

    switch (data.contentType) {
      case "text":
        result = await adapter.sendText(recipientId, data.content || "")
        break
      case "image":
        result = await adapter.sendImage(
          recipientId,
          mediaUrl || "",
          data.mediaCaption
        )
        break
      case "video":
        result = await adapter.sendVideo(
          recipientId,
          mediaUrl || "",
          data.mediaCaption
        )
        break
      case "audio":
        result = await adapter.sendAudio(recipientId, mediaUrl || "")
        break
      case "document":
        result = await adapter.sendDocument(
          recipientId,
          mediaUrl || "",
          "document"
        )
        break
      default:
        result = await adapter.sendText(recipientId, data.content || "")
    }

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Falha ao enviar mensagem" },
        { status: 500 }
      )
    }

    // Save outgoing message
    const message = await saveOutgoingMessage({
      conversationId: data.conversationId,
      storeId: conversation.storeId,
      senderId: usuario.id,
      content: data.content,
      contentType: data.contentType as "text" | "image" | "video" | "audio" | "document",
      externalId: result.externalId,
      mediaFileId: data.mediaFileId,
      mediaCaption: data.mediaCaption,
    })

    return NextResponse.json(message, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    console.error("[Messages API] Error:", error)
    return NextResponse.json(
      { error: "Erro ao enviar mensagem" },
      { status: 500 }
    )
  }
}
