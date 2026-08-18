"use client"

import { useRef } from "react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Camera, Video, ShoppingBag, FolderOpen, Paperclip, Zap } from "lucide-react"

interface MediaBarProps {
  onImageSelect: (file: File) => void
  onVideoSelect: (file: File) => void
  onFileSelect: (file: File) => void
  onGalleryOpen: () => void
  onProductSelect: () => void
  onQuickReply: () => void
}

export function MediaBar({
  onImageSelect,
  onVideoSelect,
  onFileSelect,
  onGalleryOpen,
  onProductSelect,
  onQuickReply,
}: MediaBarProps) {
  const imageRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  return (
    <div className="flex items-center gap-1 px-2 py-1 border-t bg-neutral-50">
      <input
        ref={imageRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && onImageSelect(e.target.files[0])}
      />
      <input
        ref={videoRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && onVideoSelect(e.target.files[0])}
      />
      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.doc,.docx"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && onFileSelect(e.target.files[0])}
      />

      <Tooltip>
        <TooltipTrigger >
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => imageRef.current?.click()}>
            <Camera className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Foto</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger >
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => videoRef.current?.click()}>
            <Video className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Vídeo</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger >
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onProductSelect}>
            <ShoppingBag className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Produto</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger >
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onGalleryOpen}>
            <FolderOpen className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Galeria</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger >
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => fileRef.current?.click()}>
            <Paperclip className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Arquivo</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger >
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onQuickReply}>
            <Zap className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Resposta Rápida</TooltipContent>
      </Tooltip>
    </div>
  )
}
