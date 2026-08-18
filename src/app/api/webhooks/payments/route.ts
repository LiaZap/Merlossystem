import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { verificarWebhookPagamento } from "@/lib/webhook-auth"

/**
 * POST: Webhook from payment gateway (Mercado Pago, Asaas, etc.)
 * Receives payment confirmation and updates order status.
 *
 * Esta rota marca pedido como PAGO. Sem a checagem abaixo, qualquer POST com
 * um externalId valido quitava um pedido.
 */
export async function POST(req: Request) {
  try {
    const auth = verificarWebhookPagamento(req.headers)
    if (!auth.ok) {
      console.warn("[Payment Webhook] Recusado:", auth.motivo)
      return NextResponse.json({ error: auth.motivo }, { status: auth.status })
    }

    const body = await req.json()

    // Extract payment ID — format varies by provider
    const externalId =
      body.data?.id?.toString() ||
      body.payment?.id?.toString() ||
      body.id?.toString()

    if (!externalId) {
      return NextResponse.json({ error: "Missing payment ID" }, { status: 400 })
    }

    // Find payment in our database
    const payment = await prisma.payment.findFirst({
      where: { externalId },
      include: {
        order: {
          include: { contact: { select: { id: true, name: true } } },
        },
      },
    })

    if (!payment) {
      // Unknown payment — might be from another system
      return NextResponse.json({ success: true })
    }

    // Determine new status from webhook payload
    const action = body.action || body.type || body.event || ""
    let newStatus: "approved" | "rejected" | "refunded" | null = null

    if (
      action.includes("approved") ||
      action.includes("payment.confirmed") ||
      action.includes("PAYMENT_RECEIVED") ||
      body.status === "approved"
    ) {
      newStatus = "approved"
    } else if (
      action.includes("rejected") ||
      action.includes("cancelled") ||
      body.status === "rejected"
    ) {
      newStatus = "rejected"
    } else if (
      action.includes("refund") ||
      body.status === "refunded"
    ) {
      newStatus = "refunded"
    }

    if (newStatus) {
      // Update payment
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: newStatus,
          paidAt: newStatus === "approved" ? new Date() : undefined,
          refundedAt: newStatus === "refunded" ? new Date() : undefined,
        },
      })

      // Update order
      if (newStatus === "approved") {
        await prisma.order.update({
          where: { id: payment.orderId },
          data: { paymentStatus: "paid" },
        })

        await prisma.orderEvent.create({
          data: {
            orderId: payment.orderId,
            status: "paid",
            description: `Pagamento confirmado via ${payment.method}`,
          },
        })
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[Payment Webhook] Error:", error)
    return NextResponse.json({ success: true }) // Always return 200
  }
}
