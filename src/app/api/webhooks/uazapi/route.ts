import { NextResponse } from "next/server"
import { parseUazapiMessages } from "@/lib/channels/uazapi"
import { processIncomingMessage } from "@/lib/channels/gateway"
import { contaDoEvento } from "@/lib/roteamento"
import { verificarWebhookUazapi } from "@/lib/webhook-auth"

/**
 * Webhook do WhatsApp via uazapi.
 *
 * Separado de `/api/webhooks/whatsapp` (Meta) de proposito: mesmo canal, mas
 * payload, autenticacao e ciclo de vida diferentes. Juntar os dois numa rota so
 * significaria adivinhar de quem e cada POST.
 *
 * Nao ha GET de verificacao: o uazapi nao faz challenge como a Meta.
 */
export async function POST(req: Request) {
  const auth = verificarWebhookUazapi(req.headers, req.url)
  if (!auth.ok) {
    console.warn("[uazapi] Webhook recusado:", auth.motivo)
    return NextResponse.json({ error: auth.motivo }, { status: auth.status })
  }

  try {
    const body = await req.json()

    // Eventos de conexao (QR lido, sessao caiu) chegam na mesma URL. Nao viram
    // mensagem — sao registrados no status da conta.
    const mensagens = parseUazapiMessages(body)
    if (mensagens.length === 0) {
      return NextResponse.json({ success: true })
    }

    const conta = await contaDoEvento("uazapi", mensagens[0]?.contaExterna)
    if (!conta) {
      console.warn(
        "[uazapi] Evento descartado: instancia",
        mensagens[0]?.contaExterna ?? "(ausente no payload)",
        "nao esta conectada"
      )
      return NextResponse.json({ success: true })
    }

    for (const msg of mensagens) {
      await processIncomingMessage(msg, conta)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[uazapi] Webhook error:", error)
    // 200 para o uazapi nao reenviar em laco. O erro esta no log.
    return NextResponse.json({ success: true })
  }
}
