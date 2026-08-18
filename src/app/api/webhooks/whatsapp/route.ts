import { NextResponse } from "next/server"
import {
  parseWhatsAppMessages,
  parseWhatsAppStatuses,
  whatsappAdapter,
} from "@/lib/channels/whatsapp"
import {
  processIncomingMessage,
  processStatusUpdate,
} from "@/lib/channels/gateway"
import { contaDoEvento } from "@/lib/roteamento"
import { verificarAssinaturaMeta, verificarChallenge } from "@/lib/webhook-auth"

/**
 * GET: Webhook verification (Meta sends this when configuring the webhook)
 */
export async function GET(req: Request) {
  const r = verificarChallenge("whatsapp", req.url)
  if (!r.ok) {
    console.warn("[WhatsApp] Verificacao recusada:", r.motivo)
    return NextResponse.json({ error: "Forbidden" }, { status: r.status })
  }
  console.log("[WhatsApp] Webhook verified")
  return new Response(r.challenge, { status: 200 })
}

/**
 * POST: Receive messages, status updates, and other events
 */
export async function POST(req: Request) {
  try {
    // Corpo cru primeiro: o HMAC da Meta e sobre os bytes originais.
    const corpoCru = await req.text()
    const auth = verificarAssinaturaMeta(corpoCru, req.headers.get("x-hub-signature-256"))
    if (!auth.ok) {
      console.warn("[WhatsApp] Webhook recusado:", auth.motivo)
      return NextResponse.json({ error: auth.motivo }, { status: auth.status })
    }
    const body = JSON.parse(corpoCru)

    // O numero que RECEBEU vem no payload (`metadata.phone_number_id`), nao da
    // URL: com varios numeros na mesma loja, saber so a loja nao diz por onde
    // responder.
    // Provedor `whatsapp_oficial`, nao `uazapi`: os dois servem o canal
    // WhatsApp, e esta rota e a da Meta. Resolver pelo provedor errado nunca
    // acharia a conta — e a mensagem seria descartada em silencio.
    const messages = parseWhatsAppMessages(body)
    const conta = await contaDoEvento("whatsapp_oficial", messages[0]?.contaExterna)
    if (!conta) {
      console.warn(
        "[WhatsApp] Evento descartado: numero",
        messages[0]?.contaExterna ?? "(ausente no payload)",
        "nao esta conectado"
      )
      return NextResponse.json({ success: true })
    }

    // Process incoming messages
    for (const msg of messages) {
      // If message has mediaId, download it first to get URL
      if (msg.mediaId && !msg.mediaUrl) {
        try {
          const downloaded = await whatsappAdapter.downloadMedia(msg.mediaId)
          // Data URL: o gateway baixa dela e guarda no MinIO (ADR 0006).
          const base64 = downloaded.buffer.toString("base64")
          msg.mediaUrl = `data:${downloaded.mimeType};base64,${base64}`
          msg.mediaMimeType = downloaded.mimeType
        } catch (error) {
          console.error("[WhatsApp] Failed to download media:", error)
        }
      }

      await processIncomingMessage(msg, conta)
    }

    // Process status updates (delivery receipts)
    const statuses = parseWhatsAppStatuses(body)
    for (const status of statuses) {
      await processStatusUpdate(status)
    }

    // WhatsApp requires 200 response
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[WhatsApp] Webhook error:", error)
    // Still return 200 to prevent Meta from retrying
    return NextResponse.json({ success: true })
  }
}
