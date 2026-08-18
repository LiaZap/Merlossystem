"use client"

import { useEffect, useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Plus, Pencil, Trash2, Image as ImageIcon } from "lucide-react"
import { toast } from "sonner"

interface Lookbook {
  id: string
  name: string
  description: string | null
  mediaIds: string[]
  productIds: string[]
  active: boolean
  createdAt: string
}

function LookbookForm({
  lookbook,
  onSave,
  onCancel,
}: {
  lookbook?: Lookbook
  onSave: () => void
  onCancel: () => void
}) {
  const [name, setName] = useState(lookbook?.name || "")
  const [description, setDescription] = useState(lookbook?.description || "")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    const data = { name, description: description || null }
    const url = lookbook ? `/api/lookbooks/${lookbook.id}` : "/api/lookbooks"
    const method = lookbook ? "PUT" : "POST"

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })

    setLoading(false)
    if (res.ok) {
      toast.success(lookbook ? "Lookbook atualizado" : "Lookbook criado")
      onSave()
    } else {
      toast.error("Erro ao salvar")
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Nome *</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Coleção Verão 2026" />
      </div>
      <div className="space-y-2">
        <Label>Descrição</Label>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" disabled={loading}>
          {loading ? "Salvando..." : lookbook ? "Atualizar" : "Criar"}
        </Button>
      </div>
    </form>
  )
}

export default function LookbooksPage() {
  const [lookbooks, setLookbooks] = useState<Lookbook[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Lookbook | undefined>()

  const load = useCallback(async () => {
    const res = await fetch("/api/lookbooks")
    const data = await res.json()
    setLookbooks(data)
  }, [])

  useEffect(() => { load() }, [load])

  async function handleDelete(id: string) {
    if (!confirm("Excluir este lookbook?")) return
    const res = await fetch(`/api/lookbooks/${id}`, { method: "DELETE" })
    if (res.ok) { toast.success("Lookbook excluído"); load() }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Lookbooks</h1>
          <p className="text-muted-foreground">Coleções de fotos organizadas</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <Button onClick={() => { setEditing(undefined); setDialogOpen(true) }}>
              <Plus className="mr-2 h-4 w-4" /> Novo Lookbook
            </Button>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Editar Lookbook" : "Novo Lookbook"}</DialogTitle>
            </DialogHeader>
            <LookbookForm
              lookbook={editing}
              onSave={() => { setDialogOpen(false); load() }}
              onCancel={() => setDialogOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </div>

      {lookbooks.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground border rounded-lg">
          <ImageIcon className="mx-auto h-12 w-12 mb-3 opacity-30" />
          <p>Nenhum lookbook criado</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {lookbooks.map((lb) => (
            <div key={lb.id} className="bg-white rounded-lg border p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold">{lb.name}</h3>
                  {lb.description && (
                    <p className="text-sm text-muted-foreground mt-1">{lb.description}</p>
                  )}
                </div>
                <Badge variant={lb.active ? "default" : "secondary"}>
                  {lb.active ? "Ativo" : "Inativo"}
                </Badge>
              </div>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span>{lb.mediaIds.length} mídias</span>
                <span>{lb.productIds.length} produtos</span>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => { setEditing(lb); setDialogOpen(true) }}>
                  <Pencil className="h-3 w-3 mr-1" /> Editar
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleDelete(lb.id)}>
                  <Trash2 className="h-3 w-3 mr-1 text-red-500" /> Excluir
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
