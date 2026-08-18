"use client"

import { useEffect, useState, useCallback } from "react"
import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { motion } from "framer-motion"
import { Plus, GripVertical } from "lucide-react"
import { SkeletonKanban } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

interface DealContact {
  id: string
  name: string | null
  phone: string | null
  avatarUrl: string | null
  tags: string[]
}

interface Deal {
  id: string
  stage: string
  value: number
  notes: string | null
  lastActivityAt: string
  contact: DealContact
  conversation: { id: string; channel: string } | null
  assignee: { id: string; name: string } | null
}

interface PipelineStage {
  stage: string
  deals: Deal[]
  totalValue: number
  count: number
}

const stageConfig: Record<string, { label: string; color: string }> = {
  lead: { label: "Lead", color: "bg-neutral-100 border-neutral-300" },
  interested: { label: "Interessada", color: "bg-blue-50 border-blue-300" },
  negotiating: { label: "Negociando", color: "bg-yellow-50 border-yellow-300" },
  closing: { label: "Fechando", color: "bg-orange-50 border-orange-300" },
  won: { label: "Ganhou", color: "bg-green-50 border-green-300" },
  lost: { label: "Perdeu", color: "bg-red-50 border-red-300" },
}

const lossReasons = [
  { value: "price", label: "Preço" },
  { value: "size_unavailable", label: "Tamanho indisponível" },
  { value: "competitor", label: "Concorrente" },
  { value: "no_response", label: "Sem resposta" },
  { value: "changed_mind", label: "Mudou de ideia" },
  { value: "other", label: "Outro" },
]

export default function PipelinePage() {
  const [pipeline, setPipeline] = useState<PipelineStage[]>([])
  const [loading, setLoading] = useState(true)
  const [dragDealId, setDragDealId] = useState<string | null>(null)
  const [dragOverStage, setDragOverStage] = useState<string | null>(null)
  const [lossDialog, setLossDialog] = useState<{ dealId: string; fromStage: string } | null>(null)
  const [lossReason, setLossReason] = useState("")
  const [lossNotes, setLossNotes] = useState("")
  const [newDealDialog, setNewDealDialog] = useState(false)
  const [newContactId, setNewContactId] = useState("")
  const [newValue, setNewValue] = useState("")
  const [newNotes, setNewNotes] = useState("")

  const load = useCallback(async () => {
    const res = await fetch("/api/deals")
    if (res.ok) {
      const data = await res.json()
      setPipeline(data.pipeline)
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function moveDeal(dealId: string, toStage: string) {
    if (toStage === "lost") {
      // Find deal's current stage
      const deal = pipeline.flatMap((s) => s.deals).find((d) => d.id === dealId)
      setLossDialog({ dealId, fromStage: deal?.stage || "" })
      return
    }

    await fetch(`/api/deals/${dealId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      // Quem mudou o estagio sai da sessao, no servidor.
      body: JSON.stringify({ stage: toStage }),
    })

    toast.success(`Deal movido para ${stageConfig[toStage]?.label || toStage}`)
    load()
  }

  async function confirmLoss() {
    if (!lossDialog) return

    await fetch(`/api/deals/${lossDialog.dealId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stage: "lost",
        lossReason: lossReason || "other",
        lossNotes,
      }),
    })

    toast.success("Deal marcado como perdido")
    setLossDialog(null)
    setLossReason("")
    setLossNotes("")
    load()
  }

  async function createDeal() {
    if (!newContactId) return

    const res = await fetch("/api/deals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contactId: newContactId,
        value: parseFloat(newValue) || 0,
        notes: newNotes || null,
        stage: "lead",
      }),
    })

    if (res.ok) {
      toast.success("Deal criado")
      setNewDealDialog(false)
      setNewContactId("")
      setNewValue("")
      setNewNotes("")
      load()
    } else {
      toast.error("Erro ao criar deal")
    }
  }

  function handleDragStart(dealId: string) {
    setDragDealId(dealId)
  }

  function handleDragOver(e: React.DragEvent, stage: string) {
    e.preventDefault()
    setDragOverStage(stage)
  }

  function handleDragLeave() {
    setDragOverStage(null)
  }

  function handleDrop(stage: string) {
    if (dragDealId) {
      moveDeal(dragDealId, stage)
    }
    setDragDealId(null)
    setDragOverStage(null)
  }

  const totalPipeline = pipeline
    .filter((s) => !["won", "lost"].includes(s.stage))
    .reduce((sum, s) => sum + s.totalValue, 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Pipeline de Vendas</h1>
          <p className="text-muted-foreground">
            R$ {totalPipeline.toFixed(2)} em negociação
          </p>
        </div>
        <Button onClick={() => setNewDealDialog(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Novo Deal
        </Button>
      </div>

      {/* Kanban Board */}
      {loading ? (
        <SkeletonKanban />
      ) : (
      <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: "calc(100vh - 16rem)" }}>
        {pipeline.map((col, index) => {
          const config = stageConfig[col.stage] || { label: col.stage, color: "bg-neutral-50" }

          return (
            <motion.div
              key={col.stage}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.08, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className={cn(
                "flex flex-col w-72 shrink-0 rounded-lg border",
                config.color,
                dragOverStage === col.stage && "ring-2 ring-neutral-400"
              )}
              onDragOver={(e) => handleDragOver(e, col.stage)}
              onDragLeave={handleDragLeave}
              onDrop={() => handleDrop(col.stage)}
            >
              {/* Column Header */}
              <div className="px-3 py-2 border-b flex items-center justify-between">
                <div>
                  <span className="font-semibold text-sm">{config.label}</span>
                  <span className="text-xs text-muted-foreground ml-2">{col.count}</span>
                </div>
                <span className="text-xs font-medium">
                  R$ {col.totalValue.toFixed(0)}
                </span>
              </div>

              {/* Cards */}
              <ScrollArea className="flex-1 p-2">
                <div className="space-y-2">
                  {col.deals.map((deal, dealIndex) => {
                    const initials = deal.contact.name
                      ?.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) || "?"

                    return (
                      <motion.div
                        key={deal.id}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: index * 0.08 + dealIndex * 0.04 }}
                        whileHover={{ y: -2, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
                        draggable
                        onDragStart={() => handleDragStart(deal.id)}
                        className={cn(
                          "bg-white rounded-lg border p-3 cursor-grab active:cursor-grabbing hover:shadow-sm transition-shadow",
                          dragDealId === deal.id && "opacity-50"
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <GripVertical className="h-4 w-4 text-neutral-300 shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <Avatar className="h-6 w-6">
                                <AvatarFallback className="text-[10px] bg-neutral-100">
                                  {initials}
                                </AvatarFallback>
                              </Avatar>
                              <span className="text-sm font-medium truncate">
                                {deal.contact.name || deal.contact.phone || "—"}
                              </span>
                            </div>

                            <p className="text-lg font-bold text-neutral-900 mt-1">
                              R$ {Number(deal.value).toFixed(2)}
                            </p>

                            {deal.contact.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {deal.contact.tags.slice(0, 2).map((tag) => (
                                  <Badge key={tag} variant="secondary" className="text-[10px] px-1 py-0">
                                    {tag}
                                  </Badge>
                                ))}
                              </div>
                            )}

                            {deal.conversation && (
                              <Badge variant="outline" className="text-[10px] mt-1">
                                {deal.conversation.channel}
                              </Badge>
                            )}

                            <p className="text-[10px] text-muted-foreground mt-1">
                              {formatDistanceToNow(new Date(deal.lastActivityAt), {
                                addSuffix: true,
                                locale: ptBR,
                              })}
                            </p>
                          </div>
                        </div>
                      </motion.div>
                    )
                  })}
                </div>
              </ScrollArea>
            </motion.div>
          )
        })}
      </div>
      )}

      {/* Loss Reason Dialog */}
      <Dialog open={!!lossDialog} onOpenChange={() => setLossDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Motivo da Perda</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Motivo</Label>
              <Select value={lossReason} onValueChange={(v) => setLossReason(v || "")}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o motivo" />
                </SelectTrigger>
                <SelectContent>
                  {lossReasons.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea
                value={lossNotes}
                onChange={(e) => setLossNotes(e.target.value)}
                placeholder="Detalhes adicionais..."
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setLossDialog(null)}>Cancelar</Button>
              <Button variant="destructive" onClick={confirmLoss}>Confirmar Perda</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* New Deal Dialog */}
      <Dialog open={newDealDialog} onOpenChange={setNewDealDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Deal</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>ID do Contato *</Label>
              <Input
                value={newContactId}
                onChange={(e) => setNewContactId(e.target.value)}
                placeholder="Cole o ID do contato"
              />
            </div>
            <div className="space-y-2">
              <Label>Valor Estimado (R$)</Label>
              <Input
                type="number"
                step="0.01"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label>Notas</Label>
              <Textarea
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                rows={2}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setNewDealDialog(false)}>Cancelar</Button>
              <Button onClick={createDeal}>Criar Deal</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
