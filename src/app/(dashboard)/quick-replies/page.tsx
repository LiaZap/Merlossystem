"use client"

import { useEffect, useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Plus, Search, Pencil, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { SkeletonTable } from "@/components/ui/skeleton"

interface QuickReply {
  id: string
  title: string
  content: string
  category: string | null
  shortcut: string | null
  isActive: boolean
}

const replyCategories = [
  { value: "frete", label: "Frete" },
  { value: "medidas", label: "Medidas" },
  { value: "troca", label: "Troca" },
  { value: "pagamento", label: "Pagamento" },
  { value: "rastreio", label: "Rastreio" },
  { value: "geral", label: "Geral" },
]

function QuickReplyForm({
  reply,
  onSave,
  onCancel,
}: {
  reply?: QuickReply
  onSave: () => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState(reply?.title || "")
  const [content, setContent] = useState(reply?.content || "")
  const [category, setCategory] = useState(reply?.category || "")
  const [shortcut, setShortcut] = useState(reply?.shortcut || "")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    const data = {
      title,
      content,
      category: category || null,
      shortcut: shortcut || null,
    }

    const url = reply ? `/api/quick-replies/${reply.id}` : "/api/quick-replies"
    const method = reply ? "PUT" : "POST"

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })

    setLoading(false)

    if (res.ok) {
      toast.success(reply ? "Resposta atualizada" : "Resposta criada")
      onSave()
    } else {
      toast.error("Erro ao salvar")
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Título *</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label>Atalho</Label>
          <Input
            value={shortcut}
            onChange={(e) => setShortcut(e.target.value)}
            placeholder="/frete"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Categoria</Label>
        <Select value={category} onValueChange={(v) => setCategory(v || "")}>
          <SelectTrigger>
            <SelectValue placeholder="Selecione" />
          </SelectTrigger>
          <SelectContent>
            {replyCategories.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Conteúdo *</Label>
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={5}
          required
        />
      </div>
      <div className="flex justify-end gap-2 pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? "Salvando..." : reply ? "Atualizar" : "Criar"}
        </Button>
      </div>
    </form>
  )
}

export default function QuickRepliesPage() {
  const [replies, setReplies] = useState<QuickReply[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingReply, setEditingReply] = useState<QuickReply | undefined>()

  const loadReplies = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (search) params.set("search", search)
    const res = await fetch(`/api/quick-replies?${params}`)
    const data = await res.json()
    setReplies(data)
    setLoading(false)
  }, [search])

  useEffect(() => {
    loadReplies()
  }, [loadReplies])

  async function handleDelete(id: string) {
    if (!confirm("Excluir esta resposta rápida?")) return
    const res = await fetch(`/api/quick-replies/${id}`, { method: "DELETE" })
    if (res.ok) {
      toast.success("Resposta excluída")
      loadReplies()
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Respostas Rápidas</h1>
          <p className="text-muted-foreground">Atalhos para respostas frequentes</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <Button onClick={() => { setEditingReply(undefined); setDialogOpen(true) }}>
              <Plus className="mr-2 h-4 w-4" />
              Nova Resposta
            </Button>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {editingReply ? "Editar Resposta" : "Nova Resposta Rápida"}
              </DialogTitle>
            </DialogHeader>
            <QuickReplyForm
              reply={editingReply}
              onSave={() => { setDialogOpen(false); loadReplies() }}
              onCancel={() => setDialogOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por título, atalho ou conteúdo..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {loading ? (
        <SkeletonTable rows={5} cols={4} />
      ) : (
      <div className="rounded-md border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Título</TableHead>
              <TableHead>Atalho</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead className="max-w-xs">Conteúdo</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {replies.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  Nenhuma resposta rápida encontrada
                </TableCell>
              </TableRow>
            ) : (
              replies.map((reply) => (
                <TableRow key={reply.id} className="hover:bg-neutral-50/80 transition-colors cursor-pointer">
                  <TableCell className="font-medium">{reply.title}</TableCell>
                  <TableCell>
                    {reply.shortcut ? (
                      <code className="bg-neutral-100 px-2 py-0.5 rounded text-sm">
                        {reply.shortcut}
                      </code>
                    ) : "—"}
                  </TableCell>
                  <TableCell>
                    {replyCategories.find((c) => c.value === reply.category)?.label || "—"}
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-muted-foreground">
                    {reply.content}
                  </TableCell>
                  <TableCell>
                    <Badge variant={reply.isActive ? "default" : "secondary"}>
                      {reply.isActive ? "Ativo" : "Inativo"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Editar resposta"
                        onClick={() => { setEditingReply(reply); setDialogOpen(true) }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" aria-label="Excluir resposta" onClick={() => handleDelete(reply.id)}>
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
