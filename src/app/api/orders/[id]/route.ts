import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { usuarioDaSessao, semSessao } from "@/lib/sessao"
import { escopoDaLoja, lojaAtiva, foraDaLoja } from "@/lib/loja"

/**
 * Pedido individual.
 *
 * As duas rotas filtram por LOJA, nao so por id. O id do pedido e um uuid, mas
 * ele circula em link e em tela — e um vendedor do Centro com o id de um pedido
 * do Cerro Azul conseguia ler e alterar o pedido da outra loja.
 */

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const usuario = await usuarioDaSessao()
  if (!usuario) return semSessao()

  const { id } = await params

  const order = await prisma.order.findFirst({
    where: { id, ...escopoDaLoja(usuario, lojaAtiva(req)) },
    include: {
      contact: { select: { id: true, name: true, phone: true, email: true } },
      payments: true,
      events: { orderBy: { createdAt: "desc" } },
    },
  })

  // Fora da loja responde igual a inexistente: dizer "existe, mas nao e sua"
  // ja confirma que aquele pedido existe.
  if (!order) {
    return NextResponse.json({ error: "Pedido nao encontrado" }, { status: 404 })
  }

  return NextResponse.json(order)
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const usuario = await usuarioDaSessao()
  if (!usuario) return semSessao()

  const { id } = await params
  const body = await req.json()

  const alvo = await prisma.order.findFirst({
    where: { id, ...escopoDaLoja(usuario, lojaAtiva(req)) },
    select: { id: true },
  })
  if (!alvo) return foraDaLoja("Pedido")

  const updateData: Record<string, unknown> = { modifiedBy: usuario.id }
  if (body.status) updateData.status = body.status
  if (body.paymentStatus) updateData.paymentStatus = body.paymentStatus
  if (body.trackingCode !== undefined) {
    updateData.trackingCode = body.trackingCode
    updateData.trackingUrl = body.trackingUrl || null
  }
  if (body.shippingMethod) updateData.shippingMethod = body.shippingMethod
  if (body.notes !== undefined) updateData.notes = body.notes

  // O lancamento no Masc NAO se altera por aqui: tem rota propria, que exige o
  // numero da venda (ADR 0004).
  const order = await prisma.order.update({
    where: { id },
    data: updateData,
    include: { contact: { select: { id: true, name: true, phone: true } } },
  })

  if (body.status) {
    await prisma.orderEvent.create({
      data: {
        orderId: id,
        status: body.status,
        description: body.description || null,
        createdBy: usuario.id,
      },
    })
  }

  return NextResponse.json(order)
}
