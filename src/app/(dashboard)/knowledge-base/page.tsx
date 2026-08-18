"use client"

import { useEffect, useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Plus, Search, Pencil, Trash2, BookOpen } from "lucide-react"
import { toast } from "sonner"

interface Article {
  id: string
  title: string
  content: string
  category: string | null
  tags: string[]
  isPublic: boolean
  author: { id: string; name: string } | null
  updatedAt: string
}

const articleCategories = [
  { value: "medidas", label: "Medidas" },
  { value: "frete", label: "Frete" },
  { value: "troca", label: "Troca" },
  { value: "pagamento", label: "Pagamento" },
  { value: "tecidos", label: "Tecidos" },
  { value: "combinacoes", label: "Combinações" },
  { value: "procedimentos", label: "Procedimentos" },
]

function ArticleForm({
  article,
  onSave,
  onCancel,
}: {
  article?: Article
  onSave: () => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState(article?.title || "")
  const [content, setContent] = useState(article?.content || "")
  const [category, setCategory] = useState(article?.category || "")
  const [tagsStr, setTagsStr] = useState(article?.tags?.join(", ") || "")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    const data = {
      title,
      content,
      category: category || null,
      tags: tagsStr ? tagsStr.split(",").map((t) => t.trim()).filter(Boolean) : [],
    }

    const url = article ? `/api/knowledge/${article.id}` : "/api/knowledge"
    const method = article ? "PUT" : "POST"

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })

    setLoading(false)
    if (res.ok) {
      toast.success(article ? "Artigo atualizado" : "Artigo criado")
      onSave()
    } else {
      toast.error("Erro ao salvar")
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Título *</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Categoria</Label>
          <Select value={category} onValueChange={(v) => setCategory(v || "")}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              {articleCategories.map((c) => (
                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Tags</Label>
          <Input value={tagsStr} onChange={(e) => setTagsStr(e.target.value)} placeholder="slim, plussize" />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Conteúdo * (Markdown)</Label>
        <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={10} required />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" disabled={loading}>{loading ? "Salvando..." : "Salvar"}</Button>
      </div>
    </form>
  )
}

export default function KnowledgeBasePage() {
  const [articles, setArticles] = useState<Article[]>([])
  const [search, setSearch] = useState("")
  const [catFilter, setCatFilter] = useState("all")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Article | undefined>()

  const load = useCallback(async () => {
    const params = new URLSearchParams()
    if (search) params.set("search", search)
    if (catFilter !== "all") params.set("category", catFilter)
    const res = await fetch(`/api/knowledge?${params}`)
    if (res.ok) setArticles(await res.json())
  }, [search, catFilter])

  useEffect(() => { load() }, [load])

  async function handleDelete(id: string) {
    if (!confirm("Excluir este artigo?")) return
    await fetch(`/api/knowledge/${id}`, { method: "DELETE" })
    toast.success("Artigo excluído")
    load()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Base de Conhecimento</h1>
          <p className="text-muted-foreground">Artigos e guias para a equipe</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <Button onClick={() => { setEditing(undefined); setDialogOpen(true) }}>
              <Plus className="mr-2 h-4 w-4" /> Novo Artigo
            </Button>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>{editing ? "Editar Artigo" : "Novo Artigo"}</DialogTitle></DialogHeader>
            <ArticleForm
              article={editing}
              onSave={() => { setDialogOpen(false); load() }}
              onCancel={() => setDialogOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar artigos..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={catFilter} onValueChange={(v) => setCatFilter(v || "all")}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Categoria" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {articleCategories.map((c) => (
              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {articles.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground border rounded-lg bg-white">
          <BookOpen className="mx-auto h-12 w-12 mb-3 opacity-30" />
          <p>Nenhum artigo encontrado</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {articles.map((a) => (
            <div key={a.id} className="bg-white border rounded-lg p-4 space-y-2">
              <div className="flex items-start justify-between">
                <h3 className="font-semibold">{a.title}</h3>
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditing(a); setDialogOpen(true) }}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(a.id)}>
                    <Trash2 className="h-3 w-3 text-red-500" />
                  </Button>
                </div>
              </div>
              {a.category && (
                <Badge variant="outline">{articleCategories.find((c) => c.value === a.category)?.label || a.category}</Badge>
              )}
              <p className="text-sm text-muted-foreground line-clamp-3">{a.content}</p>
              {a.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {a.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-[10px]">{tag}</Badge>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
