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
export type ConfigInstagram = {
  pageAccessToken: string
  /** Conta profissional vinculada. Nem toda operacao precisa dela. */
  instagramAccountId?: string
}

/** Conta unica configurada por ambiente — de antes do multi-conta. */
function configDoAmbiente(): ConfigInstagram {
  return {
    pageAccessToken: process.env.META_PAGE_ACCESS_TOKEN!,
    instagramAccountId: process.env.META_INSTAGRAM_ACCOUNT_ID!,
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
function criarAdapter(obterConfig: () => ConfigInstagram): ChannelAdapter {
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
    channel: "instagram",

    limits: {
      image: 8 * 1024 * 1024,
      video: 0, // Not supported via API
      audio: 0,
      document: 0,
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

    async sendVideo(): Promise<SendResult> {
      return { success: false, error: "Instagram does not support video via API" }
    },

    async sendAudio(): Promise<SendResult> {
      return { success: false, error: "Instagram does not support audio via API" }
    },

    async sendDocument(): Promise<SendResult> {
      return {
        success: false,
        error: "Instagram does not support documents via API",
      }
    },

    async sendTemplate(): Promise<SendResult> {
      return {
        success: false,
        error: "Instagram does not support templates",
      }
    },

    async downloadMedia(mediaUrl: string): Promise<DownloadedMedia> {
      // Instagram provides direct URLs in the webhook payload
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
export function criarInstagramAdapter(config: ConfigInstagram): ChannelAdapter {
  return criarAdapter(() => config)
}

/** Adapter da conta configurada por ambiente (compatibilidade). */
export const instagramAdapter: ChannelAdapter = criarAdapter(configDoAmbiente)

// ============================================================
// Parse Instagram Webhook Payload
// ============================================================

/* eslint-disable @typescript-eslint/no-explicit-any */

export function parseInstagramMessages(body: any): IncomingMessage[] {
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
        channel: "instagram",
        contaExterna,
        externalId: msg.mid,
        senderId,
        timestamp: new Date(event.timestamp),
      }

      if (msg.attachments?.length) {
        for (const att of msg.attachments) {
          const contentType = att.type === "image" ? "image" : "document"
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

      // Handle story replies/mentions
      if (msg.reply_to?.story) {
        const last = messages[messages.length - 1]
        if (last) {
          last.metadata = {
            ...((last.metadata as Record<string, unknown>) || {}),
            storyReply: true,
            storyUrl: msg.reply_to.story.url,
          }
        }
      }
    }
  }

  return messages
}
