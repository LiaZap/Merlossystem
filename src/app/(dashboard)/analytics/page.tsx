"use client"

import { useEffect, useState, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { MessageSquare, Users, DollarSign, TrendingUp, Inbox, ShoppingBag, Target, Clock } from "lucide-react"
import { Skeleton, SkeletonKpiGrid } from "@/components/ui/skeleton"
import {
  AreaChart, Area, PieChart, Pie, Cell, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts"

interface KPIs {
  openConversations: number
  totalConversations: number
  totalMessages: number
  totalContacts: number
  pipelineValue: number
  wonDeals: number
  revenue: number
  conversionRate: string
}

interface Charts {
  channelData: { name: string; value: number }[]
  volumeData: { date: string; incoming: number; outgoing: number }[]
  pipelineByStage: { stage: string; count: number; value: number }[]
  slaData: { channel: string; avgMinutes: number }[]
}

const CHANNEL_COLORS: Record<string, string> = {
  whatsapp: "#25D366",
  instagram: "#E4405F",
  facebook: "#1877F2",
  tiktok: "#000000",
}

const STAGE_LABELS: Record<string, string> = {
  lead: "Lead",
  interested: "Interessada",
  negotiating: "Negociando",
  closing: "Fechando",
}

function KpiCard({ title, value, icon, subtitle }: {
  title: string; value: string | number; icon: React.ReactNode; subtitle?: string
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
          <div className="h-10 w-10 rounded-lg bg-neutral-100 flex items-center justify-center text-neutral-600">
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default function AnalyticsPage() {
  const [kpis, setKpis] = useState<KPIs | null>(null)
  const [charts, setCharts] = useState<Charts | null>(null)
  const [period, setPeriod] = useState("7")

  const load = useCallback(async () => {
    const res = await fetch(`/api/analytics?days=${period}`)
    if (res.ok) {
      const data = await res.json()
      setKpis(data.kpis)
      setCharts(data.charts)
    }
  }, [period])

  useEffect(() => { load() }, [load])

  if (!kpis || !charts) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-4 w-64 mt-2" />
          </div>
          <Skeleton className="h-9 w-36 rounded-md" />
        </div>
        <SkeletonKpiGrid />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Skeleton className="h-64 w-full rounded-xl lg:col-span-2" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="text-muted-foreground">Métricas e relatórios da Merlos Store</p>
        </div>
        <Select value={period} onValueChange={(v) => setPeriod(v || "7")}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Hoje</SelectItem>
            <SelectItem value="7">7 dias</SelectItem>
            <SelectItem value="30">30 dias</SelectItem>
            <SelectItem value="90">90 dias</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard title="Conversas Abertas" value={kpis.openConversations} icon={<Inbox className="h-5 w-5" />} />
        <KpiCard title="Total Mensagens" value={kpis.totalMessages} icon={<MessageSquare className="h-5 w-5" />} subtitle={`${period} dias`} />
        <KpiCard title="Taxa Conversão" value={`${kpis.conversionRate}%`} icon={<Target className="h-5 w-5" />} subtitle="conversas → vendas" />
        <KpiCard title="Receita" value={`R$ ${kpis.revenue.toFixed(0)}`} icon={<DollarSign className="h-5 w-5" />} subtitle={`${period} dias`} />
        <KpiCard title="Contatos" value={kpis.totalContacts} icon={<Users className="h-5 w-5" />} />
        <KpiCard title="Pipeline" value={`R$ ${kpis.pipelineValue.toFixed(0)}`} icon={<TrendingUp className="h-5 w-5" />} subtitle="em negociação" />
        <KpiCard title="Vendas Fechadas" value={kpis.wonDeals} icon={<ShoppingBag className="h-5 w-5" />} subtitle={`${period} dias`} />
        <KpiCard title="Conversas Período" value={kpis.totalConversations} icon={<Clock className="h-5 w-5" />} subtitle={`${period} dias`} />
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Volume Chart */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Volume de Mensagens</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={charts.volumeData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Area type="monotone" dataKey="incoming" name="Recebidas" stroke="#ec4899" fill="#fce7f3" />
                <Area type="monotone" dataKey="outgoing" name="Enviadas" stroke="#8b5cf6" fill="#ede9fe" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Channel Pie */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Conversas por Canal</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={charts.channelData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  dataKey="value"
                  label={({ name, value }) => `${name} (${value})`}
                >
                  {charts.channelData.map((entry) => (
                    <Cell key={entry.name} fill={CHANNEL_COLORS[entry.name] || "#999"} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Pipeline Funnel */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Funil de Vendas</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={charts.pipelineByStage} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis
                  type="category"
                  dataKey="stage"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => STAGE_LABELS[v] || v}
                  width={90}
                />
                <Tooltip formatter={(value) => `R$ ${Number(value).toFixed(0)}`} />
                <Bar dataKey="value" name="Valor" fill="#ec4899" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* SLA */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Tempo Médio de Resposta</CardTitle>
          </CardHeader>
          <CardContent>
            {charts.slaData.length === 0 ? (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground text-sm">
                Sem dados suficientes
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={charts.slaData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="channel" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value) => `${Number(value)} min`} />
                  <Bar dataKey="avgMinutes" name="Média (min)" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
