import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { usuarioDaSessao, semSessao } from "@/lib/sessao"
import { escopoDaLoja, lojaAtiva, foraDaLoja } from "@/lib/loja"

/**
 * GET: Export all data for a contact (LGPD right of access)
 * POST: Record consent
 * DELETE: Delete all contact data (LGPD right to erasure)
 */

export async function GET(req: Request) {
  const usuario = await usuarioDaSessao()
  if (!usuario) return semSessao()

  const { searchParams } = new URL(req.url)
  const contactId = searchParams.get("contactId")

  if (!contactId) {
    return NextResponse.json({ error: "contactId required" }, { status: 400 })
  }

  // O contato tem que estar no escopo de quem pediu. Sem isto, qualquer
  // usuario logado — inclusive `viewer` — exportava o dossie completo de um
  // cliente da outra loja: contato, todas as conversas com mensagens, pedidos
  // e endereco de entrega.
  const alvo = await prisma.contact.findFirst({
    where: { id: contactId, ...escopoDaLoja(usuario, lojaAtiva(req)) },
    select: { id: true },
  })
  if (!alvo) return foraDaLoja("Contato")

  const [contact, conversations, orders, consentLogs] = await Promise.all([
    prisma.contact.findUnique({ where: { id: contactId } }),
    prisma.conversation.findMany({ where: { contactId }, include: { messages: true } }),
    prisma.order.findMany({ where: { contactId } }),
    prisma.consentLog.findMany({ where: { contactId } }),
  ])

  return NextResponse.json({
    contact,
    conversations,
    orders,
    consentLogs,
    exportedAt: new Date().toISOString(),
  })
}

export async function POST(req: Request) {
  const usuario = await usuarioDaSessao()
  if (!usuario) return semSessao()

  const body = await req.json()

  // O consentimento herda a loja do contato, e o escopo impede registrar
  // opt-out para cliente da outra loja.
  const contato = await prisma.contact.findFirst({
    where: { id: body.contactId, ...escopoDaLoja(usuario, lojaAtiva(req)) },
    select: { storeId: true },
  })
  if (!contato) return foraDaLoja("Contato")

  const consent = await prisma.consentLog.create({
    data: {
      storeId: contato.storeId,
      contactId: body.contactId,
      type: body.type, // data_processing | marketing | opt_out
      granted: body.granted,
      channel: body.channel || null,
      ipAddress: body.ipAddress || null,
    },
  })

  // If opt_out, update contact
  if (body.type === "opt_out" && body.granted) {
    await prisma.contact.update({
      where: { id: body.contactId },
      data: { optOut: true },
    })
  }

  return NextResponse.json(consent, { status: 201 })
}

export async function DELETE(req: Request) {
  const usuario = await usuarioDaSessao()
  if (!usuario) return semSessao()

  const { searchParams } = new URL(req.url)
  const contactId = searchParams.get("contactId")

  if (!contactId) {
    return NextResponse.json({ error: "contactId required" }, { status: 400 })
  }

  // Apagamento definitivo e irreversivel: o escopo aqui e o que impede apagar
  // o cliente da outra loja.
  const alvo = await prisma.contact.findFirst({
    where: { id: contactId, ...escopoDaLoja(usuario, lojaAtiva(req)) },
    select: { id: true },
  })
  if (!alvo) return foraDaLoja("Contato")

  /**
   * compliance:delete-fisico-lgpd
   *
   * Este e o UNICO delete fisico do sistema, e e proposital: LGPD art. 18, VI
   * da ao titular o direito a **eliminacao** dos dados. Soft delete nao cumpre
   * isso — o dado continuaria no banco, e no backup.
   *
   * Todo o resto do sistema usa soft delete (ADR 0005). `DELETE
   * /api/contacts/[id]` marca `is_deleted`; so esta rota apaga de verdade, e
   * por isso ela e restrita a admin e gerente no RBAC.
   *
   * Ordem importa: filhos antes dos pais, por causa das FKs.
   */
  await prisma.consentLog.deleteMany({ where: { contactId } }) // compliance:delete-fisico-lgpd
  await prisma.satisfactionSurvey.deleteMany({ where: { contactId } }) // compliance:delete-fisico-lgpd
  await prisma.broadcastRecipient.deleteMany({ where: { contactId } }) // compliance:delete-fisico-lgpd
  await prisma.scheduledMessage.deleteMany({ where: { contactId } }) // compliance:delete-fisico-lgpd
  await prisma.alert.deleteMany({ where: { contactId } }) // compliance:delete-fisico-lgpd

  // Delete returns, orders, payments
  const orders = await prisma.order.findMany({ where: { contactId }, select: { id: true } })
  for (const order of orders) {
    await prisma.payment.deleteMany({ where: { orderId: order.id } }) // compliance:delete-fisico-lgpd
    await prisma.orderEvent.deleteMany({ where: { orderId: order.id } }) // compliance:delete-fisico-lgpd
  }
  await prisma.return.deleteMany({ where: { contactId } }) // compliance:delete-fisico-lgpd
  await prisma.order.deleteMany({ where: { contactId } }) // compliance:delete-fisico-lgpd

  // Delete deals
  const deals = await prisma.deal.findMany({ where: { contactId }, select: { id: true } })
  for (const deal of deals) {
    await prisma.dealEvent.deleteMany({ where: { dealId: deal.id } }) // compliance:delete-fisico-lgpd
  }
  await prisma.deal.deleteMany({ where: { contactId } }) // compliance:delete-fisico-lgpd

  // Delete conversations and messages
  const convs = await prisma.conversation.findMany({ where: { contactId }, select: { id: true } })
  for (const conv of convs) {
    const msgs = await prisma.message.findMany({ where: { conversationId: conv.id }, select: { id: true } })
    for (const msg of msgs) {
      await prisma.messageMedia.deleteMany({ where: { messageId: msg.id } }) // compliance:delete-fisico-lgpd
    }
    await prisma.message.deleteMany({ where: { conversationId: conv.id } }) // compliance:delete-fisico-lgpd
  }
  await prisma.conversation.deleteMany({ where: { contactId } }) // compliance:delete-fisico-lgpd

  // Finally delete contact
  await prisma.contact.delete({ where: { id: contactId } }) // compliance:delete-fisico-lgpd

  return NextResponse.json({ success: true, deletedAt: new Date().toISOString() })
}
