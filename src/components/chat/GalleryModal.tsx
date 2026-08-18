"use client"

import { useEffect, useState, useCallback } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Search, Image as ImageIcon, Video, Music, FileText, Check } from "lucide-react"

interface MediaFile {
  id: string
  originalName: string | null
  fileUrl: string
  thumbnailUrl: string | null
  fileType: string
  fileSize: number | null
  tags: string[]
}

interface GalleryModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSend: (mediaFileIds: string[], caption?: string) => void
}

function FileTypeIcon({ type }: { type: string }) {
  switch (type) {
    case "image": return <ImageIcon className="h-5 w-5" />
    case "video": return <Video className="h-5 w-5" />
    case "audio": return <Music className="h-5 w-5" />
    default: return <FileText className="h-5 w-5" />
  }
}

export function GalleryModal({ open, onOpenChange, onSend }: GalleryModalProps) {
  const [files, setFiles] = useState<MediaFile[]>([])
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState("all")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [caption, setCaption] = useState("")

  const loadFiles = useCallback(async () => {
    const params = new URLSearchParams()
    if (search) params.set("search", search)
    if (filter !== "all") params.set("folder", filter)
    params.set("limit", "30")

    const res = await fetch(`/api/media/gallery?${params}`)
    const data = await res.json()
    setFiles(data.files)
  }, [search, filter])

  useEffect(() => {
    if (open) {
      loadFiles()
      setSelected(new Set())
      setCaption("")
    }
  }, [open, loadFiles])

  function toggleSelect(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  function handleSend() {
    onSend(Array.from(selected), caption || undefined)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Galeria Merlos Store</DialogTitle>
        </DialogHeader>

        {/* Search + Filters */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex gap-1">
            {["all", "produtos", "lookbooks", "general"].map((f) => (
              <Button
                key={f}
                variant={filter === f ? "default" : "outline"}
                size="sm"
                onClick={() => setFilter(f)}
              >
                {f === "all" ? "Todos" : f.charAt(0).toUpperCase() + f.slice(1)}
              </Button>
            ))}
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto">
          {files.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              Nenhum arquivo encontrado
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-3 p-1">
              {files.map((file) => {
                const isSelected = selected.has(file.id)
                return (
                  <div
                    key={file.id}
                    className={`relative rounded-lg border-2 overflow-hidden cursor-pointer transition-all ${
                      isSelected
                        ? "border-neutral-900 ring-2 ring-neutral-300"
                        : "border-transparent hover:border-neutral-300"
                    }`}
                    onClick={() => toggleSelect(file.id)}
                  >
                    <div className="aspect-square bg-neutral-100 flex items-center justify-center">
                      {file.fileType === "image" ? (
                        <img
                          src={file.thumbnailUrl || file.fileUrl}
                          alt={file.originalName || ""}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <FileTypeIcon type={file.fileType} />
                      )}
                    </div>
                    <p className="text-xs truncate px-1 py-0.5">
                      {file.originalName || "Sem nome"}
                    </p>

                    {isSelected && (
                      <div className="absolute top-1 right-1 h-5 w-5 bg-neutral-900 rounded-full flex items-center justify-center">
                        <Check className="h-3 w-3 text-white" />
                      </div>
                    )}

                    <div className="absolute top-1 left-1">
                      <Badge variant="secondary" className="text-[9px] px-1 py-0 bg-black/50 text-white border-0">
                        {file.fileType}
                      </Badge>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {selected.size > 0 && (
          <div className="border-t pt-3 space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium">{selected.size} selecionado(s)</span>
            </div>
            <Textarea
              placeholder="Adicionar legenda (opcional)..."
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={2}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSend}>
                Enviar {selected.size} arquivo(s)
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
