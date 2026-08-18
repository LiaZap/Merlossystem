import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { usuarioDaSessao, semSessao } from "@/lib/sessao"
import { escopoDaLoja, lojaAtiva } from "@/lib/loja"

export async function GET(req: Request) {
  const usuario = await usuarioDaSessao()
  if (!usuario) return semSessao()

  const { searchParams } = new URL(req.url)
  const days = parseInt(searchParams.get("days") || "7")
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  // Painel do vendedor mostra a loja dele; gestao ve as duas somadas, ou uma
  // so com ?loja=. Sao 10 consultas — todas carregam o mesmo escopo.
  const loja = escopoDaLoja(usuario, lojaAtiva(req))

  const [
    openConversations,
    totalConversations,
    totalMessages,
    totalContacts,
    pipelineDeals,
    wonDeals,
    totalRevenue,
    avgResponseTime,
    channelBreakdown,
    recentMessages,
  ] = await Promise.all([
    // Open conversations
    prisma.conversation.count({ where: { ...loja, status: "open" } }),

    // Total conversations in period
    prisma.conversation.count({ where: { ...loja, createdAt: { gte: since } } }),

    // Total messages in period
    prisma.message.count({ where: { ...loja, createdAt: { gte: since } } }),

    // Total contacts
    prisma.contact.count({ where: loja }),

    // Pipeline deals (active)
    prisma.deal.findMany({
      where: { ...loja, stage: { notIn: ["won", "lost"] } },
      select: { stage: true, value: true },
    }),

    // Won deals in period
    prisma.deal.count({
      where: { ...loja, stage: "won", updatedAt: { gte: since } },
    }),

    // Total revenue (orders paid in period)
    prisma.order.aggregate({
      where: { ...loja, paymentStatus: "paid", createdAt: { gte: since } },
      _sum: { total: true },
    }),

    // Average response time (conversations with agent replies)
    prisma.conversation.findMany({
      where: {
        ...loja,
        createdAt: { gte: since },
        lastMessageAt: { not: null },
      },
      select: { createdAt: true, lastMessageAt: true, channel: true },
      take: 100,
    }),

    // Messages by channel
    prisma.conversation.groupBy({
      by: ["channel"],
      _count: { id: true },
      where: { ...loja, createdAt: { gte: since } },
    }),

    // Messages by day for chart
    prisma.message.findMany({
      where: { ...loja, createdAt: { gte: since } },
      select: { createdAt: true, senderType: true },
      orderBy: { createdAt: "asc" },
    }),
  ])

  // Calculate pipeline value
  const pipelineValue = pipelineDeals.reduce((s, d) => s + Number(d.value), 0)
  const pipelineByStage = ["lead", "interested", "negotiating", "closing"].map((stage) => ({
    stage,
    count: pipelineDeals.filter((d) => d.stage === stage).length,
    value: pipelineDeals.filter((d) => d.stage === stage).reduce((s, d) => s + Number(d.value), 0),
  }))

  // Channel pie chart
  const channelData = channelBreakdown.map((c) => ({
    name: c.channel,
    value: c._count.id,
  }))

  // Messages per day
  const messagesByDay: Record<string, { date: string; incoming: number; outgoing: number }> = {}
  for (const msg of recentMessages) {
    const day = msg.createdAt.toISOString().split("T")[0]
    if (!messagesByDay[day]) messagesByDay[day] = { date: day, incoming: 0, outgoing: 0 }
    if (msg.senderType === "customer") messagesByDay[day].incoming++
    else messagesByDay[day].outgoing++
  }
  const volumeData = Object.values(messagesByDay)

  // Conversion rate
  const conversionRate = totalConversations > 0
    ? ((wonDeals / totalConversations) * 100).toFixed(1)
    : "0"

  // SLA avg (simplified)
  const slaChannels: Record<string, number[]> = {}
  for (const c of avgResponseTime) {
    if (!c.lastMessageAt) continue
    const diffMin = (c.lastMessageAt.getTime() - c.createdAt.getTime()) / 60000
    if (diffMin > 0 && diffMin < 1440) {
      if (!slaChannels[c.channel]) slaChannels[c.channel] = []
      slaChannels[c.channel].push(diffMin)
    }
  }
  const slaData = Object.entries(slaChannels).map(([channel, times]) => ({
    channel,
    avgMinutes: Math.round(times.reduce((a, b) => a + b, 0) / times.length),
  }))

  return NextResponse.json({
    kpis: {
      openConversations,
      totalConversations,
      totalMessages,
      totalContacts,
      pipelineValue,
      wonDeals,
      revenue: Number(totalRevenue._sum.total || 0),
      conversionRate,
    },
    charts: {
      channelData,
      volumeData,
      pipelineByStage,
      slaData,
    },
  })
}
