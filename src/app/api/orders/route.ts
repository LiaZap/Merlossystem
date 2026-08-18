import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db/prisma"
import { usuarioDaSessao, semSessao } from "@/lib/sessao"
import { escopoDaLoja, lojaAtiva, foraDaLoja } from "@/lib/loja"
import { proximoNumero } from "@/lib/pedidos/numero"
import { z } from "zod"
import { limiteDaPagina, paginaAtual } from "@/lib/paginacao"

const orderItemSchema = z.object({
  productId: z.string(),
  name: z.string(),
  size: z.string(),
  quantity: z.number().min(1),
  unitPrice: z.number().min(0),
})

const orderSchema = z.object({
  contactId: z.string(),
  dealId: z.string().optional().nullable(),
  conversationId: z.string().optional().nullable(),
  items: z.array(orderItemSchema).min(1),
  shippingCost: z.number().default(0),
  discount: z.number().default(0),
  paymentMethod: z.string().optional().nullable(),
  shippingMethod: z.string().optional().nullable(),
  shippingAddress: z.record(z.string(), z.unknown()).optional().nullable(),
  notes: z.string().optional().nullable(),
  // `createdBy` NAO entra aqui: quem criou o pedido vem da sessao.
})

/** Colisao de `@@unique([storeId, orderNumber])`. */
function ehNumeroDuplicado(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002"
}

export async function GET(req: Request) {
  const usuario = await usuarioDaSessao()
  if (!usuario) return semSessao()

  const { searchParams } = new URL(req.url)
  const status = searchParams.get("status") || ""
  const contactId = searchParams.get("contactId") || ""
  const search = searchParams.get("search") || ""
  const page = paginaAtual(searchParams.get("page"))
  const limit = limiteDaPagina(searchParams.get("limit"), 20)

  const where: Record<string, unknown> = { ...escopoDaLoja(usuario, lojaAtiva(req)) }
  if (status && status !== "all") where.status = status
  if (contactId) where.contactId = contactId
  // `?masc=pendente` e a fila "o que falta lancar no Masc" (ADR 0004).
  const masc = searchParams.get("masc") || ""
  if (masc && masc !== "all") where.mascStatus = masc
  if (search) {
    where.OR = [
      { orderNumber: { contains: search, mode: "insensitive" } },
      { contact: { name: { contains: search, mode: "insensitive" } } },
    ]
  }

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: {
        contact: { select: { id: true, name: true, phone: true } },
        payments: { select: { id: true, method: true, status: true, amount: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.order.count({ where }),
  ])

  return NextResponse.json({ orders, total, page, limit })
}

export async function POST(req: Request) {
  try {
    const usuario = await usuarioDaSessao()
    if (!usuario) return semSessao()

    const body = await req.json()
    const data = orderSchema.parse(body)

    // A loja do pedido e a do contato — nao um parametro. Isso tambem fecha o
    // furo de mandar no corpo o contactId da outra loja: se o contato nao esta
    // no escopo de quem pediu, a busca nao acha e o pedido nao nasce.
    const contato = await prisma.contact.findFirst({
      where: { id: data.contactId, ...escopoDaLoja(usuario, lojaAtiva(req)) },
      select: { storeId: true, store: { select: { nome: true } } },
    })
    if (!contato) return foraDaLoja("Contato")
    const storeId = contato.storeId

    const subtotal = data.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0)
    const total = subtotal + data.shippingCost - data.discount

    /**
     * Tudo numa transacao: pedido, evento, contador do contato e o deal.
     *
     * Antes eram quatro escritas soltas. Falhar entre a primeira e a terceira
     * deixava o contato com `totalOrders` maior que o numero real de pedidos —
     * e ninguem descobria, porque nao ha nada que reconcilie esse contador.
     */
    const criar = () =>
      prisma.$transaction(async (tx) => {
        const order = await tx.order.create({
          data: {
            storeId,
            contactId: data.contactId,
            dealId: data.dealId || null,
            conversationId: data.conversationId || null,
            orderNumber: await proximoNumero(tx, storeId, contato.store.nome, new Date()),
            status: "confirmed",
            items: data.items as unknown as Prisma.InputJsonValue,
            subtotal,
            shippingCost: data.shippingCost,
            discount: data.discount,
            total,
            paymentMethod: data.paymentMethod || null,
            paymentStatus: "pending",
            shippingMethod: data.shippingMethod || null,
            shippingAddress: data.shippingAddress
              ? (data.shippingAddress as Prisma.InputJsonValue)
              : undefined,
            notes: data.notes || null,
            // Nasce pendente de lancamento no Masc, que e o dono da venda
            // (ADR 0004). Nao ha escrita em ERP daqui.
            mascStatus: "pendente",
            createdBy: usuario.id,
          },
          include: { contact: { select: { id: true, name: true, phone: true } } },
        })

        await tx.orderEvent.create({
          data: {
            orderId: order.id,
            status: "confirmed",
            description: "Pedido criado",
            createdBy: usuario.id,
          },
        })

        await tx.contact.update({
          where: { id: data.contactId },
          data: { totalOrders: { increment: 1 }, totalSpent: { increment: total } },
        })

        if (data.dealId) {
          await tx.deal.update({
            where: { id: data.dealId },
            data: { stage: "won", lastActivityAt: new Date() },
          })
        }

        return order
      })

    // Duas vendedoras fechando pedido no mesmo segundo leem a mesma "ultima"
    // sequencia. O indice unico barra a segunda; aqui ela so refaz a conta.
    let order
    for (let tentativa = 1; ; tentativa++) {
      try {
        order = await criar()
        break
      } catch (e) {
        if (!ehNumeroDuplicado(e) || tentativa >= 5) throw e
      }
    }

    return NextResponse.json(order, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    console.error("[Orders] Create error:", error)
    return NextResponse.json({ error: "Erro ao criar pedido" }, { status: 500 })
  }
}
