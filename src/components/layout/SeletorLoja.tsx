"use client"

import { useEffect, useState } from "react"
import { Store, Check, ChevronDown } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { COOKIE_LOJA } from "@/lib/loja"
import { cn } from "@/lib/utils"

interface Loja {
  id: string
  nome: string
  slug: string
}

const TODAS = "__todas__"

/** Le o cookie da loja ativa no navegador. */
function lojaSalva(): string {
  const achado = document.cookie
    .split(";")
    .map((p) => p.trim().split("="))
    .find(([nome]) => nome === COOKIE_LOJA)
  return achado?.[1] ? decodeURIComponent(achado[1]) : TODAS
}

/**
 * Seletor de loja para papel de gestao.
 *
 * A escolha vai num cookie em vez de virar parametro em cada `fetch`: sao ~48
 * chamadas espalhadas pelos componentes, e cookie ja viaja em todas. O servidor
 * so honra a escolha para admin/gerente — vendedor pode forjar o cookie a
 * vontade que o escopo continua sendo o da loja do cadastro dele.
 *
 * Trocar recarrega a pagina. Os dados sao carregados por `useEffect` em cada
 * tela; um reload e mais honesto (e mais curto) do que orquestrar refetch de
 * tudo que esta montado.
 */
export function SeletorLoja() {
  const [lojas, setLojas] = useState<Loja[]>([])
  const [podeTrocar, setPodeTrocar] = useState(false)
  const [ativa, setAtiva] = useState<string>(TODAS)

  useEffect(() => {
    setAtiva(lojaSalva())
    fetch("/api/lojas")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return
        setLojas(d.lojas)
        setPodeTrocar(d.podeTrocar)
      })
      .catch(() => {
        // Sem lojas o seletor simplesmente nao aparece.
      })
  }, [])

  function trocar(valor: string) {
    if (valor === TODAS) {
      document.cookie = `${COOKIE_LOJA}=; path=/; max-age=0; SameSite=Lax`
    } else {
      document.cookie = `${COOKIE_LOJA}=${encodeURIComponent(valor)}; path=/; max-age=31536000; SameSite=Lax`
    }
    window.location.reload()
  }

  // Vendedor nao escolhe: ve a etiqueta da loja dele, sem menu.
  if (!podeTrocar) {
    const minha = lojas[0]
    if (!minha) return null
    return (
      <div
        className="hidden md:flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-muted-foreground"
        title="Sua loja"
      >
        <Store className="h-4 w-4" aria-hidden="true" />
        <span>{minha.nome}</span>
      </div>
    )
  }

  const nomeAtivo =
    ativa === TODAS ? "Todas as lojas" : lojas.find((l) => l.id === ativa)?.nome ?? "Todas as lojas"

  return (
    <DropdownMenu>
      {/* O gatilho JA e um <button>: por um <Button> dentro geraria botao
          aninhado — DOM invalido, e leitor de tela anuncia dois controles.
          Estilizar o proprio gatilho evita isso sem passar ref (o `Button`
          desta base nao e forwardRef). */}
      <DropdownMenuTrigger
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-1.5")}
        aria-label={`Loja ativa: ${nomeAtivo}. Trocar de loja`}
      >
        <Store className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">{nomeAtivo}</span>
        <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuItem onClick={() => trocar(TODAS)} className="justify-between">
          Todas as lojas
          {ativa === TODAS && <Check className="h-4 w-4" aria-hidden="true" />}
        </DropdownMenuItem>
        {lojas.map((loja) => (
          <DropdownMenuItem
            key={loja.id}
            onClick={() => trocar(loja.id)}
            className="justify-between"
          >
            {loja.nome}
            {ativa === loja.id && <Check className="h-4 w-4" aria-hidden="true" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
