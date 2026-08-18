"use client"

import { useEffect, useState, useCallback } from "react"
import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Bell, CheckCircle, AlertTriangle, Clock, Flame, ShoppingBag, UserPlus, RefreshCcw, CreditCard, Calendar } from "lucide-react"
import { toast } from "sonner"

interface Alert {
  id: string
  type: string
  severity: string
  message: string
  acknowledgedAt: string | null
  createdAt: string
  contact: { id: string; name: string | null; phone: string | null } | null
  conversation: { id: string; channel: string } | null
  order: { id: string; orderNumber: string } | null
}

const typeIcons: Record<string, React.ReactNode> = {
  sla_breach: <Clock className="h-4 w-4" />,
  review_risk: <AlertTriangle className="h-4 w-4" />,
  hot_lead: <Flame className="h-4 w-4" />,
  deal_stale: <ShoppingBag className="h-4 w-4" />,
  low_stock: <ShoppingBag className="h-4 w-4" />,
  first_contact: <UserPlus className="h-4 w-4" />,
  returning_customer: <RefreshCcw className="h-4 w-4" />,
  payment_pending: <CreditCard className="h-4 w-4" />,
  follow_up_due: <Calendar className="h-4 w-4" />,
}

const typeLabels: Record<string, string> = {
  sla_breach: "SLA Estourado",
  review_risk: "Risco de Avaliação",
  hot_lead: "Lead Quente",
  deal_stale: "Deal Parado",
  low_stock: "Estoque Baixo",
  first_contact: "Primeiro Contato",
  returning_customer: "Cliente Retornando",
  payment_pending: "Pix Pendente",
  follow_up_due: "Follow-up Atrasado",
}

const severityColors: Record<string, string> = {
  critical: "bg-red-100 text-red-700 border-red-200",
  high: "bg-orange-100 text-orange-700 border-orange-200",
  medium: "bg-yellow-100 text-yellow-700 border-yellow-200",
  low: "bg-blue-100 text-blue-700 border-blue-200",
}

const severityLabels: Record<string, string> = {
  critical: "Crítico",
  high: "Alto",
  medium: "Médio",
  low: "Baixo",
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [total, setTotal] = useState(0)
  const [unacknowledgedCount, setUnacknowledgedCount] = useState(0)
  const [typeFilter, setTypeFilter] = useState("all")
  const [severityFilter, setSeverityFilter] = useState("all")
  const [ackFilter, setAckFilter] = useState("false")

  const load = useCallback(async () => {
    const params = new URLSearchParams()
    if (typeFilter !== "all") params.set("type", typeFilter)
    if (severityFilter !== "all") params.set("severity", severityFilter)
    if (ackFilter !== "all") params.set("acknowledged", ackFilter)

    const res = await fetch(`/api/alerts?${params}`)
    if (res.ok) {
      const data = await res.json()
      setAlerts(data.alerts)
      setTotal(data.total)
      setUnacknowledgedCount(data.unacknowledgedCount)
    }
  }, [typeFilter, severityFilter, ackFilter])

  useEffect(() => { load() }, [load])

  // Poll every 30s
  useEffect(() => {
    const interval = setInterval(load, 30000)
    return () => clearInterval(interval)
  }, [load])

  async function handleAcknowledge(id: string) {
    // Quem reconheceu sai da sessao, no servidor.
    await fetch(`/api/alerts/${id}`, { method: "PUT" })
    toast.success("Alerta reconhecido")
    load()
  }

  async function handleCheckNow() {
    const res = await fetch("/api/alerts/check", { method: "POST" })
    if (res.ok) {
      const data = await res.json()
      toast.success(`${data.created} novo(s) alerta(s) gerado(s)`)
      load()
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Central de Alertas</h1>
          <p className="text-muted-foreground">
            {unacknowledgedCount} alerta(s) pendente(s) de {total} total
          </p>
        </div>
        <Button onClick={handleCheckNow} variant="outline">
          <RefreshCcw className="mr-2 h-4 w-4" />
          Verificar Agora
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v || "all")}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            {Object.entries(typeLabels).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={severityFilter} onValueChange={(v) => setSeverityFilter(v || "all")}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Severidade" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="critical">Crítico</SelectItem>
            <SelectItem value="high">Alto</SelectItem>
            <SelectItem value="medium">Médio</SelectItem>
            <SelectItem value="low">Baixo</SelectItem>
          </SelectContent>
        </Select>
        <Select value={ackFilter} onValueChange={(v) => setAckFilter(v || "all")}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="false">Pendentes</SelectItem>
            <SelectItem value="true">Reconhecidos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Alert List */}
      <div className="space-y-2">
        {alerts.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground border rounded-lg bg-white">
            <Bell className="mx-auto h-12 w-12 mb-3 opacity-30" />
            <p>Nenhum alerta encontrado</p>
          </div>
        ) : (
          alerts.map((alert) => (
            <div
              key={alert.id}
              className={`flex items-start gap-4 rounded-lg border p-4 bg-white ${
                !alert.acknowledgedAt ? "border-l-4" : ""
              } ${
                !alert.acknowledgedAt
                  ? alert.severity === "critical"
                    ? "border-l-red-500"
                    : alert.severity === "high"
                      ? "border-l-orange-500"
                      : "border-l-yellow-500"
                  : ""
              }`}
            >
              <div className="shrink-0 mt-0.5">
                {typeIcons[alert.type] || <Bell className="h-4 w-4" />}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="text-[10px]">
                    {typeLabels[alert.type] || alert.type}
                  </Badge>
                  <Badge variant="outline" className={`text-[10px] ${severityColors[alert.severity] || ""}`}>
                    {severityLabels[alert.severity] || alert.severity}
                  </Badge>
                  {alert.conversation && (
                    <Badge variant="secondary" className="text-[10px]">
                      {alert.conversation.channel}
                    </Badge>
                  )}
                </div>
                <p className="text-sm">{alert.message}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {formatDistanceToNow(new Date(alert.createdAt), { addSuffix: true, locale: ptBR })}
                </p>
              </div>

              {!alert.acknowledgedAt && (
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => handleAcknowledge(alert.id)}
                >
                  <CheckCircle className="mr-1 h-3 w-3" />
                  OK
                </Button>
              )}

              {alert.acknowledgedAt && (
                <span className="text-xs text-green-600 shrink-0">Resolvido</span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
