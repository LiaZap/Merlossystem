import { prisma } from "@/lib/db/prisma"
import { SLA_LIMITS } from "./rules"

/**
 * Alert Engine — checks all alert conditions and creates alerts.
 * Designed to be called periodically (every 1 minute via cron/worker).
 */
export async function checkAlerts(): Promise<number> {
  let created = 0

  created += await checkSlaBreaches()
  created += await checkReviewRisk()
  created += await checkStaleDeals()
  created += await checkFirstContacts()
  created += await checkReturningCustomers()
  created += await checkPendingPayments()
  created += await checkOverdueScheduledMessages()

  return created
}

/**
 * SLA Breach: conversations without agent response beyond channel SLA
 */
async function checkSlaBreaches(): Promise<number> {
  let created = 0

  for (const [channel, slaMinutes] of Object.entries(SLA_LIMITS)) {
    const threshold = new Date(Date.now() - slaMinutes * 60 * 1000)

    const conversations = await prisma.conversation.findMany({
      where: {
        channel,
        status: "open",
        slaBreached: false,
        lastMessageAt: { lt: threshold },
        unreadCount: { gt: 0 },
      },
      include: {
        contact: { select: { id: true, name: true } },
      },
      take: 50,
    })

    for (const conv of conversations) {
      const exists = await prisma.alert.findFirst({
        where: {
          type: "sla_breach",
          conversationId: conv.id,
          acknowledgedAt: null,
        },
      })

      if (!exists) {
        await prisma.alert.create({
          data: {
            storeId: conv.storeId,  // o alerta herda a loja de quem o originou
            type: "sla_breach",
            severity: "high",
            conversationId: conv.id,
            contactId: conv.contact.id,
            message: `SLA estourado: ${conv.contact.name || "Cliente"} sem resposta há ${slaMinutes}+ min no ${channel}`,
          },
        })

        await prisma.conversation.update({
          where: { id: conv.id },
          data: { slaBreached: true },
        })

        created++
      }
    }
  }

  return created
}

/**
 * Review Risk: no response for 2h+ on Instagram or Facebook
 */
async function checkReviewRisk(): Promise<number> {
  let created = 0
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)

  const conversations = await prisma.conversation.findMany({
    where: {
      channel: { in: ["instagram", "facebook"] },
      status: "open",
      lastMessageAt: { lt: twoHoursAgo },
      unreadCount: { gt: 0 },
    },
    include: {
      contact: { select: { id: true, name: true } },
    },
    take: 50,
  })

  for (const conv of conversations) {
    const exists = await prisma.alert.findFirst({
      where: {
        type: "review_risk",
        conversationId: conv.id,
        acknowledgedAt: null,
      },
    })

    if (!exists) {
      await prisma.alert.create({
        data: {
          storeId: conv.storeId,  // o alerta herda a loja de quem o originou
          type: "review_risk",
          severity: "critical",
          conversationId: conv.id,
          contactId: conv.contact.id,
          message: `RISCO: ${conv.contact.name || "Cliente"} sem resposta há 2h+ no ${conv.channel}. Pode gerar avaliação negativa!`,
        },
      })
      created++
    }
  }

  return created
}

/**
 * Stale Deals: deals in negotiating/closing without activity for 3+ days
 */
async function checkStaleDeals(): Promise<number> {
  let created = 0
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)

  const deals = await prisma.deal.findMany({
    where: {
      stage: { in: ["negotiating", "closing"] },
      lastActivityAt: { lt: threeDaysAgo },
    },
    include: {
      contact: { select: { id: true, name: true } },
      conversation: { select: { id: true } },
    },
    take: 50,
  })

  for (const deal of deals) {
    const exists = await prisma.alert.findFirst({
      where: {
        type: "deal_stale",
        contactId: deal.contact.id,
        acknowledgedAt: null,
        createdAt: { gt: threeDaysAgo },
      },
    })

    if (!exists) {
      await prisma.alert.create({
        data: {
          storeId: deal.storeId,  // o alerta herda a loja de quem o originou
          type: "deal_stale",
          severity: "high",
          conversationId: deal.conversation?.id || null,
          contactId: deal.contact.id,
          message: `Deal parado: ${deal.contact.name || "Cliente"} no estágio "${deal.stage}" há 3+ dias. Valor: R$ ${Number(deal.value).toFixed(2)}`,
        },
      })
      created++
    }
  }

  return created
}

/**
 * First Contact: new contacts that were just created
 */
async function checkFirstContacts(): Promise<number> {
  let created = 0
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)

  const contacts = await prisma.contact.findMany({
    where: {
      createdAt: { gt: fiveMinutesAgo },
      totalOrders: 0,
    },
    take: 20,
  })

  for (const contact of contacts) {
    const exists = await prisma.alert.findFirst({
      where: {
        type: "first_contact",
        contactId: contact.id,
      },
    })

    if (!exists) {
      await prisma.alert.create({
        data: {
          storeId: contact.storeId,
          type: "first_contact",
          severity: "medium",
          contactId: contact.id,
          message: `Nova cliente: ${contact.name || contact.phone || "Desconhecida"} — primeiro contato!`,
        },
      })
      created++
    }
  }

  return created
}

/**
 * Returning Customer: last contact was 30+ days ago
 */
async function checkReturningCustomers(): Promise<number> {
  let created = 0
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)

  // Find conversations opened in the last 5 minutes where the contact
  // hadn't been in touch for 30+ days
  const conversations = await prisma.conversation.findMany({
    where: {
      createdAt: { gt: fiveMinutesAgo },
      contact: {
        lastContactAt: { lt: thirtyDaysAgo },
        totalOrders: { gt: 0 },
      },
    },
    include: {
      contact: { select: { id: true, name: true } },
    },
    take: 20,
  })

  for (const conv of conversations) {
    const exists = await prisma.alert.findFirst({
      where: {
        type: "returning_customer",
        contactId: conv.contact.id,
        createdAt: { gt: fiveMinutesAgo },
      },
    })

    if (!exists) {
      await prisma.alert.create({
        data: {
          storeId: conv.storeId,  // o alerta herda a loja de quem o originou
          type: "returning_customer",
          severity: "medium",
          conversationId: conv.id,
          contactId: conv.contact.id,
          message: `Cliente retornando: ${conv.contact.name || "Cliente"} voltou após 30+ dias!`,
        },
      })
      created++
    }
  }

  return created
}

/**
 * Pending Payments: Pix generated 20+ minutes ago without confirmation
 */
async function checkPendingPayments(): Promise<number> {
  let created = 0
  const twentyMinutesAgo = new Date(Date.now() - 20 * 60 * 1000)

  const payments = await prisma.payment.findMany({
    where: {
      method: "pix",
      status: "pending",
      createdAt: { lt: twentyMinutesAgo },
      expiresAt: { gt: new Date() }, // not expired yet
    },
    include: {
      order: {
        include: {
          contact: { select: { id: true, name: true } },
        },
      },
    },
    take: 20,
  })

  for (const payment of payments) {
    const exists = await prisma.alert.findFirst({
      where: {
        type: "payment_pending",
        orderId: payment.orderId,
        acknowledgedAt: null,
      },
    })

    if (!exists) {
      await prisma.alert.create({
        data: {
          storeId: payment.order.storeId,  // o alerta herda a loja de quem o originou
          type: "payment_pending",
          severity: "medium",
          contactId: payment.order.contact.id,
          orderId: payment.orderId,
          message: `Pix pendente: R$ ${Number(payment.amount).toFixed(2)} de ${payment.order.contact.name || "Cliente"} há 20+ min`,
        },
      })
      created++
    }
  }

  return created
}

/**
 * Overdue Scheduled Messages: scheduled but not sent
 */
async function checkOverdueScheduledMessages(): Promise<number> {
  let created = 0

  const overdue = await prisma.scheduledMessage.findMany({
    where: {
      status: "scheduled",
      scheduledFor: { lt: new Date() },
    },
    include: {
      contact: { select: { id: true, name: true } },
    },
    take: 20,
  })

  for (const msg of overdue) {
    const exists = await prisma.alert.findFirst({
      where: {
        type: "follow_up_due",
        contactId: msg.contact.id,
        acknowledgedAt: null,
        createdAt: { gt: new Date(Date.now() - 60 * 60 * 1000) },
      },
    })

    if (!exists) {
      await prisma.alert.create({
        data: {
          storeId: msg.storeId,  // o alerta herda a loja de quem o originou
          type: "follow_up_due",
          severity: "high",
          conversationId: msg.conversationId,
          contactId: msg.contact.id,
          message: `Follow-up atrasado: mensagem para ${msg.contact.name || "Cliente"} deveria ter sido enviada`,
        },
      })
      created++
    }
  }

  return created
}
