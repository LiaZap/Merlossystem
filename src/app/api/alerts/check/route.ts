import { NextResponse } from "next/server"
import { checkAlerts } from "@/lib/alerts/engine"
import { verificarSegredoCron } from "@/lib/webhook-auth"

/**
 * POST: Trigger alert check (call via cron every 1 minute)
 * Nao tem sessao: autentica por `Authorization: Bearer $CRON_SECRET`.
 */
export async function POST(req: Request) {
  const auth = verificarSegredoCron(req.headers)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.motivo }, { status: auth.status })
  }

  try {
    const created = await checkAlerts()
    return NextResponse.json({ created })
  } catch (error) {
    console.error("[Alert Check] Error:", error)
    return NextResponse.json({ error: "Erro ao verificar alertas" }, { status: 500 })
  }
}
