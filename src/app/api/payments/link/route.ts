import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { usuarioDaSessao, semSessao } from "@/lib/sessao"
import { escopoDaLoja, lojaAtiva, foraDaLoja } from "@/lib/loja"
import { getPaymentProvider } from "@/lib/payments"
import { z } from "zod"

const linkSchema = z.object({
  orderId: z.string(),
})

/**
 * POST: Generate a payment link for an order
 */
export async function POST(req: Request) {
  try {
    const usuario = await usuarioDaSessao()
    if (!usuario) return semSessao()

    const body = await req.json()
    const data = linkSchema.parse(body)

    // Cobranca e dinheiro de verdade: sem escopo, um vendedor do Centro com o
    // id de um pedido do Cerro Azul gerava cobranca no pedido da outra loja.
    const order = await prisma.order.findFirst({
      where: { id: data.orderId, ...escopoDaLoja(usuario, lojaAtiva(req)) },
    })

    if (!order) return foraDaLoja("Pedido")

    const items = (order.items as { name: string; quantity: number; unitPrice: number }[]) || []
    const provider = getPaymentProvider()

    const result = await provider.generatePaymentLink({
      amount: Number(order.total),
      description: `Pedido ${order.orderNumber} — Merlos Store`,
      items: items.map((i) => ({ name: i.name, quantity: i.quantity, unitPrice: i.unitPrice })),
    })

    const payment = await prisma.payment.create({
      data: {
        orderId: order.id,
        provider: provider.name,
        externalId: result.externalId,
        method: "link",
        status: "pending",
        amount: order.total,
        paymentLink: result.paymentUrl,
        expiresAt: result.expiresAt,
      },
    })

    await prisma.order.update({
      where: { id: order.id },
      data: { paymentMethod: "link" },
    })

    return NextResponse.json(payment, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    console.error("[Payment Link] Error:", error)
    return NextResponse.json({ error: "Erro ao gerar link" }, { status: 500 })
  }
}
