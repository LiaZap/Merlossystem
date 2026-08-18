import type {
  ChannelAdapter,
  SendResult,
  DownloadedMedia,
  IncomingMessage,
  MediaLimits,
} from "./types"

/**
 * TikTok adapter — very limited API capabilities.
 * Strategy: monitor comments, redirect to WhatsApp for actual sales.
 * DM API is restricted to approved partners only.
 */
export const tiktokAdapter: ChannelAdapter = {
  channel: "tiktok",

  limits: {
    image: 0,
    video: 0,
    audio: 0,
    document: 0,
  } as MediaLimits,

  async sendText(): Promise<SendResult> {
    return {
      success: false,
      error: "TikTok DM API is restricted. Use comment replies instead.",
    }
  },

  async sendImage(): Promise<SendResult> {
    return { success: false, error: "Not supported via TikTok API" }
  },

  async sendVideo(): Promise<SendResult> {
    return { success: false, error: "Not supported via TikTok API" }
  },

  async sendAudio(): Promise<SendResult> {
    return { success: false, error: "Not supported via TikTok API" }
  },

  async sendDocument(): Promise<SendResult> {
    return { success: false, error: "Not supported via TikTok API" }
  },

  async sendTemplate(): Promise<SendResult> {
    return { success: false, error: "Not supported via TikTok API" }
  },

  async downloadMedia(): Promise<DownloadedMedia> {
    throw new Error("TikTok media download not implemented")
  },
}

// ============================================================
// Parse TikTok Webhook Payload
// ============================================================

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Parse TikTok webhook events (comments on videos).
 * TikTok webhooks are structured differently from Meta's.
 */
export function parseTikTokEvents(body: any): IncomingMessage[] {
  const messages: IncomingMessage[] = []

  // TikTok comment webhook
  const events = body?.data || []
  for (const event of Array.isArray(events) ? events : [events]) {
    if (!event) continue

    // Comment on video
    if (event.comment_id && event.text) {
      messages.push({
        channel: "tiktok",
        externalId: event.comment_id,
        senderId: event.user_id || event.from_user_id || "unknown",
        senderName: event.user_name || event.nickname,
        contentType: "text",
        text: event.text,
        timestamp: event.create_time
          ? new Date(event.create_time * 1000)
          : new Date(),
        metadata: {
          type: "comment",
          videoId: event.video_id,
        },
      })
    }
  }

  return messages
}
