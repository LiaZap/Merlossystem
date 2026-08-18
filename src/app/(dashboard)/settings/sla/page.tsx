"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Breadcrumb } from "@/components/ui/breadcrumb"

const channelDefaults = [
  { key: "whatsapp", label: "WhatsApp", value: 5 },
  { key: "instagram", label: "Instagram", value: 15 },
  { key: "facebook", label: "Facebook", value: 30 },
  { key: "tiktok", label: "TikTok", value: 60 },
]

const priorityDefaults = [
  { key: "urgent", label: "Urgente", value: 2 },
  { key: "high", label: "Alta", value: 5 },
  { key: "medium", label: "Média", value: 15 },
  { key: "low", label: "Baixa", value: 60 },
]

export default function SettingsSlaPage() {
  const [channelTimes, setChannelTimes] = useState<Record<string, number>>(
    Object.fromEntries(channelDefaults.map((c) => [c.key, c.value]))
  )
  const [priorityTimes, setPriorityTimes] = useState<Record<string, number>>(
    Object.fromEntries(priorityDefaults.map((p) => [p.key, p.value]))
  )
  const [notifyAgentNearBreach, setNotifyAgentNearBreach] = useState(true)
  const [notifyMinutesBefore, setNotifyMinutesBefore] = useState(2)
  const [notifyAdminOnBreach, setNotifyAdminOnBreach] = useState(true)

  function handleSave() {
    toast.success("SLA atualizado")
  }

  return (
    <div className="space-y-6">
      <div>
        <Breadcrumb items={[{ label: "Configurações", href: "/settings/general" }, { label: "SLA" }]} className="mb-4" />
        <h1 className="text-2xl font-bold">SLA — Acordo de Nível de Serviço</h1>
        <p className="text-muted-foreground mt-1">
          Configure os tempos máximos de resposta por canal e prioridade.
        </p>
      </div>

      {/* Tempos de Primeira Resposta */}
      <Card className="rounded-xl">
        <CardHeader>
          <CardTitle>Tempos de Primeira Resposta</CardTitle>
          <CardDescription>
            Tempo máximo (em minutos) para a primeira resposta em cada canal.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            {channelDefaults.map((channel) => (
              <div key={channel.key} className="flex items-center justify-between gap-4">
                <Label htmlFor={`channel-${channel.key}`} className="min-w-[100px]">
                  {channel.label}
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id={`channel-${channel.key}`}
                    type="number"
                    min={1}
                    className="w-24 text-right"
                    value={channelTimes[channel.key]}
                    onChange={(e) =>
                      setChannelTimes((prev) => ({
                        ...prev,
                        [channel.key]: Number(e.target.value),
                      }))
                    }
                  />
                  <span className="text-sm text-muted-foreground">min</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Tempos por Prioridade */}
      <Card className="rounded-xl">
        <CardHeader>
          <CardTitle>Tempos por Prioridade</CardTitle>
          <CardDescription>
            Tempo máximo (em minutos) de resposta de acordo com a prioridade da conversa.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            {priorityDefaults.map((priority) => (
              <div key={priority.key} className="flex items-center justify-between gap-4">
                <Label htmlFor={`priority-${priority.key}`} className="min-w-[100px]">
                  {priority.label}
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id={`priority-${priority.key}`}
                    type="number"
                    min={1}
                    className="w-24 text-right"
                    value={priorityTimes[priority.key]}
                    onChange={(e) =>
                      setPriorityTimes((prev) => ({
                        ...prev,
                        [priority.key]: Number(e.target.value),
                      }))
                    }
                  />
                  <span className="text-sm text-muted-foreground">min</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Notificações de SLA */}
      <Card className="rounded-xl">
        <CardHeader>
          <CardTitle>Notificações de SLA</CardTitle>
          <CardDescription>
            Configure alertas para quando os prazos de SLA estiverem próximos de estourar.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="notify-agent" className="flex-1 cursor-pointer">
              Notificar agente quando SLA estiver próximo de estourar
            </Label>
            <Switch
              id="notify-agent"
              checked={notifyAgentNearBreach}
              onCheckedChange={(checked) => setNotifyAgentNearBreach(checked)}
            />
          </div>

          <div className="flex items-center gap-4">
            <Label htmlFor="notify-minutes" className="flex-1">
              Notificar X minutos antes
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="notify-minutes"
                type="number"
                min={1}
                className="w-24 text-right"
                value={notifyMinutesBefore}
                onChange={(e) => setNotifyMinutesBefore(Number(e.target.value))}
              />
              <span className="text-sm text-muted-foreground">min</span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="notify-admin" className="flex-1 cursor-pointer">
              Notificar admin quando SLA estourar
            </Label>
            <Switch
              id="notify-admin"
              checked={notifyAdminOnBreach}
              onCheckedChange={(checked) => setNotifyAdminOnBreach(checked)}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave}>Salvar alterações</Button>
      </div>
    </div>
  )
}
