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
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Plus, Play, Pause, Eye, Trash2, Users, Send, CheckCheck, MessageSquare } from "lucide-react"
import { toast } from "sonner"
import { SkeletonTable } from "@/components/ui/skeleton"

interface Broadcast {
  id: string
  name: string
  channel: string
  status: string
  totalRecipients: number
  sentCount: number
  deliveredCount: number
  readCount: number
  repliedCount: number
  failedCount: number
  scheduledFor: string | null
  createdAt: string
  template: { id: string; name: string } | null
  creator: { id: string; name: string } | null
}

interface Template {
  id: string
  name: string
  body: string
  status: string
}

const statusColors: Record<string, string> = {
  draft: "bg-neutral-100 text-neutral-700",
  scheduled: "bg-blue-100 text-blue-700",
  sending: "bg-yellow-100 text-yellow-700",
  paused: "bg-orange-100 text-orange-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
}

export default function BroadcastsPage() {
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([])
  const [loading, setLoading] = useState(true)
  const [templates, setTemplates] = useState<Template[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [name, setName] = useState("")
  const [templateId, setTemplateId] = useState("")
  const [tagFilter, setTagFilter] = useState("")
  const [sizeFilter, setSizeFilter] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch("/api/broadcasts")
    if (res.ok) setBroadcasts(await res.json())
    setLoading(false)
  }, [])

  const loadTemplates = useCallback(async () => {
    const res = await fetch("/api/templates?status=approved")
    if (res.ok) setTemplates(await res.json())
  }, [])

  useEffect(() => { load(); loadTemplates() }, [load, loadTemplates])

  async function handleCreate() {
    if (!name || !templateId) {
      toast.error("Nome e template são obrigatórios")
      return
    }

    const segmentFilter: Record<string, unknown> = {}
    if (tagFilter) segmentFilter.tags = tagFilter.split(",").map((t) => t.trim())
    if (sizeFilter) segmentFilter.preferred_size = sizeFilter

    const res = await fetch("/api/broadcasts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        templateId,
        segmentFilter,
      }),
    })

    if (res.ok) {
      toast.success("Broadcast criado")
      setDialogOpen(false)
      setName("")
      setTemplateId("")
      setTagFilter("")
      setSizeFilter("")
      load()
    } else {
      toast.error("Erro ao criar broadcast")
    }
  }

  const [enviando, setEnviando] = useState<string | null>(null)
  const [progresso, setProgresso] = useState<{ enviados: number; total: number } | null>(null)

  async function updateStatus(id: string, status: string) {
    const res = await fetch(`/api/broadcasts/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      toast.error(d.error || "Nao foi possivel mudar o status.")
      return
    }
    await load()
    // Marcar "sending" nao envia nada por si — era exatamente o defeito: a
    // campanha ficava eternamente "enviando" e nenhuma mensagem saia. Quem
    // envia e o laco abaixo, um lote por chamada.
    if (status === "sending") void dispararEmLotes(id)
  }

  /**
   * Envia a campanha, um lote por chamada, ate acabar.
   *
   * O laco vive aqui e nao no servidor porque um handler que envia mil
   * mensagens numa requisicao estoura o tempo limite e deixa a campanha em
   * estado desconhecido. Cada chamada e curta e o que ja saiu fica gravado:
   * fechar a aba no meio PAUSA o envio, nao o corrompe — reabrir e clicar em
   * retomar continua de onde parou, sem reenviar para quem ja recebeu.
   */
  async function dispararEmLotes(id: string) {
    setEnviando(id)
    try {
      for (;;) {
        const res = await fetch(`/api/broadcasts/${id}/disparar`, { method: "POST" })
        const d = await res.json().catch(() => ({}))

        if (!res.ok) {
          toast.error(d.error || "Falha ao enviar a campanha.")
          break
        }

        setProgresso({ enviados: d.enviados, total: d.total })
        await load()

        if (d.concluida || d.restantes === 0) {
          toast.success(
            `Campanha concluida: ${d.enviados} enviadas` +
              (d.falhas > 0 ? `, ${d.falhas} com falha.` : ".")
          )
          break
        }
      }
    } finally {
      setEnviando(null)
      setProgresso(null)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir este broadcast?")) return
    await fetch(`/api/broadcasts/${id}`, { method: "DELETE" })
    toast.success("Broadcast excluído")
    load()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Broadcast</h1>
          <p className="text-muted-foreground">Campanhas em massa por WhatsApp</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <Button onClick={() => setDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Nova Campanha
            </Button>
          <DialogContent>
            <DialogHeader><DialogTitle>Nova Campanha de Broadcast</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Nome da campanha *</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Lançamento Coleção Verão" />
              </div>
              <div className="space-y-2">
                <Label>Template aprovado *</Label>
                <Select value={templateId} onValueChange={(v) => setTemplateId(v || "")}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {templates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {templates.length === 0 && (
                  <p className="text-xs text-muted-foreground">Nenhum template aprovado. Crie um na página Templates.</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Segmentação</Label>
                <Input value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} placeholder="Tags (separadas por vírgula): plussize, vip" />
                <Select value={sizeFilter} onValueChange={(v) => setSizeFilter(v || "")}>
                  <SelectTrigger><SelectValue placeholder="Tamanho (opcional)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="slim">Slim</SelectItem>
                    <SelectItem value="plussize">Plus Size</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
                <Button onClick={handleCreate}>Criar Campanha</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <SkeletonTable rows={5} cols={5} />
      ) : (
      <div className="rounded-md border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Template</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Destinatários</TableHead>
              <TableHead>Métricas</TableHead>
              <TableHead>Criado</TableHead>
              <TableHead className="w-32">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {broadcasts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  Nenhuma campanha criada
                </TableCell>
              </TableRow>
            ) : (
              broadcasts.map((b) => (
                <TableRow key={b.id} className="hover:bg-neutral-50/80 transition-colors cursor-pointer">
                  <TableCell className="font-medium">{b.name}</TableCell>
                  <TableCell className="text-sm">{b.template?.name || "—"}</TableCell>
                  <TableCell>
                    <Badge className={statusColors[b.status] || ""}>{b.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 text-sm">
                      <Users className="h-3 w-3" /> {b.totalRecipients}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-0.5"><Send className="h-3 w-3" />{b.sentCount}</span>
                      <span className="flex items-center gap-0.5"><CheckCheck className="h-3 w-3" />{b.deliveredCount}</span>
                      <span className="flex items-center gap-0.5"><Eye className="h-3 w-3" />{b.readCount}</span>
                      <span className="flex items-center gap-0.5"><MessageSquare className="h-3 w-3" />{b.repliedCount}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDistanceToNow(new Date(b.createdAt), { addSuffix: true, locale: ptBR })}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {b.status === "draft" && (
                        <Button variant="ghost" size="icon" aria-label="Iniciar campanha" disabled={enviando !== null} onClick={() => updateStatus(b.id, "sending")} title="Iniciar envio">
                          <Play className="h-4 w-4 text-green-500" />
                        </Button>
                      )}
                      {b.status === "sending" && (
                        <>
                          {enviando === b.id && progresso && (
                            <span className="mr-2 self-center text-xs tabular-nums text-muted-foreground">
                              {progresso.enviados}/{progresso.total}
                            </span>
                          )}
                          <Button variant="ghost" size="icon" aria-label="Pausar campanha" onClick={() => updateStatus(b.id, "paused")} title="Pausar">
                            <Pause className="h-4 w-4 text-orange-500" />
                          </Button>
                        </>
                      )}
                      {b.status === "paused" && (
                        <Button variant="ghost" size="icon" aria-label="Iniciar campanha" disabled={enviando !== null} onClick={() => updateStatus(b.id, "sending")} title="Retomar">
                          <Play className="h-4 w-4 text-green-500" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" aria-label="Excluir campanha" onClick={() => handleDelete(b.id)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
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
