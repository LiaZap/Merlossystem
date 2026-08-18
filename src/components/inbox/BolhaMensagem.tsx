"use client"

import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import {
  StickyNote,
  CheckCheck,
  Check as CheckIcon,
  Clock,
  AlertTriangle,
  RotateCcw,
} from "lucide-react"
import { MediaPreview } from "@/components/chat/MediaPreview"
import { cn } from "@/lib/utils"

/**
 * Uma bolha da conversa.
 *
 * Mora em arquivo separado porque o ChatWindow orquestra (carregar, enviar,
 * rolar, marcar como lida) e isto so desenha. Junto, o arquivo passava de 500
 * linhas e misturava as duas responsabilidades.
 */

export type MensagemMidia = {
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

export type Mensagem = {
  id: string
  senderType: string
  content: string | null
  contentType: string
  isInternalNote: boolean
  externalStatus: string | null
  createdAt: string
  sender: { id: string; name: string; avatarUrl: string | null } | null
  media: MensagemMidia[]
  metadata?: { erroDeEnvio?: string } | null
  /** Mensagem otimista: existe na tela e ainda nao no banco. */
  pendente?: boolean
}

/** Motivo da recusa do canal, para o tooltip da bolha vermelha. */
function motivoDaFalha(msg: Mensagem): string {
  const erro = msg.metadata?.erroDeEnvio
  return erro ? `Não entregue: ${erro}` : "Não entregue ao canal."
}

function Estado({ msg }: { msg: Mensagem }) {
  if (msg.pendente) {
    return <Clock className="h-3 w-3 text-white/40" aria-label="Enviando" />
  }
  if (msg.externalStatus === "failed") {
    return (
      <span
        className="flex items-center gap-1 text-[11px] font-medium text-destructive"
        title={motivoDaFalha(msg)}
      >
        <AlertTriangle className="h-3 w-3" />
        Não entregue
      </span>
    )
  }
  if (msg.externalStatus === "read") return <CheckCheck className="h-3 w-3 text-blue-400" />
  if (msg.externalStatus === "delivered") return <CheckCheck className="h-3 w-3 text-neutral-400" />
  if (msg.externalStatus === "sent") return <CheckIcon className="h-3 w-3 text-neutral-400" />
  return null
}

export function BolhaMensagem({
  msg,
  onReenviar,
  reenviando,
}: {
  msg: Mensagem
  onReenviar: (id: string) => void
  reenviando: boolean
}) {
  const daCasa = msg.senderType === "agent" || msg.senderType === "bot"
  const nota = msg.isInternalNote
  const falhou = msg.externalStatus === "failed"

  return (
    <div className={cn("flex", daCasa ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[70%] rounded-2xl px-3.5 py-2.5 shadow-sm",
          nota
            ? "bg-amber-50/80 border border-amber-200/60"
            : falhou
              // Borda vermelha e fundo claro: a bolha escura de agente
              // esconderia o aviso de falha no meio do historico.
              ? "border border-destructive/40 bg-destructive/5"
              : daCasa
                ? "bg-neutral-900 text-white"
                : "bg-white border border-neutral-200/60",
          msg.pendente && "opacity-60"
        )}
      >
        {nota && (
          <div className="mb-1 flex items-center gap-1 text-xs text-amber-700">
            <StickyNote className="h-3 w-3" />
            <span className="font-medium">Nota interna</span>
          </div>
        )}

        {/* Quem respondeu. Duas lojas e varios vendedores no mesmo numero:
            sem o nome, ninguem sabe quem prometeu o que a cliente. */}
        {daCasa && msg.sender && !nota && (
          <p
            className={cn(
              "mb-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium",
              falhou ? "bg-muted text-muted-foreground" : "bg-white/10 text-white/70"
            )}
          >
            {msg.sender.name}
          </p>
        )}

        {msg.media.map((m) => (
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

        {msg.content && (
          <p
            className={cn(
              "text-sm leading-relaxed break-words whitespace-pre-wrap",
              falhou && "text-foreground"
            )}
          >
            {msg.content}
          </p>
        )}

        <div
          className={cn(
            "mt-1 flex items-center gap-1.5",
            daCasa && !nota ? "justify-end" : "justify-start"
          )}
        >
          <span
            className={cn(
              "text-[11px]",
              nota
                ? "text-amber-500"
                : falhou
                  ? "text-muted-foreground"
                  : daCasa
                    ? "text-white/40"
                    : "text-neutral-400"
            )}
          >
            {formatDistanceToNow(new Date(msg.createdAt), {
              addSuffix: true,
              locale: ptBR,
            })}
          </span>
          {daCasa && <Estado msg={msg} />}
        </div>

        {falhou && (
          <button
            type="button"
            onClick={() => onReenviar(msg.id)}
            disabled={reenviando}
            className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-destructive hover:underline disabled:opacity-50"
          >
            <RotateCcw className={cn("h-3 w-3", reenviando && "animate-spin")} />
            {reenviando ? "Reenviando..." : "Tentar de novo"}
          </button>
        )}
      </div>
    </div>
  )
}
