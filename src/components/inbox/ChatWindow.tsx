"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Send, StickyNote, CheckCheck, Check as CheckIcon } from "lucide-react"
import { ChannelBadge } from "./ChannelBadge"
import { MediaPreview } from "@/components/chat/MediaPreview"
import { MediaBar } from "@/components/chat/MediaBar"
import { GalleryModal } from "@/components/chat/GalleryModal"
// IA fora de escopo (18/08/2026) — ver o bloco comentado no final do componente.
import { toast } from "sonner"
import { cn } from "@/lib/utils"

interface MessageMedia {
  id: string
  fileType: string | null
  mimeType: string | null
  caption: string | null
  transcription: string | null
  transcriptionStatus: string | null
  mediaFile: {
    fileUrl: string
    thumbnailUrl: string | null
    originalName: string | null
    duration: number | null
  } | null
  externalUrl: string | null
}

interface Message {
  id: string
  senderType: string
  content: string | null
  contentType: string
  isInternalNote: boolean
  externalStatus: string | null
  createdAt: string
  sender: { id: string; name: string; avatarUrl: string | null } | null
  media: MessageMedia[]
}

interface ChatWindowProps {
  conversationId: string
  contactName: string
  channel: string
}

function StatusIcon({ status }: { status: string | null }) {
  if (!status) return null
  if (status === "read") return <CheckCheck className="h-3 w-3 text-blue-400" />
  if (status === "delivered") return <CheckCheck className="h-3 w-3 text-neutral-400" />
  if (status === "sent") return <CheckIcon className="h-3 w-3 text-neutral-400" />
  return null
}

export function ChatWindow({
  conversationId,
  contactName,
  channel,
}: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const [galleryOpen, setGalleryOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const loadMessages = useCallback(async () => {
    const res = await fetch(`/api/messages?conversationId=${conversationId}&limit=100`)
    if (res.ok) {
      const data = await res.json()
      setMessages(data)
    }
  }, [conversationId])

  useEffect(() => {
    loadMessages()
    // Mark as read
    fetch(`/api/conversations/${conversationId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markRead: true }),
    })
  }, [conversationId, loadMessages])

  useEffect(() => {
    // Scroll to bottom on new messages
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  // Poll for new messages every 5 seconds
  useEffect(() => {
    const interval = setInterval(loadMessages, 5000)
    return () => clearInterval(interval)
  }, [loadMessages])

  async function handleSend(isNote: boolean = false) {
    if (!input.trim()) return
    setSending(true)

    // Check for quick reply shortcut
    let content = input.trim()
    if (content.startsWith("/") && !isNote) {
      const shortcut = content.split(" ")[0]
      const res = await fetch(`/api/quick-replies?search=${encodeURIComponent(shortcut)}`)
      const replies = await res.json()
      const match = Array.isArray(replies) ? replies.find((r: { shortcut: string }) => r.shortcut === shortcut) : null
      if (match) {
        content = match.content
      }
    }

    const res = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversationId,
        content,
        contentType: "text",
        isInternalNote: isNote,
      }),
    })

    setSending(false)
    if (res.ok) {
      setInput("")
      loadMessages()
      textareaRef.current?.focus()
    } else {
      const err = await res.json()
      toast.error(err.error || "Erro ao enviar")
    }
  }

  async function handleMediaUpload(file: File) {
    const formData = new FormData()
    formData.append("file", file)
    formData.append("folder", "chat")

    const uploadRes = await fetch("/api/media/upload", {
      method: "POST",
      body: formData,
    })

    if (!uploadRes.ok) {
      toast.error("Erro ao fazer upload")
      return
    }

    const mediaFile = await uploadRes.json()

    await fetch("/api/media/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversationId,
        mediaFileIds: [mediaFile.id],
      }),
    })

    loadMessages()
  }

  async function handleGallerySend(mediaFileIds: string[], caption?: string) {
    await fetch("/api/media/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversationId,
        mediaFileIds,
        caption,
      }),
    })
    loadMessages()
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral-200/60 px-5 py-3">
        <div className="flex items-center gap-2.5">
          <span className="font-semibold text-neutral-900 tracking-tight">{contactName}</span>
          <ChannelBadge channel={channel} />
        </div>
        <div className="flex gap-1.5">
          <Button variant="outline" size="sm" className="text-xs h-7 rounded-lg border-neutral-200/60 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50">
            Transferir
          </Button>
          <Button variant="outline" size="sm" className="text-xs h-7 rounded-lg border-neutral-200/60 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50">
            Resolver
          </Button>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4 bg-[#fafaf8]" ref={scrollRef}>
        <div className="space-y-3">
          {messages.map((msg) => {
            const isAgent = msg.senderType === "agent" || msg.senderType === "bot"
            const isNote = msg.isInternalNote

            return (
              <div
                key={msg.id}
                className={cn(
                  "flex",
                  isAgent ? "justify-end" : "justify-start"
                )}
              >
                <div
                  className={cn(
                    "max-w-[70%] rounded-2xl px-3.5 py-2.5 shadow-sm",
                    isNote
                      ? "bg-amber-50/80 border border-amber-200/60"
                      : isAgent
                        ? "bg-neutral-900 text-white"
                        : "bg-white border border-neutral-200/60"
                  )}
                >
                  {/* Note indicator */}
                  {isNote && (
                    <div className="flex items-center gap-1 text-xs text-amber-700 mb-1">
                      <StickyNote className="h-3 w-3" />
                      <span className="font-medium">Nota interna</span>
                    </div>
                  )}

                  {/* Agent name */}
                  {isAgent && msg.sender && !isNote && (
                    <p className="text-[10px] text-white/60 mb-0.5">
                      {msg.sender.name}
                    </p>
                  )}

                  {/* Media */}
                  {msg.media.length > 0 && msg.media.map((m) => (
                    <div key={m.id} className="mb-1">
                      <MediaPreview
                        url={m.mediaFile?.fileUrl || m.externalUrl || ""}
                        thumbnailUrl={m.mediaFile?.thumbnailUrl}
                        fileType={m.fileType || "document"}
                        mimeType={m.mimeType}
                        caption={m.caption}
                        originalName={m.mediaFile?.originalName}
                        transcription={m.transcription}
                        transcriptionStatus={m.transcriptionStatus}
                        duration={m.mediaFile?.duration}
                      />
                    </div>
                  ))}

                  {/* Text content */}
                  {msg.content && (
                    <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                      {msg.content}
                    </p>
                  )}

                  {/* Time + status */}
                  <div className={cn(
                    "flex items-center gap-1 mt-1",
                    isAgent && !isNote ? "justify-end" : "justify-start"
                  )}>
                    <span className={cn(
                      "text-[11px]",
                      isNote
                        ? "text-amber-500"
                        : isAgent
                          ? "text-white/40"
                          : "text-neutral-400"
                    )}>
                      {formatDistanceToNow(new Date(msg.createdAt), {
                        addSuffix: true,
                        locale: ptBR,
                      })}
                    </span>
                    {isAgent && <StatusIcon status={msg.externalStatus} />}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </ScrollArea>

      {/*
        Sugestao por IA — FORA DE ESCOPO neste projeto (decisao de 18/08/2026).

        Escondido, nao removido: o componente e as rotas `/api/ai/*` continuam
        no repositorio. Esconder e reversivel; apagar nao, e a decisao pode
        mudar. Sem a chave da Anthropic configurada isto so mostraria erro.

        <AiSuggestion
          conversationId={conversationId}
          onSend={(text) => { setInput(text); handleSend() }}
        />
      */}

      {/* Media Bar */}
      <MediaBar
        onImageSelect={handleMediaUpload}
        onVideoSelect={handleMediaUpload}
        onFileSelect={handleMediaUpload}
        onGalleryOpen={() => setGalleryOpen(true)}
        onProductSelect={() => toast.info("Seletor de produto (Fase 6)")}
        onQuickReply={() => {
          setInput("/")
          textareaRef.current?.focus()
        }}
      />

      {/* Input */}
      <div className="border-t border-neutral-200/60 p-3 bg-white">
        <div className="flex gap-2">
          <Textarea
            ref={textareaRef}
            placeholder="Digite sua mensagem... (/ para atalho)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            className="min-h-[44px] max-h-[120px] resize-none text-sm rounded-xl border-neutral-200/60 bg-[#fafaf8] focus:border-neutral-400 focus:ring-neutral-400/20 placeholder:text-neutral-400"
          />
          <div className="flex flex-col gap-1">
            <Button
              size="icon"
              className="h-9 w-9 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white"
              onClick={() => handleSend(false)}
              disabled={!input.trim() || sending}
            >
              <Send className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 rounded-xl border-neutral-200/60 text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50"
              onClick={() => handleSend(true)}
              disabled={!input.trim() || sending}
              title="Nota interna"
            >
              <StickyNote className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {input.startsWith("/") && (
          <p className="text-[11px] text-neutral-400 mt-1.5">
            Atalhos: /frete /medidas /troca /pix /rastreio /promo /horario
          </p>
        )}
      </div>

      <GalleryModal
        open={galleryOpen}
        onOpenChange={setGalleryOpen}
        onSend={handleGallerySend}
      />
    </div>
  )
}
