"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { InfoIcon } from "lucide-react"
import { Breadcrumb } from "@/components/ui/breadcrumb"

export default function SettingsLgpdPage() {
  // Consentimento
  const [requestConsent, setRequestConsent] = useState(true)
  const [consentMessage, setConsentMessage] = useState(
    "Para melhor atendê-lo(a), armazenamos seu nome e histórico de conversas. Você concorda?"
  )

  // Retenção de Dados
  const [retentionPeriod, setRetentionPeriod] = useState("1ano")
  const [autoDelete, setAutoDelete] = useState(false)

  // Direitos do Titular
  const [allowDeletionRequest, setAllowDeletionRequest] = useState(true)
  const [allowExportRequest, setAllowExportRequest] = useState(true)

  // Opt-Out
  const [respectOptOut, setRespectOptOut] = useState(true)
  const [optOutMessage, setOptOutMessage] = useState(
    "Você foi removido(a) da nossa lista de comunicação. Para voltar a receber, envie /optin"
  )

  function handleSave() {
    toast.success("Configurações de LGPD atualizadas")
  }

  return (
    <div className="space-y-6">
      <div>
        <Breadcrumb items={[{ label: "Configurações", href: "/settings" }, { label: "LGPD" }]} className="mb-4" />
        <h1 className="text-2xl font-bold">LGPD — Privacidade e Dados</h1>
        <p className="text-muted-foreground mt-1">
          Gerencie consentimento, retenção e direitos dos titulares de dados.
        </p>
      </div>

      {/* Consentimento */}
      <Card className="rounded-xl">
        <CardHeader>
          <CardTitle>Consentimento</CardTitle>
          <CardDescription>
            Configure a coleta de consentimento dos clientes antes de armazenar dados pessoais.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="request-consent" className="flex-1 cursor-pointer">
              Solicitar consentimento antes de armazenar dados
            </Label>
            <Switch
              id="request-consent"
              checked={requestConsent}
              onCheckedChange={(checked) => setRequestConsent(checked)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="consent-message">Mensagem de consentimento</Label>
            <Textarea
              id="consent-message"
              rows={3}
              value={consentMessage}
              onChange={(e) => setConsentMessage(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Retenção de Dados */}
      <Card className="rounded-xl">
        <CardHeader>
          <CardTitle>Retenção de Dados</CardTitle>
          <CardDescription>
            Defina por quanto tempo os dados dos clientes serão mantidos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="retention-period" className="min-w-[160px]">
              Período de retenção
            </Label>
            <Select value={retentionPeriod} onValueChange={(v) => v && setRetentionPeriod(v)}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="6meses">6 meses</SelectItem>
                <SelectItem value="1ano">1 ano</SelectItem>
                <SelectItem value="2anos">2 anos</SelectItem>
                <SelectItem value="indefinido">Indefinido</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="auto-delete" className="flex-1 cursor-pointer">
              Excluir dados automaticamente após período
            </Label>
            <Switch
              id="auto-delete"
              checked={autoDelete}
              onCheckedChange={(checked) => setAutoDelete(checked)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Direitos do Titular */}
      <Card className="rounded-xl">
        <CardHeader>
          <CardTitle>Direitos do Titular</CardTitle>
          <CardDescription>
            Permita que seus clientes exerçam seus direitos previstos na LGPD.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="allow-deletion" className="flex-1 cursor-pointer">
              Permitir que clientes solicitem exclusão de dados via chat
            </Label>
            <Switch
              id="allow-deletion"
              checked={allowDeletionRequest}
              onCheckedChange={(checked) => setAllowDeletionRequest(checked)}
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="allow-export" className="flex-1 cursor-pointer">
              Permitir que clientes solicitem exportação de dados
            </Label>
            <Switch
              id="allow-export"
              checked={allowExportRequest}
              onCheckedChange={(checked) => setAllowExportRequest(checked)}
            />
          </div>

          <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground">
            <InfoIcon className="size-4 shrink-0" />
            <span>
              Comandos disponíveis: <code className="font-mono text-foreground">/meus-dados</code>,{" "}
              <code className="font-mono text-foreground">/excluir-dados</code>
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Opt-Out */}
      <Card className="rounded-xl">
        <CardHeader>
          <CardTitle>Opt-Out</CardTitle>
          <CardDescription>
            Configure como os clientes podem cancelar o recebimento de comunicações.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="respect-optout" className="flex-1 cursor-pointer">
              Respeitar opt-out de marketing
            </Label>
            <Switch
              id="respect-optout"
              checked={respectOptOut}
              onCheckedChange={(checked) => setRespectOptOut(checked)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="optout-message">Mensagem de opt-out</Label>
            <Textarea
              id="optout-message"
              rows={3}
              value={optOutMessage}
              onChange={(e) => setOptOutMessage(e.target.value)}
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
