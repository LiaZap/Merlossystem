import type {
  ChannelAdapter,
  SendResult,
  DownloadedMedia,
  IncomingMessage,
  StatusUpdate,
  MediaLimits,
} from "./types"

const GRAPH_API = "https://graph.facebook.com/v21.0"

/** Credenciais de UM numero de WhatsApp. */
export type ConfigWhatsApp = {
  phoneId: string
  accessToken: string
  verifyToken?: string
}

/**
 * Configuracao vinda do ambiente — o numero unico de antes do multi-conta.
 * Lida a cada chamada (nao no import) para nao congelar env no boot.
 */
function configDoAmbiente(): ConfigWhatsApp {
  return {
    phoneId: process.env.WHATSAPP_PHONE_ID!,
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN!,
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN!,
  }
}

/**
 * O adapter recebe um GETTER de configuracao, nao a configuracao pronta.
 *
 * Com getter, o adapter do ambiente continua lendo `process.env` na hora da
 * chamada (como antes), e o adapter de uma conta especifica devolve sempre a
 * credencial daquela conta. Sem estado global — duas requisicoes simultaneas
 * para numeros diferentes nao se atropelam.
 */
function criarAdapter(obterConfig: () => ConfigWhatsApp): ChannelAdapter {
  const getConfig = obterConfig

  async function graphFetch(
    path: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const { accessToken } = getConfig()
    return fetch(`${GRAPH_API}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    })
  }

  return criarCorpoDoAdapter(getConfig, graphFetch)
}

/** Adapter de um numero especifico — usado pelo roteamento por conta. */
export function criarWhatsappAdapter(config: ConfigWhatsApp): ChannelAdapter {
  return criarAdapter(() => config)
}

// ============================================================
// WhatsApp Channel Adapter
// ============================================================

/** Corpo do adapter — as credenciais vem do getter, nunca de env direto. */
function criarCorpoDoAdapter(
  getConfig: () => ConfigWhatsApp,
  graphFetch: (path: string, options?: RequestInit) => Promise<Response>
): ChannelAdapter {
  return {
    channel: "whatsapp",

    limits: {
      image: 5 * 1024 * 1024,
      video: 16 * 1024 * 1024,
      audio: 16 * 1024 * 1024,
      document: 100 * 1024 * 1024,
    } as MediaLimits,

    async sendText(to: string, text: string): Promise<SendResult> {
      const { phoneId } = getConfig()
      const res = await graphFetch(`/${phoneId}/messages`, {
        method: "POST",
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { body: text },
        }),
      })

      const data = await res.json()
      if (!res.ok) return { success: false, error: data.error?.message }
      return { success: true, externalId: data.messages?.[0]?.id }
    },

    async sendImage(
      to: string,
      url: string,
      caption?: string
    ): Promise<SendResult> {
      const { phoneId } = getConfig()
      const res = await graphFetch(`/${phoneId}/messages`, {
        method: "POST",
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "image",
          image: { link: url, caption },
        }),
      })

      const data = await res.json()
      if (!res.ok) return { success: false, error: data.error?.message }
      return { success: true, externalId: data.messages?.[0]?.id }
    },

    async sendVideo(
      to: string,
      url: string,
      caption?: string
    ): Promise<SendResult> {
      const { phoneId } = getConfig()
      const res = await graphFetch(`/${phoneId}/messages`, {
        method: "POST",
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "video",
          video: { link: url, caption },
        }),
      })

      const data = await res.json()
      if (!res.ok) return { success: false, error: data.error?.message }
      return { success: true, externalId: data.messages?.[0]?.id }
    },

    async sendAudio(to: string, url: string): Promise<SendResult> {
      const { phoneId } = getConfig()
      const res = await graphFetch(`/${phoneId}/messages`, {
        method: "POST",
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "audio",
          audio: { link: url },
        }),
      })

      const data = await res.json()
      if (!res.ok) return { success: false, error: data.error?.message }
      return { success: true, externalId: data.messages?.[0]?.id }
    },

    async sendDocument(
      to: string,
      url: string,
      filename: string
    ): Promise<SendResult> {
      const { phoneId } = getConfig()
      const res = await graphFetch(`/${phoneId}/messages`, {
        method: "POST",
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "document",
          document: { link: url, filename },
        }),
      })

      const data = await res.json()
      if (!res.ok) return { success: false, error: data.error?.message }
      return { success: true, externalId: data.messages?.[0]?.id }
    },

    async sendTemplate(
      to: string,
      templateName: string,
      vars: string[],
      language: string = "pt_BR"
    ): Promise<SendResult> {
      const { phoneId } = getConfig()
      const res = await graphFetch(`/${phoneId}/messages`, {
        method: "POST",
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "template",
          template: {
            name: templateName,
            language: { code: language },
            components: vars.length
              ? [
                  {
                    type: "body",
                    parameters: vars.map((v) => ({
                      type: "text",
                      text: v,
                    })),
                  },
                ]
              : undefined,
          },
        }),
      })

      const data = await res.json()
      if (!res.ok) return { success: false, error: data.error?.message }
      return { success: true, externalId: data.messages?.[0]?.id }
    },

    async downloadMedia(mediaId: string): Promise<DownloadedMedia> {
      // Step 1: Get media URL
      const metaRes = await graphFetch(`/${mediaId}`)
      const meta = await metaRes.json()

      if (!meta.url) {
        throw new Error(`Could not get URL for media ${mediaId}`)
      }

      // Step 2: Download the file
      const { accessToken } = getConfig()
      const fileRes = await fetch(meta.url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })

      if (!fileRes.ok) {
        throw new Error(`Failed to download media: ${fileRes.status}`)
      }

      const arrayBuffer = await fileRes.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)

      return {
        buffer,
        mimeType: meta.mime_type || "application/octet-stream",
        size: buffer.length,
      }
    },
  }
}

/** Adapter do numero configurado por ambiente (compatibilidade). */
export const whatsappAdapter: ChannelAdapter = criarAdapter(configDoAmbiente)

// ============================================================
// Parse WhatsApp Webhook Payload
// ============================================================

/* eslint-disable @typescript-eslint/no-explicit-any */

export function parseWhatsAppMessages(body: any): IncomingMessage[] {
  const messages: IncomingMessage[] = []

  const entries = body?.entry || []
  for (const entry of entries) {
    const changes = entry?.changes || []
    for (const change of changes) {
      if (change.field !== "messages") continue

      const value = change.value
      const contactInfo = value?.contacts?.[0]
      const msgs = value?.messages || []
      // Numero que RECEBEU. E o que diz de qual conta (e de qual loja) e a
      // mensagem quando a rede tem varios numeros.
      const contaExterna = value?.metadata?.phone_number_id

      for (const msg of msgs) {
        const parsed = parseWhatsAppMessage(msg, contactInfo)
        if (parsed) messages.push({ ...parsed, contaExterna })
      }
    }
  }

  return messages
}

function parseWhatsAppMessage(
  msg: any,
  contactInfo: any
): IncomingMessage | null {
  const base: Partial<IncomingMessage> = {
    channel: "whatsapp",
    externalId: msg.id,
    senderId: msg.from,
    senderName: contactInfo?.profile?.name,
    timestamp: new Date(parseInt(msg.timestamp) * 1000),
  }

  switch (msg.type) {
    case "text":
      return {
        ...base,
        contentType: "text",
        text: msg.text?.body,
      } as IncomingMessage

    case "image":
      return {
        ...base,
        contentType: "image",
        mediaId: msg.image?.id,
        mediaMimeType: msg.image?.mime_type,
        mediaCaption: msg.image?.caption,
      } as IncomingMessage

    case "video":
      return {
        ...base,
        contentType: "video",
        mediaId: msg.video?.id,
        mediaMimeType: msg.video?.mime_type,
        mediaCaption: msg.video?.caption,
      } as IncomingMessage

    case "audio":
      return {
        ...base,
        contentType: "audio",
        mediaId: msg.audio?.id,
        mediaMimeType: msg.audio?.mime_type,
      } as IncomingMessage

    case "document":
      return {
        ...base,
        contentType: "document",
        mediaId: msg.document?.id,
        mediaMimeType: msg.document?.mime_type,
        mediaCaption: msg.document?.caption,
      } as IncomingMessage

    case "location":
      return {
        ...base,
        contentType: "location",
        latitude: msg.location?.latitude,
        longitude: msg.location?.longitude,
        text: msg.location?.name || msg.location?.address,
      } as IncomingMessage

    case "sticker":
      return {
        ...base,
        contentType: "sticker",
        mediaId: msg.sticker?.id,
        mediaMimeType: msg.sticker?.mime_type,
      } as IncomingMessage

    default:
      return null
  }
}

export function parseWhatsAppStatuses(body: any): StatusUpdate[] {
  const updates: StatusUpdate[] = []

  const entries = body?.entry || []
  for (const entry of entries) {
    const changes = entry?.changes || []
    for (const change of changes) {
      if (change.field !== "messages") continue

      const statuses = change.value?.statuses || []
      for (const status of statuses) {
        const mapped = mapStatus(status.status)
        if (mapped) {
          updates.push({
            channel: "whatsapp",
            externalMessageId: status.id,
            status: mapped,
            timestamp: new Date(parseInt(status.timestamp) * 1000),
          })
        }
      }
    }
  }

  return updates
}

function mapStatus(
  waStatus: string
): "sent" | "delivered" | "read" | "failed" | null {
  switch (waStatus) {
    case "sent":
      return "sent"
    case "delivered":
      return "delivered"
    case "read":
      return "read"
    case "failed":
      return "failed"
    default:
      return null
  }
}
