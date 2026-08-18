"use client"

import { useEffect, useState, useCallback } from "react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { User, Phone, Mail, ShoppingBag, Tag, StickyNote } from "lucide-react"
import { SkeletonContactPanel } from "@/components/ui/skeleton"

interface ContactData {
  id: string
  name: string | null
  phone: string | null
  email: string | null
  avatarUrl: string | null
  preferredSize: string | null
  tags: string[]
  notes: string | null
  totalOrders: number
  totalSpent: number | string
  lastContactAt: string | null
  instagramId: string | null
  facebookId: string | null
  whatsappId: string | null
}

interface ContactPanelProps {
  contactId: string
}

const sizeLabels: Record<string, string> = {
  slim: "Slim",
  plussize: "Plus Size",
  both: "Ambos",
}

export function ContactPanel({ contactId }: ContactPanelProps) {
  const [contact, setContact] = useState<ContactData | null>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/contacts/${contactId}`)
    if (res.ok) setContact(await res.json())
  }, [contactId])

  useEffect(() => {
    load()
  }, [load])

  if (!contact) {
    return (
      <div className="h-full border-l bg-white">
        <SkeletonContactPanel />
      </div>
    )
  }

  const initials = contact.name
    ?.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) || "?"

  return (
    <ScrollArea className="h-full border-l bg-white">
      <div className="p-5 space-y-5">
        {/* Avatar + Name */}
        <div className="text-center">
          <Avatar className="h-16 w-16 mx-auto">
            <AvatarFallback className="text-lg bg-neutral-900 text-white">
              {initials}
            </AvatarFallback>
          </Avatar>
          <h3 className="font-semibold mt-2 text-neutral-900">{contact.name || "Sem nome"}</h3>
          {contact.preferredSize && (
            <Badge variant="outline" className="mt-1 rounded-md text-[11px] border-neutral-200 text-neutral-600">
              {sizeLabels[contact.preferredSize] || contact.preferredSize}
            </Badge>
          )}
        </div>

        <Separator className="bg-neutral-100" />

        {/* Contact Info */}
        <div className="space-y-2.5">
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Contato</h4>
          {contact.phone && (
            <div className="flex items-center gap-2 text-sm text-neutral-700">
              <Phone className="h-3.5 w-3.5 text-neutral-400" />
              {contact.phone}
            </div>
          )}
          {contact.email && (
            <div className="flex items-center gap-2 text-sm text-neutral-700">
              <Mail className="h-3.5 w-3.5 text-neutral-400" />
              {contact.email}
            </div>
          )}
          {contact.whatsappId && (
            <div className="flex items-center gap-2 text-sm text-neutral-700">
              <User className="h-3.5 w-3.5 text-neutral-400" />
              <span className="text-neutral-400">WA:</span> {contact.whatsappId}
            </div>
          )}
          {contact.instagramId && (
            <div className="flex items-center gap-2 text-sm text-neutral-700">
              <User className="h-3.5 w-3.5 text-neutral-400" />
              <span className="text-neutral-400">IG:</span> {contact.instagramId}
            </div>
          )}
        </div>

        <Separator className="bg-neutral-100" />

        {/* Stats */}
        <div className="space-y-2.5">
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Resumo</h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-neutral-50/80 rounded-xl border border-neutral-100 p-3 text-center">
              <div className="flex items-center justify-center gap-1 text-neutral-400 mb-1">
                <ShoppingBag className="h-3.5 w-3.5" />
              </div>
              <p className="text-lg font-bold text-neutral-900">{contact.totalOrders}</p>
              <p className="text-[10px] text-neutral-500">Pedidos</p>
            </div>
            <div className="bg-neutral-50/80 rounded-xl border border-neutral-100 p-3 text-center">
              <p className="text-lg font-bold text-neutral-900">
                R$ {Number(contact.totalSpent).toFixed(0)}
              </p>
              <p className="text-[10px] text-neutral-500">Total gasto</p>
            </div>
          </div>
        </div>

        <Separator className="bg-neutral-100" />

        {/* Tags */}
        <div className="space-y-2.5">
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 flex items-center gap-1">
            <Tag className="h-3 w-3" /> Tags
          </h4>
          {contact.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {contact.tags.map((tag) => (
                <span key={tag} className="bg-neutral-100 text-neutral-700 rounded-md text-[11px] px-2 py-0.5 font-medium">
                  {tag}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-neutral-400">Sem tags</p>
          )}
        </div>

        {/* Notes */}
        {contact.notes && (
          <>
            <Separator className="bg-neutral-100" />
            <div className="space-y-2.5">
              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 flex items-center gap-1">
                <StickyNote className="h-3 w-3" /> Notas
              </h4>
              <div className="bg-amber-50/50 border border-amber-100/60 rounded-xl p-3">
                <p className="text-sm text-neutral-600 whitespace-pre-wrap">
                  {contact.notes}
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </ScrollArea>
  )
}
