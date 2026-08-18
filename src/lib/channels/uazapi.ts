import type {
  ChannelAdapter,
  SendResult,
  DownloadedMedia,
  IncomingMessage,
  ContentType,
  MediaLimits,
} from "./types"
import {
  baseDaApi,
  UAZAPI_ENDPOINTS,
  HEADER_TOKEN,
  TIPO_DE_MIDIA,
} from "@/lib/uazapi/config"

/**
 * Adapter do WhatsApp via uazapi.
 *
 * Implementa a MESMA interface `ChannelAdapter` do adapter da Meta: quem envia
 * (gateway, rotas) nao sabe por qual provedor a mensagem sai. A escolha esta na
 * conta conectada (`stores_integracoes.provedor`), nao no codigo de envio.
 *
 * Diferenca que vaza da interface: `sendTemplate` nao existe no uazapi. Ver o
 * comentario no metodo.
 */

/** Credenciais de UMA instancia — um numero de WhatsApp. */
export type ConfigUazapi = {
  /** Token da instancia. E o unico segredo; da acesso total aquele numero. */
  token: string
  /** Host da instalacao. Ausente = usa UAZAPI_BASE_URL. */
  base?: string
}

type RespostaEnvio = {
  id?: string
  messageid?: string
  key?: { id?: string }
  error?: string
  message?: string
}

/** Id da mensagem: o uazapi ja devolveu em tres formatos diferentes. */
function idDaResposta(d: RespostaEnvio): string | undefined {
  return d.id ?? d.messageid ?? d.key?.id
}

export function criarUazapiAdapter(config: ConfigUazapi): ChannelAdapter {
  const base = () => config.base ?? baseDaApi()

  async function chamar(caminho: string, corpo: unknown): Promise<SendResult> {
    let res: Response
    try {
      res = await fetch(`${base()}${caminho}`, {
        method: "POST",
        headers: {
          [HEADER_TOKEN]: config.token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(corpo),
      })
    } catch (e) {
      // Instalacao fora do ar / host errado. Vira erro de envio, nao excecao:
      // uma mensagem que nao saiu nao pode derrubar o processamento das outras.
      return { success: false, error: `uazapi inacessivel: ${(e as Error).message}` }
    }

    const data: RespostaEnvio = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { success: false, error: data.error ?? data.message ?? `HTTP ${res.status}` }
    }
    return { success: true, externalId: idDaResposta(data) }
  }

  const midia = (to: string, tipo: string, url: string, texto?: string, docName?: string) =>
    chamar(UAZAPI_ENDPOINTS.midia, { number: to, type: tipo, file: url, text: texto, docName })

  return {
    channel: "whatsapp",

    // O uazapi passa pelo WhatsApp Web, entao valem os limites do proprio
    // WhatsApp — os mesmos do adapter da Meta.
    limits: {
      image: 5 * 1024 * 1024,
      video: 16 * 1024 * 1024,
      audio: 16 * 1024 * 1024,
      document: 100 * 1024 * 1024,
    } as MediaLimits,

    sendText: (to, text) => chamar(UAZAPI_ENDPOINTS.texto, { number: to, text }),

    sendImage: (to, url, caption) => midia(to, TIPO_DE_MIDIA.image, url, caption),
    sendVideo: (to, url, caption) => midia(to, TIPO_DE_MIDIA.video, url, caption),
    sendAudio: (to, url) => midia(to, TIPO_DE_MIDIA.audio, url),
    sendDocument: (to, url, filename) =>
      midia(to, TIPO_DE_MIDIA.document, url, undefined, filename),

    /**
     * Template nao existe no uazapi — nao ha aprovacao da Meta nem janela de
     * 24h; e tudo mensagem comum.
     *
     * Falha explicita em vez de mandar o nome do template como texto: o
     * segundo caso manda "boas_vindas" para a cliente e ninguem percebe. Quem
     * precisa disparar template por este numero resolve o texto antes e chama
     * `sendText`.
     */
    async sendTemplate(_to, templateName): Promise<SendResult> {
      return {
        success: false,
        error:
          `Este numero usa uazapi, que nao tem template aprovado. ` +
          `Envie o texto de "${templateName}" como mensagem comum.`,
      }
    },

    /**
     * O uazapi entrega a midia como URL direta no proprio webhook, nao como id
     * para buscar depois. Aqui o "mediaId" JA e a URL.
     */
    async downloadMedia(mediaId: string): Promise<DownloadedMedia> {
      if (!/^https?:\/\//.test(mediaId)) {
        throw new Error(
          `uazapi entrega midia por URL; recebido "${mediaId.slice(0, 40)}" que nao e URL`
        )
      }

      const res = await fetch(mediaId)
      if (!res.ok) throw new Error(`Falha ao baixar midia do uazapi: ${res.status}`)

      const buffer = Buffer.from(await res.arrayBuffer())
      return {
        buffer,
        mimeType: res.headers.get("content-type") ?? "application/octet-stream",
        size: buffer.length,
      }
    },
  }
}

// ============================================================
// Webhook do uazapi
// ============================================================

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Tipos do uazapi -> ContentType do sistema. */
const CONTENT_TYPE: Record<string, ContentType> = {
  text: "text",
  conversation: "text",
  extendedTextMessage: "text",
  image: "image",
  imageMessage: "image",
  video: "video",
  videoMessage: "video",
  audio: "audio",
  audioMessage: "audio",
  ptt: "audio",
  document: "document",
  documentMessage: "document",
  sticker: "sticker",
  stickerMessage: "sticker",
  location: "location",
  locationMessage: "location",
}

/**
 * Normaliza o evento do uazapi para `IncomingMessage`.
 *
 * ⚠️ O formato exato do payload nao pode ser confirmado sem o Swagger da
 * instalacao. O parser e TOLERANTE de proposito: le os nomes de campo mais
 * comuns e devolve `[]` no que nao reconhece, em vez de estourar. Um evento
 * ignorado aparece no log; uma excecao derrubaria o webhook inteiro.
 *
 * `contaExterna` sai do id da instancia — e a chave que liga o numero a loja
 * (`stores_integracoes.referencia_externa`), igual ao `phone_number_id` da Meta.
 */
export function parseUazapiMessages(body: any): IncomingMessage[] {
  const eventos: any[] = Array.isArray(body?.messages)
    ? body.messages
    : body?.message
      ? [body.message]
      : body?.data
        ? [body.data]
        : []

  const contaExterna = body?.instance ?? body?.instanceId ?? body?.owner ?? body?.token

  const mensagens: IncomingMessage[] = []
  for (const e of eventos) {
    // Mensagem que NOS enviamos, ecoada de volta. Gravar de novo duplicaria a
    // conversa — o envio ja gravou.
    if (e?.fromMe === true || e?.key?.fromMe === true) continue

    const externalId = e?.id ?? e?.messageid ?? e?.key?.id
    const senderId = String(e?.sender ?? e?.chatid ?? e?.key?.remoteJid ?? "").replace(
      /@.*$/,
      ""
    )
    if (!externalId || !senderId) continue

    const contentType = CONTENT_TYPE[String(e?.messageType ?? e?.type ?? "text")] ?? "text"
    const mediaUrl = e?.file ?? e?.mediaUrl ?? e?.url

    mensagens.push({
      channel: "whatsapp",
      externalId: String(externalId),
      contaExterna: contaExterna ? String(contaExterna) : undefined,
      senderId,
      senderName: e?.senderName ?? e?.pushName,
      contentType,
      text: e?.text ?? e?.content ?? e?.body ?? e?.caption,
      // O adapter trata a URL como o "mediaId" — ver `downloadMedia`.
      mediaId: mediaUrl,
      mediaUrl,
      mediaMimeType: e?.mimetype ?? e?.mimeType,
      mediaCaption: e?.caption,
      latitude: e?.latitude,
      longitude: e?.longitude,
      timestamp: paraData(e?.messageTimestamp ?? e?.timestamp),
    })
  }

  return mensagens
}

/** O uazapi manda timestamp em segundos, em milissegundos ou em ISO. */
function paraData(valor: unknown): Date {
  if (typeof valor === "number") {
    return new Date(valor < 1e12 ? valor * 1000 : valor)
  }
  const d = valor ? new Date(String(valor)) : new Date()
  return Number.isNaN(d.getTime()) ? new Date() : d
}
