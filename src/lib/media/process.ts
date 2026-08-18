// Media processing utilities
// Limites por canal. A geracao de miniatura vive em upload.ts (sharp).
// This file provides helper functions for media validation and metadata

export const CHANNEL_LIMITS = {
  whatsapp: {
    image: 5 * 1024 * 1024, // 5 MB
    video: 16 * 1024 * 1024, // 16 MB
    audio: 16 * 1024 * 1024, // 16 MB
    document: 100 * 1024 * 1024, // 100 MB
  },
  instagram: {
    image: 8 * 1024 * 1024, // 8 MB
    video: 0, // Not supported via API
    audio: 0, // Not supported
    document: 0, // Not supported
  },
  facebook: {
    image: 25 * 1024 * 1024, // 25 MB
    video: 25 * 1024 * 1024, // 25 MB
    audio: 25 * 1024 * 1024, // 25 MB
    document: 25 * 1024 * 1024, // 25 MB
  },
  tiktok: {
    image: 0,
    video: 0,
    audio: 0,
    document: 0,
  },
} as const

export type ChannelName = keyof typeof CHANNEL_LIMITS
export type MediaType = keyof (typeof CHANNEL_LIMITS)["whatsapp"]

export function isMediaSupported(
  channel: ChannelName,
  mediaType: MediaType
): boolean {
  return CHANNEL_LIMITS[channel][mediaType] > 0
}

export function isWithinSizeLimit(
  channel: ChannelName,
  mediaType: MediaType,
  sizeBytes: number
): boolean {
  const limit = CHANNEL_LIMITS[channel][mediaType]
  return limit > 0 && sizeBytes <= limit
}

export function getMimeTypeCategory(
  mimeType: string
): MediaType {
  if (mimeType.startsWith("image/")) return "image"
  if (mimeType.startsWith("video/")) return "video"
  if (mimeType.startsWith("audio/")) return "audio"
  return "document"
}

export function getAcceptedMimeTypes(
  channel: ChannelName,
  mediaType: MediaType
): string[] {
  const mimeMap: Record<string, Record<string, string[]>> = {
    whatsapp: {
      image: ["image/jpeg", "image/png"],
      video: ["video/mp4"],
      audio: ["audio/ogg", "audio/opus", "audio/mpeg", "audio/amr"],
      document: ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    },
    instagram: {
      image: ["image/jpeg", "image/png"],
      video: [],
      audio: [],
      document: [],
    },
    facebook: {
      image: ["image/jpeg", "image/png", "image/gif"],
      video: ["video/mp4"],
      audio: ["audio/mpeg", "audio/ogg"],
      document: ["application/pdf"],
    },
    tiktok: {
      image: [],
      video: [],
      audio: [],
      document: [],
    },
  }

  return mimeMap[channel]?.[mediaType] || []
}
