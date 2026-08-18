import { prisma } from "@/lib/db/prisma"
import { Prisma } from "@prisma/client"
import { subirDeUrl, getFileTypeFromMime, urlInterna, urlInternaThumb } from "@/lib/media/upload"
import type {
  ChannelType,
  IncomingMessage,
  StatusUpdate,
  ContentType,
} from "./types"

// Maps channel sender IDs to the correct contact field
const CHANNEL_ID_FIELD: Record<ChannelType, string> = {
  whatsapp: "whatsappId",
  instagram: "instagramId",
  facebook: "facebookId",
  tiktok: "tiktokId",
}

/**
 * Process an incoming message from any channel.
 * Creates contact/conversation if needed, saves message, handles media.
 *
 * `conta` e obrigatoria: e a integracao que RECEBEU o evento. Dela sai a loja
 * (carteira isolada — decisao 5) e o vinculo da conversa, que e o que faz a
 * resposta sair pelo mesmo numero em que a mensagem entrou.
 *
 * Sem isso, mensagem que chega no numero do Cerro Azul encontraria a contato do
 * Centro e penduraria a conversa na carteira errada.
 *
 * Quem resolve a conta e a rota de webhook, por `(provedor, referencia_externa)`
 * — ver `src/lib/roteamento.ts`.
 */
export async function processIncomingMessage(
  msg: IncomingMessage,
  conta: { id: string; storeId: string }
) {
  const storeId = conta.storeId
  const idField = CHANNEL_ID_FIELD[msg.channel]

  // 1. Find or create contact — SEMPRE dentro da loja.
  let contact = await prisma.contact.findFirst({
    where: { storeId, [idField]: msg.senderId },
  })

  if (!contact) {
    contact = await prisma.contact.create({
      data: {
        storeId,
        name: msg.senderName || null,
        avatarUrl: msg.senderAvatarUrl || null,
        [idField]: msg.senderId,
        // Also set phone for WhatsApp
        ...(msg.channel === "whatsapp" && { phone: msg.senderId }),
      },
    })
  } else if (msg.senderName && !contact.name) {
    // Update name if we didn't have it
    await prisma.contact.update({
      where: { id: contact.id },
      data: { name: msg.senderName },
    })
  }

  // 2. Find or create conversation
  // A conversa e por CONTA, nao por canal: a mesma cliente falando com o
  // numero de vendas e com o de SAC tem duas conversas, cada uma respondendo
  // pelo seu numero.
  let conversation = await prisma.conversation.findFirst({
    where: {
      storeId,
      contactId: contact.id,
      channel: msg.channel,
      storeIntegracaoId: conta.id,
      status: { in: ["open", "pending"] },
    },
    orderBy: { lastMessageAt: "desc" },
  })

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        storeId,
        storeIntegracaoId: conta.id,
        contactId: contact.id,
        channel: msg.channel,
        status: "open",
        priority: "medium",
        lastMessageAt: msg.timestamp,
        lastMessagePreview: msg.text?.slice(0, 100) || `[${msg.contentType}]`,
        unreadCount: 1,
      },
    })
  } else {
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: msg.timestamp,
        lastMessagePreview: msg.text?.slice(0, 100) || `[${msg.contentType}]`,
        unreadCount: { increment: 1 },
        status: "open",
      },
    })
  }

  // 3. Midia: baixa do canal e guarda no MinIO (ADR 0006)
  let mediaFileId: string | undefined
  let transcriptionStatus: string | undefined

  if (msg.mediaUrl && msg.contentType !== "text") {
    try {
      const fileType = msg.mediaMimeType
        ? getFileTypeFromMime(msg.mediaMimeType)
        : (msg.contentType as "image" | "video" | "audio" | "document")

      const uploaded = await subirDeUrl(msg.mediaUrl, {
        storeId,
        pasta: msg.channel,
        mimeType: msg.mediaMimeType,
      })

      // Id gerado aqui: `fileUrl` aponta para a rota autenticada
      // `/api/media/{id}/raw`, que precisa do id antes da gravacao.
      const id = crypto.randomUUID()

      const mediaFile = await prisma.mediaFile.create({
        data: {
          id,
          storeId,
          originalName: null,
          fileKey: uploaded.chave,
          fileUrl: urlInterna(id),
          thumbnailKey: uploaded.chaveThumb || null,
          thumbnailUrl: uploaded.chaveThumb ? urlInternaThumb(id) : null,
          fileType,
          mimeType: msg.mediaMimeType || null,
          fileSize: uploaded.bytes,
          width: uploaded.width || null,
          height: uploaded.height || null,
          folder: "incoming",
        },
      })

      mediaFileId = mediaFile.id

      // Mark audio for transcription (will be processed by worker later)
      if (fileType === "audio") {
        transcriptionStatus = "pending"
      }
    } catch (error) {
      console.error(`Failed to process media from ${msg.channel}:`, error)
    }
  }

  // 4. Save message
  const message = await prisma.message.create({
    data: {
      storeId,
      conversationId: conversation.id,
      senderType: "customer",
      content: msg.text || null,
      contentType: msg.contentType,
      externalId: msg.externalId,
      replyToId: null,
      metadata: (msg.metadata || {}) as Prisma.InputJsonValue,
      createdAt: msg.timestamp,
    },
  })

  // 5. Create message_media if we have media
  if (mediaFileId || msg.mediaUrl) {
    await prisma.messageMedia.create({
      data: {
        messageId: message.id,
        mediaFileId: mediaFileId || null,
        externalUrl: msg.mediaUrl || null,
        externalId: msg.mediaId || null,
        fileType: msg.contentType !== "text" ? msg.contentType : null,
        mimeType: msg.mediaMimeType || null,
        caption: msg.mediaCaption || null,
        downloaded: !!mediaFileId,
        transcriptionStatus: transcriptionStatus || null,
      },
    })
  }

  // 6. Update contact lastContactAt
  await prisma.contact.update({
    where: { id: contact.id },
    data: { lastContactAt: msg.timestamp },
  })

  return { contact, conversation, message }
}

/**
 * Process a delivery status update from any channel.
 */
export async function processStatusUpdate(update: StatusUpdate) {
  const message = await prisma.message.findFirst({
    where: { externalId: update.externalMessageId },
  })

  if (!message) return

  await prisma.message.update({
    where: { id: message.id },
    data: {
      externalStatus: update.status,
      ...(update.status === "read" && { readAt: update.timestamp }),
    },
  })
}

/**
 * Save an outgoing message sent by an agent.
 *
 * A mensagem e gravada TAMBEM quando o canal recusa o envio (`erroDeEnvio`).
 * Antes o route handler retornava 500 antes de chegar aqui, e a mensagem nao
 * existia em lugar nenhum: a atendente via um toast e o texto sumia da tela,
 * sem registro do que tentou mandar e sem como reenviar. Token vencido ou
 * janela de 24h fechada viravam trabalho perdido em silencio.
 */
export async function saveOutgoingMessage(opts: {
  conversationId: string
  /** Loja da conversa — a mensagem herda dela, nunca de um parametro solto. */
  storeId: string
  senderId: string
  content?: string
  contentType: ContentType
  externalId?: string
  mediaFileId?: string
  mediaCaption?: string
  /** Motivo da recusa do canal. Presente => grava a mensagem como `failed`. */
  erroDeEnvio?: string
}) {
  const falhou = Boolean(opts.erroDeEnvio)

  const message = await prisma.message.create({
    data: {
      storeId: opts.storeId,
      conversationId: opts.conversationId,
      senderType: "agent",
      senderId: opts.senderId,
      content: opts.content || null,
      contentType: opts.contentType,
      externalId: opts.externalId || null,
      externalStatus: falhou ? "failed" : opts.externalId ? "sent" : null,
      // O motivo fica na mensagem para a atendente ler no tooltip da bolha
      // vermelha ("numero nao tem WhatsApp", "janela de 24h fechada"), em vez
      // de um "erro ao enviar" que nao diz o que fazer.
      metadata: falhou ? { erroDeEnvio: opts.erroDeEnvio } : {},
    },
  })

  if (opts.mediaFileId) {
    await prisma.messageMedia.create({
      data: {
        messageId: message.id,
        mediaFileId: opts.mediaFileId,
        caption: opts.mediaCaption || null,
        downloaded: true,
      },
    })
  }

  // Update conversation
  await prisma.conversation.update({
    where: { id: opts.conversationId },
    data: {
      lastMessageAt: new Date(),
      lastMessagePreview: opts.content?.slice(0, 100) || `[${opts.contentType}]`,
      unreadCount: 0,
    },
  })

  return message
}
