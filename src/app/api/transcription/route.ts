import { NextResponse } from "next/server"
import { processPendingTranscriptions } from "@/lib/transcription/whisper"
import { verificarSegredoCron } from "@/lib/webhook-auth"

/**
 * POST: Trigger processing of pending audio transcriptions
 * Chamada por cron — autentica por `Authorization: Bearer $CRON_SECRET`.
 */
export async function POST(req: Request) {
  const auth = verificarSegredoCron(req.headers)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.motivo }, { status: auth.status })
  }

  try {
    const processed = await processPendingTranscriptions(5)
    return NextResponse.json({ processed })
  } catch (error) {
    console.error("[Transcription API] Error:", error)
    return NextResponse.json({ error: "Erro ao processar transcrições" }, { status: 500 })
  }
}
