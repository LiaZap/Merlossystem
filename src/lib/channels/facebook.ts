/* eslint-disable @typescript-eslint/no-unused-vars */
import type {
  ChannelAdapter,
  SendResult,
  DownloadedMedia,
  IncomingMessage,
  MediaLimits,
} from "./types"

const GRAPH_API = "https://graph.facebook.com/v21.0"

/** Credenciais de UMA conta Meta. */
export type ConfigFacebook = {
  pageAccessToken: string
}

/** Conta unica configurada por ambiente — de antes do multi-conta. */
function configDoAmbiente(): ConfigFacebook {
  return {
    pageAccessToken: process.env.META_PAGE_ACCESS_TOKEN!,
  }
}

/**
 * Adapter recebe um GETTER de configuracao, nao a configuracao pronta.
 *
 * Assim o adapter do ambiente segue lendo `process.env` na hora da chamada
 * (comportamento de antes) e o adapter de uma conta fica preso a credencial
 * dela. Sem estado global: duas lojas enviando ao mesmo tempo nao se
 * atropelam.
 */
function criarAdapter(obterConfig: () => ConfigFacebook): ChannelAdapter {
  async function graphFetch(
    path: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const { pageAccessToken } = obterConfig()
    return fetch(`${GRAPH_API}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${pageAccessToken}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    })
  }

  return {
    channel: "facebook",

    limits: {
      image: 25 * 1024 * 1024,
      video: 25 * 1024 * 1024,
      audio: 25 * 1024 * 1024,
      document: 25 * 1024 * 1024,
    } as MediaLimits,

    async sendText(to: string, text: string): Promise<SendResult> {
      const res = await graphFetch(`/me/messages`, {
        method: "POST",
        body: JSON.stringify({
          recipient: { id: to },
          message: { text },
        }),
      })

      const data = await res.json()
      if (!res.ok) return { success: false, error: data.error?.message }
      return { success: true, externalId: data.message_id }
    },

    async sendImage(
      to: string,
      url: string,
      _?: string
    ): Promise<SendResult> {
      const res = await graphFetch(`/me/messages`, {
        method: "POST",
        body: JSON.stringify({
          recipient: { id: to },
          message: {
            attachment: {
              type: "image",
              payload: { url, is_reusable: true },
            },
          },
        }),
      })

      const data = await res.json()
      if (!res.ok) return { success: false, error: data.error?.message }
      return { success: true, externalId: data.message_id }
    },

    async sendVideo(
      to: string,
      url: string,
      _?: string
    ): Promise<SendResult> {
      const res = await graphFetch(`/me/messages`, {
        method: "POST",
        body: JSON.stringify({
          recipient: { id: to },
          message: {
            attachment: {
              type: "video",
              payload: { url, is_reusable: true },
            },
          },
        }),
      })

      const data = await res.json()
      if (!res.ok) return { success: false, error: data.error?.message }
      return { success: true, externalId: data.message_id }
    },

    async sendAudio(to: string, url: string): Promise<SendResult> {
      const res = await graphFetch(`/me/messages`, {
        method: "POST",
        body: JSON.stringify({
          recipient: { id: to },
          message: {
            attachment: {
              type: "audio",
              payload: { url, is_reusable: true },
            },
          },
        }),
      })

      const data = await res.json()
      if (!res.ok) return { success: false, error: data.error?.message }
      return { success: true, externalId: data.message_id }
    },

    async sendDocument(
      to: string,
      url: string,
      _2: string
    ): Promise<SendResult> {
      const res = await graphFetch(`/me/messages`, {
        method: "POST",
        body: JSON.stringify({
          recipient: { id: to },
          message: {
            attachment: {
              type: "file",
              payload: { url, is_reusable: true },
            },
          },
        }),
      })

      const data = await res.json()
      if (!res.ok) return { success: false, error: data.error?.message }
      return { success: true, externalId: data.message_id }
    },

    async sendTemplate(): Promise<SendResult> {
      return {
        success: false,
        error: "Facebook Messenger does not use WhatsApp-style templates",
      }
    },

    async downloadMedia(mediaUrl: string): Promise<DownloadedMedia> {
      const res = await fetch(mediaUrl)
      if (!res.ok) throw new Error(`Failed to download: ${res.status}`)

      const arrayBuffer = await res.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)

      return {
        buffer,
        mimeType:
          res.headers.get("content-type") || "application/octet-stream",
        size: buffer.length,
      }
    },
  }
}

/** Adapter de uma conta especifica — usado pelo roteamento por conta. */
export function criarFacebookAdapter(config: ConfigFacebook): ChannelAdapter {
  return criarAdapter(() => config)
}

/** Adapter da conta configurada por ambiente (compatibilidade). */
export const facebookAdapter: ChannelAdapter = criarAdapter(configDoAmbiente)

// ============================================================
// Parse Facebook Messenger Webhook Payload
// ============================================================

/* eslint-disable @typescript-eslint/no-explicit-any */

export function parseFacebookMessages(body: any): IncomingMessage[] {
  const messages: IncomingMessage[] = []

  const entries = body?.entry || []
  for (const entry of entries) {
    // `entry.id` e o perfil/pagina que RECEBEU — chave de roteamento.
    const contaExterna = entry?.id
    const messaging = entry?.messaging || []
    for (const event of messaging) {
      if (!event.message) continue

      const msg = event.message
      const senderId = event.sender?.id

      if (!senderId) continue

      const base: Partial<IncomingMessage> = {
        channel: "facebook",
        contaExterna,
        externalId: msg.mid,
        senderId,
        timestamp: new Date(event.timestamp),
      }

      if (msg.attachments?.length) {
        for (const att of msg.attachments) {
          let contentType: IncomingMessage["contentType"] = "document"
          if (att.type === "image") contentType = "image"
          else if (att.type === "video") contentType = "video"
          else if (att.type === "audio") contentType = "audio"

          messages.push({
            ...base,
            contentType,
            mediaUrl: att.payload?.url,
            text: msg.text,
          } as IncomingMessage)
        }
      } else if (msg.text) {
        messages.push({
          ...base,
          contentType: "text",
          text: msg.text,
        } as IncomingMessage)
      }
    }
  }

  return messages
}
