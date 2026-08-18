"use client"

import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Breadcrumb } from "@/components/ui/breadcrumb"

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean
  onChange: (val: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
        checked ? "bg-neutral-900" : "bg-neutral-200"
      }`}
    >
      <span
        className={`pointer-events-none block size-5 rounded-full bg-white shadow-sm ring-0 transition-transform ${
          checked ? "translate-x-[22px]" : "translate-x-0.5"
        }`}
      />
    </button>
  )
}

export default function SettingsAutomationsPage() {
  // Auto-assignment
  const [autoAssign, setAutoAssign] = useState(true)
  const [assignMethod, setAssignMethod] = useState("round-robin")

  // After-hours auto-reply
  const [afterHoursEnabled, setAfterHoursEnabled] = useState(true)
  const [afterHoursMessage, setAfterHoursMessage] = useState(
    "Ol\u00e1! Nosso hor\u00e1rio de atendimento \u00e9 de Seg-Sex 9h-18h. Deixe sua mensagem que retornaremos!"
  )

  // First contact auto-reply
  const [welcomeEnabled, setWelcomeEnabled] = useState(true)
  const [welcomeMessage, setWelcomeMessage] = useState(
    "Ol\u00e1! Bem-vindo(a) \u00e0 Merlos Store! \ud83d\udc95 Como posso te ajudar?"
  )

  // Automatic alerts
  const [alertSla, setAlertSla] = useState(true)
  const [alertHotLead, setAlertHotLead] = useState(true)
  const [alertNewContact, setAlertNewContact] = useState(false)
  const [alertReturning, setAlertReturning] = useState(false)

  function handleSave() {
    toast.success("Configura\u00e7\u00f5es de automa\u00e7\u00e3o salvas com sucesso")
  }

  return (
    <div className="space-y-6">
      <div>
        <Breadcrumb items={[{ label: "Configurações", href: "/settings/general" }, { label: "Automações" }]} className="mb-4" />
        <h1 className="text-2xl font-bold">Automa\u00e7\u00f5es</h1>
        <p className="text-muted-foreground mt-1">
          Configure regras autom\u00e1ticas para agilizar o atendimento
        </p>
      </div>

      {/* Auto Assignment */}
      <Card className="rounded-xl">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle>Atribui\u00e7\u00e3o Autom\u00e1tica</CardTitle>
              <CardDescription>
                Distribuir conversas automaticamente entre agentes online
              </CardDescription>
            </div>
            <Toggle checked={autoAssign} onChange={setAutoAssign} />
          </div>
        </CardHeader>
        {autoAssign && (
          <CardContent>
            <div className="space-y-2">
              <Label>M\u00e9todo de distribui\u00e7\u00e3o</Label>
              <Select value={assignMethod} onValueChange={(val) => val && setAssignMethod(val)}>
                <SelectTrigger className="w-full max-w-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="round-robin">Round Robin</SelectItem>
                  <SelectItem value="least-busy">Menos conversas</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        )}
      </Card>

      {/* After Hours Auto Reply */}
      <Card className="rounded-xl">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle>Resposta Autom\u00e1tica (Fora do Hor\u00e1rio)</CardTitle>
              <CardDescription>
                Ativar resposta autom\u00e1tica fora do hor\u00e1rio de atendimento
              </CardDescription>
            </div>
            <Toggle checked={afterHoursEnabled} onChange={setAfterHoursEnabled} />
          </div>
        </CardHeader>
        {afterHoursEnabled && (
          <CardContent>
            <div className="space-y-2">
              <Label>Mensagem</Label>
              <Textarea
                rows={3}
                value={afterHoursMessage}
                onChange={(e) => setAfterHoursMessage(e.target.value)}
              />
            </div>
          </CardContent>
        )}
      </Card>

      {/* First Contact Auto Reply */}
      <Card className="rounded-xl">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle>Resposta Autom\u00e1tica (Primeiro Contato)</CardTitle>
              <CardDescription>
                Enviar mensagem de boas-vindas para novos contatos
              </CardDescription>
            </div>
            <Toggle checked={welcomeEnabled} onChange={setWelcomeEnabled} />
          </div>
        </CardHeader>
        {welcomeEnabled && (
          <CardContent>
            <div className="space-y-2">
              <Label>Mensagem de boas-vindas</Label>
              <Textarea
                rows={3}
                value={welcomeMessage}
                onChange={(e) => setWelcomeMessage(e.target.value)}
              />
            </div>
          </CardContent>
        )}
      </Card>

      {/* Automatic Alerts */}
      <Card className="rounded-xl">
        <CardHeader>
          <CardTitle>Alertas Autom\u00e1ticos</CardTitle>
          <CardDescription>
            Receba notifica\u00e7\u00f5es autom\u00e1ticas para eventos importantes
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="font-normal">SLA estourado</Label>
              <Toggle checked={alertSla} onChange={setAlertSla} />
            </div>
            <div className="flex items-center justify-between">
              <Label className="font-normal">Lead quente detectado</Label>
              <Toggle checked={alertHotLead} onChange={setAlertHotLead} />
            </div>
            <div className="flex items-center justify-between">
              <Label className="font-normal">Novo contato</Label>
              <Toggle checked={alertNewContact} onChange={setAlertNewContact} />
            </div>
            <div className="flex items-center justify-between">
              <Label className="font-normal">Cliente retornando</Label>
              <Toggle checked={alertReturning} onChange={setAlertReturning} />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave}>Salvar Configura\u00e7\u00f5es</Button>
      </div>
    </div>
  )
}
