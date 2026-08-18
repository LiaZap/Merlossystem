"use client"

import { useEffect, useState, useCallback } from "react"
import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { CheckCircle, XCircle } from "lucide-react"
import { toast } from "sonner"
import { SkeletonTable } from "@/components/ui/skeleton"

interface Return {
  id: string
  type: string
  reason: string
  reasonDetail: string | null
  status: string
  createdAt: string
  contact: { id: string; name: string | null; phone: string | null }
  order: { id: string; orderNumber: string }
}

const statusLabels: Record<string, string> = {
  requested: "Solicitado",
  approved: "Aprovado",
  shipping_back: "Enviando",
  received: "Recebido",
  completed: "Concluído",
  denied: "Negado",
}

const statusColors: Record<string, string> = {
  requested: "bg-yellow-100 text-yellow-700",
  approved: "bg-blue-100 text-blue-700",
  shipping_back: "bg-purple-100 text-purple-700",
  received: "bg-orange-100 text-orange-700",
  completed: "bg-green-100 text-green-700",
  denied: "bg-red-100 text-red-700",
}

const typeLabels: Record<string, string> = { exchange: "Troca", return: "Devolução", refund: "Reembolso" }
const reasonLabels: Record<string, string> = {
  wrong_size: "Tamanho errado", defect: "Defeito", not_as_expected: "Diferente do esperado",
  changed_mind: "Mudou de ideia", other: "Outro",
}

export default function ReturnsPage() {
  const [returns, setReturns] = useState<Return[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState("all")

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (statusFilter !== "all") params.set("status", statusFilter)
    const res = await fetch(`/api/returns?${params}`)
    if (res.ok) setReturns(await res.json())
    setLoading(false)
  }, [statusFilter])

  useEffect(() => { load() }, [load])

  async function updateStatus(id: string, status: string) {
    await fetch(`/api/returns/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      // Quem resolveu sai da sessao, no servidor.
      body: JSON.stringify({ status }),
    })
    toast.success(`Status atualizado para ${statusLabels[status]}`)
    load()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Trocas e Devoluções</h1>
          <p className="text-muted-foreground">Gerenciar solicitações</p>
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v || "all")}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {Object.entries(statusLabels).map(([v, l]) => (
              <SelectItem key={v} value={v}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <SkeletonTable rows={5} cols={6} />
      ) : (
      <div className="rounded-md border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pedido</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Motivo</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Data</TableHead>
              <TableHead className="w-32">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {returns.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhuma solicitação</TableCell>
              </TableRow>
            ) : (
              returns.map((r) => (
                <TableRow key={r.id} className="hover:bg-neutral-50/80 transition-colors cursor-pointer">
                  <TableCell className="font-mono text-sm">{r.order.orderNumber}</TableCell>
                  <TableCell>{r.contact.name || r.contact.phone || "—"}</TableCell>
                  <TableCell><Badge variant="outline">{typeLabels[r.type] || r.type}</Badge></TableCell>
                  <TableCell className="text-sm">{reasonLabels[r.reason] || r.reason}</TableCell>
                  <TableCell><Badge className={statusColors[r.status] || ""}>{statusLabels[r.status]}</Badge></TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDistanceToNow(new Date(r.createdAt), { addSuffix: true, locale: ptBR })}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {r.status === "requested" && (
                        <>
                          <Button variant="ghost" size="icon" aria-label="Aprovar solicitação" onClick={() => updateStatus(r.id, "approved")} title="Aprovar">
                            <CheckCircle className="h-4 w-4 text-green-500" />
                          </Button>
                          <Button variant="ghost" size="icon" aria-label="Negar solicitação" onClick={() => updateStatus(r.id, "denied")} title="Negar">
                            <XCircle className="h-4 w-4 text-red-500" />
                          </Button>
                        </>
                      )}
                      {r.status === "approved" && (
                        <Button size="sm" variant="outline" onClick={() => updateStatus(r.id, "shipping_back")}>
                          Em trânsito
                        </Button>
                      )}
                      {r.status === "received" && (
                        <Button size="sm" onClick={() => updateStatus(r.id, "completed")}>
                          Concluir
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
    </div>
  )
}
