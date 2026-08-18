"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Check } from "lucide-react"
import { ChannelBadge } from "./ChannelBadge"

/**
 * Cabecalho da conversa: quem e a cliente, por qual canal, e as duas acoes que
 * encerram o atendimento.
 *
 * Os botoes "Transferir" e "Resolver" existiam antes sem `onClick` nenhum:
 * clicavam e nada acontecia. Um botao que nao faz nada e pior que a ausencia
 * dele, porque a atendente acredita ter transferido a conversa.
 */

type Agente = { id: string; name: string; role: string }

export function CabecalhoConversa({
  contactName,
  channel,
  onTransferir,
  onResolver,
}: {
  contactName: string
  channel: string
  onTransferir: (agenteId: string, nome: string) => Promise<void>
  onResolver: () => Promise<void>
}) {
  const [agentes, setAgentes] = useState<Agente[]>([])
  const [ocupado, setOcupado] = useState(false)

  // A lista vem do servidor filtrada por loja: transferir para alguem que nao
  // atende esta loja deixaria a conversa atribuida a quem nao consegue abri-la.
  useEffect(() => {
    void fetch("/api/usuarios")
      .then((r) => (r.ok ? r.json() : []))
      .then((lista) => setAgentes(Array.isArray(lista) ? lista : []))
      .catch(() => setAgentes([]))
  }, [])

  return (
    <div className="flex items-center justify-between border-b border-neutral-200/60 px-5 py-3">
      <div className="flex items-center gap-2.5">
        <span className="font-semibold tracking-tight text-neutral-900">
          {contactName}
        </span>
        <ChannelBadge channel={channel} />
      </div>

      <div className="flex gap-1.5">
        <select
          aria-label="Transferir conversa"
          disabled={ocupado || agentes.length === 0}
          // Sempre vazio: o seletor e um disparador de acao, nao um campo com
          // valor. Deixar o nome escolhido fixo sugeriria um estado que nao
          // temos aqui (quem esta atribuido vem da conversa, nao daqui).
          value=""
          onChange={async (e) => {
            const destino = e.target.value
            if (!destino) return
            const nome = agentes.find((a) => a.id === destino)?.name ?? "o colega"
            setOcupado(true)
            try {
              await onTransferir(destino, nome)
            } finally {
              setOcupado(false)
            }
          }}
          className="h-7 rounded-lg border border-neutral-200/60 bg-white px-2 text-xs text-neutral-600 disabled:opacity-50"
        >
          <option value="">
            {agentes.length === 0 ? "Sem colegas disponíveis" : "Transferir para..."}
          </option>
          {agentes.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.role})
            </option>
          ))}
        </select>

        <Button
          variant="outline"
          size="sm"
          disabled={ocupado}
          className="h-7 rounded-lg border-neutral-200/60 text-xs text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900"
          onClick={async () => {
            setOcupado(true)
            try {
              await onResolver()
            } finally {
              setOcupado(false)
            }
          }}
        >
          <Check className="mr-1 h-3 w-3" />
          Resolver
        </Button>
      </div>
    </div>
  )
}
