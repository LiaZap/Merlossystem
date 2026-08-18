"use client"

import { useEffect, useState, useCallback } from "react"
import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Search, Eye, CreditCard, ClipboardCheck } from "lucide-react"
import { toast } from "sonner"
import { SkeletonTable } from "@/components/ui/skeleton"
import { ModalConfirmacaoBlock } from "@/components/modal-confirmacao-block"

interface OrderItem {
  name: string
  size: string
  quantity: number
  unitPrice: number
}

interface Order {
  id: string
  orderNumber: string
  status: string
  mascStatus: string
  mascVendaId: string | null
  total: number
  paymentStatus: string
  paymentMethod: string | null
  trackingCode: string | null
  createdAt: string
  contact: { id: string; name: string | null; phone: string | null }
  items: OrderItem[]
  payments: { id: string; method: string; status: string; amount: number }[]
}

interface OrderDetail extends Order {
  subtotal: number
  shippingCost: number
  discount: number
  notes: string | null
  events: { id: string; status: string; description: string | null; createdAt: string }[]
}

const statusLabels: Record<string, string> = {
  confirmed: "Confirmado",
  preparing: "Preparando",
  shipped: "Enviado",
  delivered: "Entregue",
  returned: "Devolvido",
  cancelled: "Cancelado",
}

/** Lancamento no Masc — o Masc e o dono da venda (ADR 0004). */
const mascLabels: Record<string, string> = {
  pendente: "Falta lançar",
  lancado: "Lançado",
  dispensado: "Não vai",
}
const mascColors: Record<string, string> = {
  pendente: "bg-amber-100 text-amber-800",
  lancado: "bg-green-100 text-green-700",
  dispensado: "bg-neutral-100 text-neutral-600",
}

const statusColors: Record<string, string> = {
  confirmed: "bg-blue-100 text-blue-700",
  preparing: "bg-yellow-100 text-yellow-700",
  shipped: "bg-purple-100 text-purple-700",
  delivered: "bg-green-100 text-green-700",
  returned: "bg-red-100 text-red-700",
  cancelled: "bg-neutral-100 text-neutral-700",
}

const paymentStatusLabels: Record<string, string> = {
  pending: "Pendente",
  paid: "Pago",
  refunded: "Reembolsado",
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [mascFilter, setMascFilter] = useState("all")
  const [mascAlvo, setMascAlvo] = useState<Order | null>(null)
  const [mascVendaId, setMascVendaId] = useState("")
  const [mascGravando, setMascGravando] = useState(false)
  const [detailOrder, setDetailOrder] = useState<OrderDetail | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (search) params.set("search", search)
    if (statusFilter !== "all") params.set("status", statusFilter)
    if (mascFilter !== "all") params.set("masc", mascFilter)

    const res = await fetch(`/api/orders?${params}`)
    if (res.ok) {
      const data = await res.json()
      setOrders(data.orders)
    }
    setLoading(false)
  }, [search, statusFilter, mascFilter])

  useEffect(() => { load() }, [load])

  async function viewDetail(id: string) {
    const res = await fetch(`/api/orders/${id}`)
    if (res.ok) setDetailOrder(await res.json())
  }

  async function updateStatus(id: string, status: string) {
    await fetch(`/api/orders/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    })
    toast.success(`Status atualizado para ${statusLabels[status] || status}`)
    load()
    if (detailOrder?.id === id) viewDetail(id)
  }

  /**
   * Registra que a venda foi lancada no Masc.
   *
   * Nao ha chamada ao Masc: ele e o dono da venda e quem digita a venda la e
   * uma pessoa (ADR 0004). Aqui so anotamos o numero, que e a unica chave que
   * cruza os dois sistemas — por isso passa pelo modal com bloqueio de 3s, e
   * nao por um `window.prompt`, que alguns navegadores suprimem e transformam
   * a acao num no-op silencioso.
   */
  function abrirMasc(order: Order) {
    setMascAlvo(order)
    setMascVendaId(order.mascVendaId || "")
  }

  async function confirmarMasc() {
    if (!mascAlvo) return
    const vendaId = mascVendaId.trim()
    if (!vendaId) {
      toast.error("Informe o número da venda no Masc")
      return
    }

    setMascGravando(true)
    try {
      const res = await fetch(`/api/orders/${mascAlvo.id}/masc`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "lancado", vendaId }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(d.error || "Não foi possível registrar o lançamento")
        return
      }
      toast.success(`Pedido ${mascAlvo.orderNumber} marcado como lançado no Masc`)
      setMascAlvo(null)
      load()
    } finally {
      setMascGravando(false)
    }
  }

  async function generatePix(orderId: string) {
    const res = await fetch("/api/payments/pix", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId }),
    })
    if (res.ok) {
      toast.success("Pix gerado com sucesso")
      load()
      viewDetail(orderId)
    } else {
      toast.error("Erro ao gerar Pix")
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Pedidos</h1>
          <p className="text-muted-foreground">Gestão de pedidos e rastreio</p>
        </div>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por número ou cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v || "all")}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {Object.entries(statusLabels).map(([v, l]) => (
              <SelectItem key={v} value={v}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={mascFilter} onValueChange={(v) => setMascFilter(v || "all")}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Masc" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Masc: todos</SelectItem>
            {Object.entries(mascLabels).map(([v, l]) => (
              <SelectItem key={v} value={v}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <SkeletonTable rows={8} cols={8} />
      ) : (
      <div className="rounded-md border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pedido</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Pagamento</TableHead>
              <TableHead>Masc</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Data</TableHead>
              <TableHead className="w-20">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  Nenhum pedido encontrado
                </TableCell>
              </TableRow>
            ) : (
              orders.map((order) => (
                <TableRow key={order.id} className="hover:bg-neutral-50/80 transition-colors cursor-pointer">
                  <TableCell className="font-mono text-sm font-medium">
                    {order.orderNumber}
                  </TableCell>
                  <TableCell>{order.contact.name || order.contact.phone || "—"}</TableCell>
                  <TableCell>
                    <Badge className={statusColors[order.status] || ""}>
                      {statusLabels[order.status] || order.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={order.paymentStatus === "paid" ? "default" : "outline"}>
                      {paymentStatusLabels[order.paymentStatus] || order.paymentStatus}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className={mascColors[order.mascStatus] || ""}>
                      {mascLabels[order.mascStatus] || order.mascStatus}
                    </Badge>
                    {order.mascVendaId && (
                      <span className="ml-1.5 font-mono text-xs text-muted-foreground">
                        {order.mascVendaId}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    R$ {Number(order.total).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDistanceToNow(new Date(order.createdAt), { addSuffix: true, locale: ptBR })}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" aria-label="Ver pedido" onClick={() => viewDetail(order.id)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      {order.paymentStatus === "pending" && (
                        <Button variant="ghost" size="icon" aria-label="Gerar Pix" onClick={() => generatePix(order.id)}>
                          <CreditCard className="h-4 w-4" />
                        </Button>
                      )}
                      {order.mascStatus === "pendente" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Registrar lançamento no Masc do pedido ${order.orderNumber}`}
                          onClick={() => abrirMasc(order)}
                        >
                          <ClipboardCheck className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      )}

      {/* Acao critica: dizer "lancado" solta a reserva e o estoque passa a ser
          oferecido de novo. Bloqueio de 3s. */}
      <ModalConfirmacaoBlock
        aberto={mascAlvo !== null}
        titulo="Lançamento no Masc"
        rotuloConfirmar="Registrar lançamento"
        onConfirmar={confirmarMasc}
        onCancelar={() => setMascAlvo(null)}
        carregando={mascGravando}
      >
        <div className="space-y-3 text-sm">
          <p>
            Pedido <strong>{mascAlvo?.orderNumber}</strong> —{" "}
            {mascAlvo?.contact.name || mascAlvo?.contact.phone} — R${" "}
            {Number(mascAlvo?.total ?? 0).toFixed(2)}
          </p>
          <div className="space-y-1">
            <label htmlFor="masc-venda" className="text-xs font-medium">
              Número da venda no Masc
            </label>
            <Input
              id="masc-venda"
              value={mascVendaId}
              onChange={(e) => setMascVendaId(e.target.value)}
              placeholder="ex: 45231"
              autoComplete="off"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Confirme que a venda existe no Masc com este número. É por ele que o estoque
            baixa no Bling — e ao registrar aqui, a peça deixa de ficar reservada e volta a
            ser oferecida no atendimento.
          </p>
        </div>
      </ModalConfirmacaoBlock>

      {/* Order Detail Dialog */}
      <Dialog open={!!detailOrder} onOpenChange={() => setDetailOrder(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Pedido {detailOrder?.orderNumber}</DialogTitle>
          </DialogHeader>
          {detailOrder && (
            <div className="space-y-4">
              {/* Status + Actions */}
              <div className="flex items-center justify-between">
                <Badge className={`text-sm ${statusColors[detailOrder.status] || ""}`}>
                  {statusLabels[detailOrder.status] || detailOrder.status}
                </Badge>
                <div className="flex gap-1">
                  {detailOrder.status === "confirmed" && (
                    <Button size="sm" onClick={() => updateStatus(detailOrder.id, "preparing")}>
                      Preparando
                    </Button>
                  )}
                  {detailOrder.status === "preparing" && (
                    <Button size="sm" onClick={() => updateStatus(detailOrder.id, "shipped")}>
                      Enviado
                    </Button>
                  )}
                  {detailOrder.status === "shipped" && (
                    <Button size="sm" onClick={() => updateStatus(detailOrder.id, "delivered")}>
                      Entregue
                    </Button>
                  )}
                </div>
              </div>

              {/* Items */}
              <div>
                <h4 className="text-sm font-semibold mb-2">Itens</h4>
                <div className="space-y-1">
                  {(detailOrder.items as OrderItem[]).map((item, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span>{item.name} ({item.size}) x{item.quantity}</span>
                      <span>R$ {(item.unitPrice * item.quantity).toFixed(2)}</span>
                    </div>
                  ))}
                  <div className="border-t pt-1 mt-1 space-y-0.5 text-sm">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Subtotal</span>
                      <span>R$ {Number(detailOrder.subtotal).toFixed(2)}</span>
                    </div>
                    {Number(detailOrder.shippingCost) > 0 && (
                      <div className="flex justify-between text-muted-foreground">
                        <span>Frete</span>
                        <span>R$ {Number(detailOrder.shippingCost).toFixed(2)}</span>
                      </div>
                    )}
                    {Number(detailOrder.discount) > 0 && (
                      <div className="flex justify-between text-green-600">
                        <span>Desconto</span>
                        <span>-R$ {Number(detailOrder.discount).toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold">
                      <span>Total</span>
                      <span>R$ {Number(detailOrder.total).toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Payments */}
              {detailOrder.payments.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">Pagamentos</h4>
                  {detailOrder.payments.map((p) => (
                    <div key={p.id} className="flex items-center gap-2 text-sm">
                      <Badge variant="outline">{p.method}</Badge>
                      <Badge variant={p.status === "approved" ? "default" : "secondary"}>
                        {p.status}
                      </Badge>
                      <span>R$ {Number(p.amount).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Timeline */}
              <div>
                <h4 className="text-sm font-semibold mb-2">Timeline</h4>
                <div className="space-y-2">
                  {detailOrder.events.map((evt) => (
                    <div key={evt.id} className="flex items-center gap-3 text-sm">
                      <div className="h-2 w-2 rounded-full bg-neutral-900 shrink-0" />
                      <div className="flex-1">
                        <span className="font-medium">{statusLabels[evt.status] || evt.status}</span>
                        {evt.description && (
                          <span className="text-muted-foreground ml-2">{evt.description}</span>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(evt.createdAt), { addSuffix: true, locale: ptBR })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
