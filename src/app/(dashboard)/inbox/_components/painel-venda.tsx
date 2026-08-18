"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { SkeletonTable } from "@/components/ui/skeleton"
import { ModalConfirmacaoBlock } from "@/components/modal-confirmacao-block"
import { Search, Plus, Minus, Trash2, AlertTriangle, ShoppingCart } from "lucide-react"

/**
 * Venda dentro do atendimento.
 *
 * A vendedora monta o pedido sem sair da conversa. O que a tela mostra de
 * estoque e `disponivel` = saldo do Bling menos o que ja foi prometido em
 * pedido ainda nao lancado no Masc (ADR 0004) — nao o saldo cru, que durante
 * essa janela superestima e faz duas atendentes prometerem a mesma peca.
 *
 * O pedido nasce **pendente de lancamento no Masc**, porque o Masc e o dono da
 * venda. Nada aqui escreve em ERP.
 */

interface ProdutoDisponivel {
  id: string
  nome: string
  sku: string | null
  preco: number
  tamanhos: string[]
  imagem: string | null
  saldo: number | null
  reservado: number
  disponivel: number | null
}

interface ItemCarrinho {
  productId: string
  name: string
  size: string
  quantity: number
  unitPrice: number
  /** Guardado so para avisar quando passa do disponivel. */
  disponivel: number | null
}

interface PainelVendaProps {
  aberto: boolean
  onFechar: () => void
  contactId: string
  contactNome: string
  conversationId: string
  /** Chamado apos gravar, para o pai recarregar o que precisar. */
  onVendaCriada?: (orderNumber: string) => void
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

export function PainelVenda({
  aberto,
  onFechar,
  contactId,
  contactNome,
  conversationId,
  onVendaCriada,
}: PainelVendaProps) {
  const [produtos, setProdutos] = useState<ProdutoDisponivel[]>([])
  const [busca, setBusca] = useState("")
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [estoqueAoVivo, setEstoqueAoVivo] = useState(true)
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([])
  const [confirmando, setConfirmando] = useState(false)
  const [gravando, setGravando] = useState(false)

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro(null)
    const params = new URLSearchParams()
    if (busca) params.set("busca", busca)

    const res = await fetch(`/api/products/disponibilidade?${params}`)
    const d = await res.json().catch(() => ({}))
    if (!res.ok) {
      setErro(d.error || "Nao foi possivel carregar o catalogo")
      setProdutos([])
    } else {
      setProdutos(d.produtos)
      setEstoqueAoVivo(d.estoqueAoVivo)
    }
    setCarregando(false)
  }, [busca])

  useEffect(() => {
    if (!aberto) return
    // Recarrega a cada abertura: o disponivel muda enquanto a conversa corre.
    const id = setTimeout(carregar, busca ? 300 : 0)
    return () => clearTimeout(id)
  }, [aberto, carregar, busca])

  function adicionar(p: ProdutoDisponivel, size: string) {
    setCarrinho((atual) => {
      const i = atual.findIndex((x) => x.productId === p.id && x.size === size)
      if (i >= 0) {
        const copia = [...atual]
        copia[i] = { ...copia[i], quantity: copia[i].quantity + 1 }
        return copia
      }
      return [
        ...atual,
        {
          productId: p.id,
          name: p.nome,
          size,
          quantity: 1,
          unitPrice: p.preco,
          disponivel: p.disponivel,
        },
      ]
    })
  }

  function mudarQtd(indice: number, delta: number) {
    setCarrinho((atual) =>
      atual
        .map((it, i) => (i === indice ? { ...it, quantity: it.quantity + delta } : it))
        .filter((it) => it.quantity > 0)
    )
  }

  const total = carrinho.reduce((s, i) => s + i.unitPrice * i.quantity, 0)

  /** Itens pedidos acima do que ha disponivel — a venda segue, mas avisada. */
  const acimaDoDisponivel = carrinho.filter(
    (i) => i.disponivel !== null && i.quantity > i.disponivel
  )

  async function gravar() {
    setGravando(true)
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId,
          conversationId,
          items: carrinho.map(({ productId, name, size, quantity, unitPrice }) => ({
            productId,
            name,
            size,
            quantity,
            unitPrice,
          })),
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(typeof d.error === "string" ? d.error : "Nao foi possivel gravar o pedido")
        return
      }
      toast.success(`Pedido ${d.orderNumber} criado — falta lançar no Masc`)
      setCarrinho([])
      setConfirmando(false)
      onVendaCriada?.(d.orderNumber)
      onFechar()
    } finally {
      setGravando(false)
    }
  }

  return (
    <>
      <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Nova venda — {contactNome}</DialogTitle>
          </DialogHeader>

          {!estoqueAoVivo && (
            <p className="flex items-start gap-1.5 rounded-md bg-amber-50 p-2 text-xs text-amber-800">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                <strong>Estoque não está ao vivo.</strong> O Bling não respondeu, ou a loja
                ainda não tem depósito configurado. Dá para vender, mas confira a peça antes
                de prometer.
              </span>
            </p>
          )}

          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar produto por nome ou SKU..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="pl-9"
              aria-label="Buscar produto"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <ScrollArea className="h-72 rounded-md border">
              {carregando ? (
                <div className="p-2">
                  <SkeletonTable rows={5} cols={2} />
                </div>
              ) : erro ? (
                <p className="p-4 text-sm text-red-600">{erro}</p>
              ) : produtos.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">Nenhum produto encontrado.</p>
              ) : (
                <ul className="divide-y">
                  {produtos.map((p) => (
                    <li key={p.id} className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{p.nome}</p>
                          <p className="font-mono text-xs text-muted-foreground">
                            {p.sku ?? "sem SKU"} · {brl(p.preco)}
                          </p>
                        </div>
                        <SeloDisponivel item={p} />
                      </div>

                      <div className="mt-2 flex flex-wrap gap-1">
                        {(p.tamanhos.length ? p.tamanhos : ["único"]).map((t) => (
                          <Button
                            key={t}
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs"
                            onClick={() => adicionar(p, t)}
                            aria-label={`Adicionar ${p.nome} tamanho ${t}`}
                          >
                            <Plus className="mr-1 h-3 w-3" aria-hidden="true" />
                            {t}
                          </Button>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </ScrollArea>

            <div className="flex h-72 flex-col rounded-md border">
              <ScrollArea className="flex-1">
                {carrinho.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center p-6 text-center">
                    <ShoppingCart className="h-8 w-8 text-neutral-300" aria-hidden="true" />
                    <p className="mt-2 text-sm text-muted-foreground">
                      Escolha os produtos ao lado
                    </p>
                  </div>
                ) : (
                  <ul className="divide-y">
                    {carrinho.map((it, i) => (
                      <li key={`${it.productId}-${it.size}`} className="p-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm">{it.name}</p>
                            <p className="text-xs text-muted-foreground">
                              Tam {it.size} · {brl(it.unitPrice)}
                            </p>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6"
                              onClick={() => mudarQtd(i, -1)}
                              aria-label={`Diminuir ${it.name} tamanho ${it.size}`}
                            >
                              <Minus className="h-3 w-3" aria-hidden="true" />
                            </Button>
                            <span className="w-5 text-center text-sm tabular-nums">
                              {it.quantity}
                            </span>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6"
                              onClick={() => mudarQtd(i, 1)}
                              aria-label={`Aumentar ${it.name} tamanho ${it.size}`}
                            >
                              <Plus className="h-3 w-3" aria-hidden="true" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6"
                              onClick={() => mudarQtd(i, -it.quantity)}
                              aria-label={`Remover ${it.name} tamanho ${it.size}`}
                            >
                              <Trash2 className="h-3 w-3" aria-hidden="true" />
                            </Button>
                          </div>
                        </div>
                        {it.disponivel !== null && it.quantity > it.disponivel && (
                          <p className="mt-1 text-xs text-amber-700">
                            Só há {it.disponivel} disponível
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </ScrollArea>

              <div className="border-t p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Total</span>
                  <span className="font-semibold tabular-nums">{brl(total)}</span>
                </div>
                <Button
                  className="mt-2 w-full"
                  disabled={carrinho.length === 0}
                  onClick={() => setConfirmando(true)}
                >
                  Fechar venda
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Acao critica: grava pedido e entra na fila do Masc. Bloqueio de 3s. */}
      <ModalConfirmacaoBlock
        aberto={confirmando}
        titulo="Fechar venda"
        rotuloConfirmar="Gravar pedido"
        onConfirmar={gravar}
        onCancelar={() => setConfirmando(false)}
        carregando={gravando}
      >
        <div className="space-y-2 text-sm">
          <p>
            Pedido para <strong>{contactNome}</strong>:
          </p>
          <ul className="max-h-40 space-y-0.5 overflow-y-auto rounded-md bg-neutral-50 p-2 text-xs">
            {carrinho.map((it) => (
              <li key={`${it.productId}-${it.size}`} className="flex justify-between gap-2">
                <span className="truncate">
                  {it.quantity}× {it.name} (tam {it.size})
                </span>
                <span className="tabular-nums">{brl(it.unitPrice * it.quantity)}</span>
              </li>
            ))}
          </ul>
          <p className="flex justify-between font-medium">
            <span>Total</span>
            <span className="tabular-nums">{brl(total)}</span>
          </p>

          {acimaDoDisponivel.length > 0 && (
            <p className="flex items-start gap-1.5 rounded-md bg-amber-50 p-2 text-xs text-amber-800">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                Você está vendendo mais do que há disponível em{" "}
                {acimaDoDisponivel.length === 1
                  ? "1 item"
                  : `${acimaDoDisponivel.length} itens`}
                . Confira a peça antes de confirmar.
              </span>
            </p>
          )}

          <p className="text-xs text-muted-foreground">
            O pedido entra na fila <strong>falta lançar no Masc</strong>. O estoque só baixa
            quando alguém lançar a venda lá — até isso acontecer, a peça continua contando
            como disponível para a loja física.
          </p>
        </div>
      </ModalConfirmacaoBlock>
    </>
  )
}

/** Disponivel para prometer, com o saldo cru como contexto. */
function SeloDisponivel({ item }: { item: ProdutoDisponivel }) {
  if (item.disponivel === null) {
    return (
      <Badge variant="outline" className="shrink-0 text-xs">
        estoque ?
      </Badge>
    )
  }
  const esgotado = item.disponivel === 0
  return (
    <Badge
      className={`shrink-0 text-xs ${esgotado ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}
      title={
        item.reservado > 0
          ? `Bling: ${item.saldo} · prometido e ainda não lançado no Masc: ${item.reservado}`
          : `Saldo no Bling: ${item.saldo}`
      }
    >
      {esgotado ? "esgotado" : `${item.disponivel} disp.`}
    </Badge>
  )
}
