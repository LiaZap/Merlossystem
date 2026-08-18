"use client"

import { useEffect, useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Plus, Pencil, Trash2, Send } from "lucide-react"
import { toast } from "sonner"
import { SkeletonTable } from "@/components/ui/skeleton"

interface Template {
  id: string
  name: string
  category: string
  language: string
  body: string
  footer: string | null
  status: string
  createdAt: string
}

const categories = [
  { value: "marketing", label: "Marketing" },
  { value: "utility", label: "Utilidade" },
  { value: "authentication", label: "Autenticação" },
]

const statusColors: Record<string, string> = {
  draft: "bg-neutral-100 text-neutral-700",
  pending: "bg-yellow-100 text-yellow-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
}

function TemplateForm({
  template,
  onSave,
  onCancel,
}: {
  template?: Template
  onSave: () => void
  onCancel: () => void
}) {
  const [name, setName] = useState(template?.name || "")
  const [category, setCategory] = useState(template?.category || "utility")
  const [body, setBody] = useState(template?.body || "")
  const [footer, setFooter] = useState(template?.footer || "")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    const data = {
      name,
      category,
      body,
      footer: footer || null,
    }

    const url = template ? `/api/templates/${template.id}` : "/api/templates"
    const method = template ? "PUT" : "POST"

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })

    setLoading(false)
    if (res.ok) {
      toast.success(template ? "Template atualizado" : "Template criado")
      onSave()
    } else {
      toast.error("Erro ao salvar template")
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Nome *</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="welcome_message" />
        </div>
        <div className="space-y-2">
          <Label>Categoria</Label>
          <Select value={category} onValueChange={(v) => setCategory(v || "utility")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label>Corpo da mensagem * <span className="text-muted-foreground text-xs">(use {"{{1}}"}, {"{{2}}"} para variáveis)</span></Label>
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} required placeholder="Olá {{1}}! Sua compra #{{2}} foi confirmada!" />
      </div>
      <div className="space-y-2">
        <Label>Rodapé (opcional)</Label>
        <Input value={footer} onChange={(e) => setFooter(e.target.value)} placeholder="Merlos Store - Moda Feminina" />
      </div>
      {/* Preview */}
      <div className="bg-green-50 border border-green-200 rounded-lg p-3">
        <p className="text-[10px] font-medium text-green-700 mb-1">Preview:</p>
        <p className="text-sm whitespace-pre-wrap">{body || "(corpo vazio)"}</p>
        {footer && <p className="text-xs text-muted-foreground mt-2">{footer}</p>}
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" disabled={loading}>{loading ? "Salvando..." : "Salvar"}</Button>
      </div>
    </form>
  )
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Template | undefined>()

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch("/api/templates")
    if (res.ok) setTemplates(await res.json())
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function handleDelete(id: string) {
    if (!confirm("Excluir este template?")) return
    await fetch(`/api/templates/${id}`, { method: "DELETE" })
    toast.success("Template excluído")
    load()
  }

  async function handleSubmitToMeta(id: string) {
    await fetch(`/api/templates/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "pending" }),
    })
    toast.success("Template enviado para aprovação")
    load()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Templates WhatsApp</h1>
          <p className="text-muted-foreground">Modelos de mensagem para envio proativo</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <Button onClick={() => { setEditing(undefined); setDialogOpen(true) }}>
              <Plus className="mr-2 h-4 w-4" /> Novo Template
            </Button>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>{editing ? "Editar Template" : "Novo Template"}</DialogTitle></DialogHeader>
            <TemplateForm
              template={editing}
              onSave={() => { setDialogOpen(false); load() }}
              onCancel={() => setDialogOpen(false)}
            />
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
              <TableHead>Categoria</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="max-w-xs">Corpo</TableHead>
              <TableHead className="w-32">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {templates.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  Nenhum template criado
                </TableCell>
              </TableRow>
            ) : (
              templates.map((t) => (
                <TableRow key={t.id} className="hover:bg-neutral-50/80 transition-colors cursor-pointer">
                  <TableCell className="font-mono text-sm">{t.name}</TableCell>
                  <TableCell>{categories.find((c) => c.value === t.category)?.label}</TableCell>
                  <TableCell>
                    <Badge className={statusColors[t.status] || ""}>{t.status}</Badge>
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-sm text-muted-foreground">{t.body}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {t.status === "draft" && (
                        <Button variant="ghost" size="icon" aria-label="Enviar para aprovação" onClick={() => handleSubmitToMeta(t.id)} title="Enviar para aprovação">
                          <Send className="h-4 w-4 text-blue-500" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" aria-label="Editar template" onClick={() => { setEditing(t); setDialogOpen(true) }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" aria-label="Excluir template" onClick={() => handleDelete(t.id)}>
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
