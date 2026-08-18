import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db/prisma"
import { usuarioDaSessao, semSessao } from "@/lib/sessao"
import { escopoDaLoja, lojaAtiva, foraDaLoja } from "@/lib/loja"
import { z } from "zod"

/**
 * Produto individual.
 *
 * Os tres handlers resolvem o produto DENTRO do escopo da loja antes de tocar
 * nele. Sem isso, um vendedor do Centro com o id de um produto do Cerro Azul
 * lia, alterava preco e estoque, e excluia o produto da outra loja.
 */

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  sku: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  sizeType: z.string().optional(),
  sizes: z.array(z.string()).optional(),
  price: z.number().min(0).optional(),
  compareAtPrice: z.number().optional().nullable(),
  costPrice: z.number().optional().nullable(),
  stock: z.record(z.string(), z.number()).optional(),
  weightGrams: z.number().optional().nullable(),
  imageUrls: z.array(z.string()).optional(),
  active: z.boolean().optional(),
  featured: z.boolean().optional(),
})

type Usuario = { id: string; role: string; storeId: string | null }

/** O produto, se pertencer a uma loja que quem pediu alcanca. */
function noEscopo(req: Request, id: string, usuario: Usuario) {
  return prisma.product.findFirst({
    where: { id, ...escopoDaLoja(usuario, lojaAtiva(req)) },
    select: { id: true },
  })
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const usuario = await usuarioDaSessao()
  if (!usuario) return semSessao()

  const { id } = await params
  const product = await prisma.product.findFirst({
    where: { id, ...escopoDaLoja(usuario, lojaAtiva(req)) },
  })

  // Produto de outra loja responde igual a inexistente: dizer "existe, mas nao
  // e sua" ja confirma que aquele produto existe.
  if (!product) {
    return NextResponse.json({ error: "Produto nao encontrado" }, { status: 404 })
  }

  return NextResponse.json(product)
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const usuario = await usuarioDaSessao()
    if (!usuario) return semSessao()

    const { id } = await params
    if (!(await noEscopo(req, id, usuario))) return foraDaLoja("Produto")

    const data = updateSchema.parse(await req.json())

    const { stock, ...rest } = data
    const product = await prisma.product.update({
      where: { id },
      data: {
        ...rest,
        ...(stock !== undefined && { stock: stock as Prisma.InputJsonValue }),
      },
    })

    return NextResponse.json(product)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    console.error("[Products] Erro ao atualizar:", error)
    return NextResponse.json({ error: "Erro ao atualizar produto" }, { status: 500 })
  }
}

/**
 * Excluir e **logico**: grava `active: false`.
 *
 * Delete fisico apagaria o produto que pedidos antigos referenciam em
 * `orders.items[].productId`, e o historico de venda perderia a peca. Alem de
 * a base proibir delete fisico.
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const usuario = await usuarioDaSessao()
  if (!usuario) return semSessao()

  const { id } = await params
  if (!(await noEscopo(req, id, usuario))) return foraDaLoja("Produto")

  await prisma.product.update({ where: { id }, data: { active: false } })

  return NextResponse.json({ success: true })
}
