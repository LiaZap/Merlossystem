import { NextResponse } from "next/server"
import { parseInstagramMessages } from "@/lib/channels/instagram"
import { processIncomingMessage } from "@/lib/channels/gateway"
import { contaDoEvento } from "@/lib/roteamento"
import { verificarAssinaturaMeta, verificarChallenge } from "@/lib/webhook-auth"

export async function GET(req: Request) {
  const r = verificarChallenge("instagram", req.url)
  if (!r.ok) {
    console.warn("[Instagram] Verificacao recusada:", r.motivo)
    return NextResponse.json({ error: "Forbidden" }, { status: r.status })
  }
  console.log("[Instagram] Webhook verified")
  return new Response(r.challenge, { status: 200 })
}

export async function POST(req: Request) {
  try {
    const corpoCru = await req.text()
    const auth = verificarAssinaturaMeta(corpoCru, req.headers.get("x-hub-signature-256"))
    if (!auth.ok) {
      console.warn("[Instagram] Webhook recusado:", auth.motivo)
      return NextResponse.json({ error: auth.motivo }, { status: auth.status })
    }

    // A conta que RECEBEU vem do proprio payload, nao da URL: com varios
    // numeros/perfis na mesma loja, saber so a loja nao diz por onde responder.
    const mensagens = parseInstagramMessages(JSON.parse(corpoCru))
    const conta = await contaDoEvento("instagram", mensagens[0]?.contaExterna)
    if (!conta) {
      console.warn(
        "[Instagram] Evento descartado: conta",
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
    console.error("[Instagram] Webhook error:", error)
    return NextResponse.json({ success: true })
  }
}
