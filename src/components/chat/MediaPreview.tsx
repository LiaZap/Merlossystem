"use client"

import { useState } from "react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { FileText, Download } from "lucide-react"
import { AudioPlayer } from "./AudioPlayer"

interface MediaPreviewProps {
  url: string
  thumbnailUrl?: string | null
  fileType: string
  mimeType?: string | null
  caption?: string | null
  originalName?: string | null
  transcription?: string | null
  transcriptionStatus?: string | null
  duration?: number | null
}

export function MediaPreview({
  url,
  thumbnailUrl,
  fileType,
  caption,
  originalName,
  transcription,
  transcriptionStatus,
  duration,
}: MediaPreviewProps) {
  const [expanded, setExpanded] = useState(false)

  if (fileType === "audio") {
    return (
      <div className="max-w-[300px]">
        <AudioPlayer
          src={url}
          duration={duration || undefined}
          transcription={transcription}
          transcriptionStatus={transcriptionStatus}
        />
        {caption && (
          <p className="text-sm mt-1 text-muted-foreground">{caption}</p>
        )}
      </div>
    )
  }

  if (fileType === "image") {
    return (
      <>
        <div
          className="cursor-pointer max-w-[250px]"
          onClick={() => setExpanded(true)}
        >
          <img
            src={thumbnailUrl || url}
            alt={caption || originalName || ""}
            className="rounded-lg w-full"
          />
          {caption && (
            <p className="text-sm mt-1 text-muted-foreground">{caption}</p>
          )}
        </div>

        <Dialog open={expanded} onOpenChange={setExpanded}>
          <DialogContent className="max-w-4xl p-2">
            <img
              src={url}
              alt={caption || ""}
              className="w-full h-auto max-h-[80vh] object-contain"
            />
          </DialogContent>
        </Dialog>
      </>
    )
  }

  if (fileType === "video") {
    return (
      <div className="max-w-[300px]">
        <video
          src={url}
          controls
          className="rounded-lg w-full"
          preload="metadata"
        />
        {caption && (
          <p className="text-sm mt-1 text-muted-foreground">{caption}</p>
        )}
      </div>
    )
  }

  // Document / other
  return (
    <div className="flex items-center gap-3 bg-neutral-100 rounded-lg px-4 py-3 max-w-[250px]">
      <FileText className="h-8 w-8 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">
          {originalName || "Documento"}
        </p>
        {caption && (
          <p className="text-xs text-muted-foreground truncate">{caption}</p>
        )}
      </div>
      <a href={url} target="_blank" rel="noopener noreferrer">
        <Download className="h-4 w-4 text-muted-foreground" />
      </a>
    </div>
  )
}
