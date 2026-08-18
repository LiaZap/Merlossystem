import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { usuarioDaSessao, semSessao } from "@/lib/sessao"
import { escopoDaLoja, lojaAtiva, foraDaLoja } from "@/lib/loja"
import { getPaymentProvider } from "@/lib/payments"
import { z } from "zod"

const pixSchema = z.object({
  orderId: z.string(),
  expirationMinutes: z.number().default(30),
})

/**
 * POST: Generate a Pix QR Code for an order
 */
export async function POST(req: Request) {
  try {
    const usuario = await usuarioDaSessao()
    if (!usuario) return semSessao()

    const body = await req.json()
    const data = pixSchema.parse(body)

    // Cobranca e dinheiro de verdade: sem escopo, um vendedor do Centro com o
    // id de um pedido do Cerro Azul gerava cobranca no pedido da outra loja.
    const order = await prisma.order.findFirst({
      where: { id: data.orderId, ...escopoDaLoja(usuario, lojaAtiva(req)) },
      include: { contact: { select: { name: true } } },
    })

    if (!order) return foraDaLoja("Pedido")

    const provider = getPaymentProvider()
    const result = await provider.generatePix({
      amount: Number(order.total),
      description: `Pedido ${order.orderNumber} — Merlos Store`,
      expirationMinutes: data.expirationMinutes,
    })

    const payment = await prisma.payment.create({
      data: {
        orderId: order.id,
        provider: provider.name,
        externalId: result.externalId,
        method: "pix",
        status: "pending",
        amount: order.total,
        pixQrcodeBase64: result.qrcodeBase64,
        pixCopyPaste: result.copyPaste,
        expiresAt: result.expiresAt,
      },
    })

    // Update order payment method
    await prisma.order.update({
      where: { id: order.id },
      data: { paymentMethod: "pix" },
    })

    return NextResponse.json(payment, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    console.error("[Pix] Error:", error)
    return NextResponse.json({ error: "Erro ao gerar Pix" }, { status: 500 })
  }
}
