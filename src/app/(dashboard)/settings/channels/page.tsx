"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { toast } from "sonner"
import { MessageCircle, Camera, Globe, Video } from "lucide-react"
import { Breadcrumb } from "@/components/ui/breadcrumb"

type ChannelStatus = "connected" | "disconnected" | "coming_soon"

interface ChannelConfig {
  id: string
  name: string
  status: ChannelStatus
  icon: React.ReactNode
  accentColor: string
  accentBg: string
  borderColor: string
  fields: { key: string; label: string; placeholder: string; masked?: boolean }[]
}

function StatusBadge({ status }: { status: ChannelStatus }) {
  if (status === "connected") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
        <span className="size-1.5 rounded-full bg-emerald-500" />
        Conectado
      </span>
    )
  }
  if (status === "disconnected") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700">
        <span className="size-1.5 rounded-full bg-red-500" />
        Desconectado
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-500">
      <span className="size-1.5 rounded-full bg-neutral-400" />
      Em breve
    </span>
  )
}

const CHANNELS: ChannelConfig[] = [
  {
    id: "whatsapp",
    name: "WhatsApp",
    status: "disconnected",
    icon: <MessageCircle className="size-6" />,
    accentColor: "text-green-600",
    accentBg: "bg-green-50",
    borderColor: "border-green-200/60",
    fields: [
      { key: "phoneId", label: "Phone Number ID", placeholder: "Ex: 123456789012345" },
      { key: "accessToken", label: "Access Token", placeholder: "Ex: EAAx...", masked: true },
    ],
  },
  {
    id: "instagram",
    name: "Instagram",
    status: "disconnected",
    icon: <Camera className="size-6" />,
    accentColor: "text-pink-600",
    accentBg: "bg-pink-50",
    borderColor: "border-pink-200/60",
    fields: [
      { key: "accountId", label: "Account ID", placeholder: "Ex: 17841400000000" },
    ],
  },
  {
    id: "facebook",
    name: "Facebook Messenger",
    status: "disconnected",
    icon: <Globe className="size-6" />,
    accentColor: "text-blue-600",
    accentBg: "bg-blue-50",
    borderColor: "border-blue-200/60",
    fields: [
      { key: "pageId", label: "Page ID", placeholder: "Ex: 100000000000000" },
    ],
  },
  {
    id: "tiktok",
    name: "TikTok",
    status: "coming_soon",
    icon: <Video className="size-6" />,
    accentColor: "text-neutral-600",
    accentBg: "bg-neutral-100",
    borderColor: "border-neutral-200/60",
    fields: [],
  },
]

export default function SettingsChannelsPage() {
  const [channelData, setChannelData] = useState<Record<string, Record<string, string>>>({
    whatsapp: { phoneId: "", accessToken: "" },
    instagram: { accountId: "" },
    facebook: { pageId: "" },
    tiktok: {},
  })

  function updateChannelField(channelId: string, fieldKey: string, value: string) {
    setChannelData((prev) => ({
      ...prev,
      [channelId]: { ...prev[channelId], [fieldKey]: value },
    }))
  }

  function handleConnect(channelName: string) {
    toast.success(`Solicitação de conexão enviada para ${channelName}`)
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <Breadcrumb items={[{ label: "Configurações", href: "/settings/general" }, { label: "Canais" }]} className="mb-4" />
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
          Canais de Comunicação
        </h1>
        <p className="text-muted-foreground mt-1">
          Configure e gerencie seus canais de atendimento ao cliente.
        </p>
      </div>

      {/* Channel Cards Grid */}
      <div className="grid gap-4 lg:grid-cols-2">
        {CHANNELS.map((channel) => {
          const isComingSoon = channel.status === "coming_soon"

          return (
            <Card
              key={channel.id}
              className={`rounded-xl shadow-premium transition-all ${
                isComingSoon ? "opacity-60 pointer-events-none" : "hover:shadow-premium-hover"
              }`}
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex size-10 items-center justify-center rounded-lg ${channel.accentBg} ${channel.accentColor}`}
                    >
                      {channel.icon}
                    </div>
                    <div>
                      <CardTitle className="text-base">{channel.name}</CardTitle>
                    </div>
                  </div>
                  <StatusBadge status={channel.status} />
                </div>
              </CardHeader>

              <CardContent>
                {isComingSoon ? (
                  <p className="text-sm text-muted-foreground">
                    Este canal estará disponível em breve. Fique atento para novidades.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {channel.fields.map((field) => (
                      <div key={field.key} className="space-y-2">
                        <Label htmlFor={`${channel.id}-${field.key}`}>
                          {field.label}
                        </Label>
                        <Input
                          id={`${channel.id}-${field.key}`}
                          type={field.masked ? "password" : "text"}
                          value={channelData[channel.id]?.[field.key] ?? ""}
                          onChange={(e) =>
                            updateChannelField(channel.id, field.key, e.target.value)
                          }
                          placeholder={field.placeholder}
                        />
                      </div>
                    ))}

                    <Button
                      onClick={() => handleConnect(channel.name)}
                      className="w-full bg-neutral-900 text-white hover:bg-neutral-800"
                      size="default"
                    >
                      Conectar
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
