import { NextResponse } from "next/server"
import { parseTikTokEvents } from "@/lib/channels/tiktok"
import { processIncomingMessage } from "@/lib/channels/gateway"
import { contaDaUrl } from "@/lib/roteamento"
import { verificarChallenge } from "@/lib/webhook-auth"
import { verificarAssinaturaWebhook } from "@/lib/tiktok/assinatura"
import { configDoApp } from "@/lib/tiktok/config"

export async function GET(req: Request) {
  const r = verificarChallenge("tiktok", req.url)
  if (!r.ok) {
    console.warn("[TikTok] Verificacao recusada:", r.motivo)
    return NextResponse.json({ error: "Forbidden" }, { status: r.status })
  }
  return new Response(r.challenge, { status: 200 })
}

export async function POST(req: Request) {
  try {
    // Corpo cru primeiro: a assinatura e sobre os bytes originais. Um
    // `req.json()` aqui perderia os bytes e a conta nunca bateria.
    const corpoCru = await req.text()

    let cfg
    try {
      cfg = configDoApp()
    } catch {
      console.warn("[TikTok] Webhook recusado: app nao configurado")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // HMAC-SHA256 de (app_key + corpo cru), chave = app_secret, hex minusculo,
    // no header Authorization. Substitui o segredo compartilhado provisorio.
    const auth = verificarAssinaturaWebhook(corpoCru, req.headers.get("authorization"), cfg)
    if (!auth.ok) {
      console.warn("[TikTok] Webhook recusado:", auth.motivo)
      return NextResponse.json({ error: auth.motivo }, { status: 401 })
    }

    // Diferente da Meta, o payload do TikTok nao traz um identificador de
    // conta que a gente saiba ler — entao a conta vem da URL que cada loja
    // configura no provedor: /api/webhooks/tiktok?conta=<shop id>.
    const conta = await contaDaUrl("tiktok_shop", req.url)
    if (!conta) {
      console.warn("[TikTok] Evento descartado: parametro ?conta= ausente ou nao conectado")
      return NextResponse.json({ success: true })
    }

    const messages = parseTikTokEvents(JSON.parse(corpoCru))
    for (const msg of messages) {
      await processIncomingMessage(msg, conta)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[TikTok] Webhook error:", error)
    return NextResponse.json({ success: true })
  }
}
