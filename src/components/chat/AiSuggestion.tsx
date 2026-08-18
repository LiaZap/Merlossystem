"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Sparkles, Send, Pencil, X, Loader2 } from "lucide-react"

interface AiSuggestionProps {
  conversationId: string
  onSend: (text: string) => void
}

export function AiSuggestion({ conversationId, onSend }: AiSuggestionProps) {
  const [suggestion, setSuggestion] = useState("")
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [visible, setVisible] = useState(false)

  async function requestSuggestion() {
    setLoading(true)
    setVisible(true)
    setSuggestion("")

    try {
      const res = await fetch("/api/ai/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId }),
      })

      if (res.ok) {
        const data = await res.json()
        setSuggestion(data.suggestion)
      } else {
        setSuggestion("Erro ao gerar sugestão. Verifique a API key.")
      }
    } catch {
      setSuggestion("Erro de conexão com a IA.")
    }

    setLoading(false)
  }

  function handleSend() {
    if (suggestion.trim()) {
      onSend(suggestion)
      setVisible(false)
      setSuggestion("")
      setEditing(false)
    }
  }

  function handleDismiss() {
    setVisible(false)
    setSuggestion("")
    setEditing(false)
  }

  if (!visible) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="gap-1.5 text-xs text-purple-600 hover:text-purple-700 hover:bg-purple-50"
        onClick={requestSuggestion}
      >
        <Sparkles className="h-3.5 w-3.5" />
        Sugestão IA
      </Button>
    )
  }

  return (
    <div className="border border-purple-200 rounded-lg bg-purple-50 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-medium text-purple-700">
          <Sparkles className="h-3.5 w-3.5" />
          Sugestão da IA
        </div>
        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={handleDismiss}>
          <X className="h-3 w-3" />
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-purple-600 py-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Gerando sugestão...
        </div>
      ) : editing ? (
        <Textarea
          value={suggestion}
          onChange={(e) => setSuggestion(e.target.value)}
          rows={3}
          className="text-sm bg-white"
        />
      ) : (
        <p className="text-sm whitespace-pre-wrap">{suggestion}</p>
      )}

      {!loading && suggestion && (
        <div className="flex gap-1.5">
          <Button size="sm" className="h-7 text-xs gap-1" onClick={handleSend}>
            <Send className="h-3 w-3" />
            Enviar
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => setEditing(!editing)}
          >
            <Pencil className="h-3 w-3" />
            {editing ? "Visualizar" : "Editar"}
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={requestSuggestion}>
            Regenerar
          </Button>
        </div>
      )}
    </div>
  )
}
