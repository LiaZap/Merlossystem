import { prisma } from "@/lib/db/prisma"

const OPENAI_API_URL = "https://api.openai.com/v1/audio/transcriptions"

/**
 * Transcribe audio using OpenAI Whisper API
 */
export async function transcribeAudio(audioUrl: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured")

  // Download the audio file
  const audioRes = await fetch(audioUrl)
  if (!audioRes.ok) throw new Error(`Failed to download audio: ${audioRes.status}`)

  const audioBlob = await audioRes.blob()

  // Send to Whisper API
  const formData = new FormData()
  formData.append("file", audioBlob, "audio.ogg")
  formData.append("model", "whisper-1")
  formData.append("language", "pt")
  formData.append("response_format", "text")

  const res = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  })

  if (!res.ok) {
    const error = await res.text()
    throw new Error(`Whisper API error: ${error}`)
  }

  const transcription = await res.text()
  return transcription.trim()
}

/**
 * Process pending audio transcriptions.
 * Call this from a worker/cron or on-demand.
 */
export async function processPendingTranscriptions(limit: number = 5) {
  const pending = await prisma.messageMedia.findMany({
    where: {
      transcriptionStatus: "pending",
      fileType: "audio",
    },
    include: {
      mediaFile: true,
    },
    take: limit,
    orderBy: { createdAt: "asc" },
  })

  for (const media of pending) {
    const audioUrl = media.mediaFile?.fileUrl || media.externalUrl
    if (!audioUrl) {
      await prisma.messageMedia.update({
        where: { id: media.id },
        data: { transcriptionStatus: "failed" },
      })
      continue
    }

    try {
      await prisma.messageMedia.update({
        where: { id: media.id },
        data: { transcriptionStatus: "processing" },
      })

      const transcription = await transcribeAudio(audioUrl)

      await prisma.messageMedia.update({
        where: { id: media.id },
        data: {
          transcription,
          transcriptionStatus: "completed",
        },
      })

      console.log(`[Transcription] Completed for media ${media.id}`)
    } catch (error) {
      console.error(`[Transcription] Failed for media ${media.id}:`, error)
      await prisma.messageMedia.update({
        where: { id: media.id },
        data: { transcriptionStatus: "failed" },
      })
    }
  }

  return pending.length
}
