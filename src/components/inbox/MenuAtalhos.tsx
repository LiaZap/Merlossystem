"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"

/**
 * Menu de respostas rapidas, aberto quando a atendente digita "/".
 *
 * Substitui a dica estatica que existia antes ("Atalhos: /frete /medidas
 * /troca..."), que tinha tres defeitos: a lista era escrita a mao no codigo e
 * nao acompanhava as respostas cadastradas no banco; nao dava para ver o texto
 * antes de enviar; e o atalho so era reconhecido se fosse a primeira palavra
 * exata, entao "/fret" nao achava nada e "/frete quanto custa" dependia de
 * acerto no espaco.
 *
 * A navegacao por teclado usa listener em `window` na fase de captura porque o
 * foco fica no campo de texto, nao no menu: sem capturar antes, a seta para
 * baixo moveria o cursor no textarea em vez de mudar a selecao.
 */

export type RespostaRapida = {
  id: string
  title: string
  content: string
  shortcut: string | null
  category: string | null
}

export function MenuAtalhos({
  termo,
  aberto,
  onEscolher,
  onFechar,
}: {
  /** O que foi digitado depois da "/", sem a barra. */
  termo: string
  aberto: boolean
  onEscolher: (conteudo: string) => void
  onFechar: () => void
}) {
  const [respostas, setRespostas] = useState<RespostaRapida[]>([])
  const [indice, setIndice] = useState(0)
  const [carregando, setCarregando] = useState(false)
  const listaRef = useRef<HTMLUListElement>(null)

  // Busca no servidor, com debounce: sem ele cada tecla dispara um request e a
  // resposta lenta de uma tecla antiga sobrescreve a da tecla atual.
  useEffect(() => {
    if (!aberto) return
    let vivo = true
    const timer = setTimeout(async () => {
      setCarregando(true)
      try {
        const params = new URLSearchParams({ apenasAtivas: "1" })
        if (termo) params.set("search", termo)
        const res = await fetch(`/api/quick-replies?${params}`)
        if (!vivo) return
        const dados = res.ok ? await res.json() : []
        if (!vivo) return
        setRespostas(Array.isArray(dados) ? dados : [])
        setIndice(0)
      } finally {
        if (vivo) setCarregando(false)
      }
    }, 150)
    return () => {
      vivo = false
      clearTimeout(timer)
    }
  }, [termo, aberto])

  // Teclado. Em captura, para chegar antes do textarea.
  useEffect(() => {
    if (!aberto) return

    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault()
        onFechar()
        return
      }
      if (respostas.length === 0) return

      if (e.key === "ArrowDown") {
        e.preventDefault()
        setIndice((i) => (i + 1) % respostas.length)
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        setIndice((i) => (i - 1 + respostas.length) % respostas.length)
      } else if (e.key === "Enter" && !e.shiftKey) {
        // Enter com o menu aberto escolhe o atalho; nao envia a mensagem.
        e.preventDefault()
        e.stopPropagation()
        onEscolher(respostas[indice].content)
      }
    }

    window.addEventListener("keydown", aoTeclar, true)
    return () => window.removeEventListener("keydown", aoTeclar, true)
  }, [aberto, respostas, indice, onEscolher, onFechar])

  // Mantem o item selecionado visivel ao navegar com as setas.
  useEffect(() => {
    const item = listaRef.current?.children[indice] as HTMLElement | undefined
    item?.scrollIntoView({ block: "nearest" })
  }, [indice])

  if (!aberto) return null

  return (
    <div
      className="absolute bottom-full left-3 right-3 mb-2 z-20 overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-lg"
      role="listbox"
      aria-label="Respostas rápidas"
    >
      {respostas.length === 0 ? (
        <p className="px-3 py-2.5 text-xs text-muted-foreground">
          {carregando ? "Buscando..." : `Nenhuma resposta rápida para "${termo}".`}
        </p>
      ) : (
        <ul ref={listaRef} className="max-h-64 overflow-y-auto">
          {respostas.map((r, i) => (
            <li
              key={r.id}
              role="option"
              aria-selected={i === indice}
              className={cn(
                "cursor-pointer border-b border-border/50 px-3 py-2 last:border-b-0",
                i === indice ? "bg-accent text-accent-foreground" : "hover:bg-muted"
              )}
              // `onMouseDown` e nao `onClick`: o clique tira o foco do textarea
              // antes do onClick disparar, e o menu fecharia primeiro.
              onMouseDown={(e) => {
                e.preventDefault()
                onEscolher(r.content)
              }}
              onMouseEnter={() => setIndice(i)}
            >
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-semibold">{r.title}</span>
                {r.shortcut && (
                  <span className="rounded bg-muted px-1 font-mono text-[10px] text-muted-foreground">
                    {r.shortcut}
                  </span>
                )}
              </div>
              <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                {r.content}
              </p>
            </li>
          ))}
        </ul>
      )}
      <p className="border-t border-border bg-muted/50 px-3 py-1.5 text-[10px] text-muted-foreground">
        ↑↓ navega · Enter escolhe · Esc fecha
      </p>
    </div>
  )
}
