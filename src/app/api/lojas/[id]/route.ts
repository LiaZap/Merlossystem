import { NextResponse } from "next/server"
import { z } from "zod"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db/prisma"
import { usuarioDaSessao, semSessao } from "@/lib/sessao"
import { gerarSlug } from "@/lib/loja"

/**
 * Editar e desativar loja. So admin (excecao `/api/lojas` em src/lib/rbac.ts).
 *
 * O caso que mais importa aqui e o `blingDepositoId`: sem o de-para preenchido,
 * a leitura de saldo responde `409` e a tela de venda fica sem estoque ao vivo.
 * Ate agora so dava para preencher por SQL direto no banco.
 */

const atualizacaoSchema = z.object({
  nome: z.string().trim().min(1).optional(),
  slug: z.string().trim().optional(),
  blingDepositoId: z.string().trim().optional().nullable(),
  ativo: z.boolean().optional(),
})

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const usuario = await usuarioDaSessao()
    if (!usuario) return semSessao()

    const { id } = await params
    const atual = await prisma.store.findFirst({
      where: { id, isDeleted: false },
      select: { id: true },
    })
    if (!atual) {
      return NextResponse.json({ error: "Loja nao encontrada" }, { status: 404 })
    }

    const data = atualizacaoSchema.parse(await req.json())

    const loja = await prisma.store.update({
      where: { id },
      data: {
        ...(data.nome !== undefined && { nome: data.nome }),
        ...(data.slug !== undefined && { slug: gerarSlug(data.slug) }),
        // String vazia limpa o de-para; `undefined` deixa como esta.
        ...(data.blingDepositoId !== undefined && {
          blingDepositoId: data.blingDepositoId || null,
        }),
        ...(data.ativo !== undefined && { ativo: data.ativo }),
        modifiedBy: usuario.id,
      },
      select: { id: true, nome: true, slug: true, blingDepositoId: true, ativo: true },
    })

    return NextResponse.json(loja)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        { error: "Ja existe uma loja com esse identificador." },
        { status: 409 }
      )
    }
    console.error("[Lojas] Erro ao atualizar:", error)
    return NextResponse.json({ error: "Erro ao atualizar a loja" }, { status: 500 })
  }
}

/**
 * Desativar a loja — soft delete (ADR 0005).
 *
 * Loja nunca e apagada: contatos, conversas e pedidos apontam para ela, e o
 * historico perderia a origem. Recusa se ainda houver gente ou pedido ligado,
 * porque desativar por engano deixaria vendedores sem acesso a nada.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const usuario = await usuarioDaSessao()
  if (!usuario) return semSessao()

  const { id } = await params
  const loja = await prisma.store.findFirst({
    where: { id, isDeleted: false },
    select: { id: true, nome: true },
  })
  if (!loja) {
    return NextResponse.json({ error: "Loja nao encontrada" }, { status: 404 })
  }

  const [usuarios, pedidos] = await Promise.all([
    prisma.user.count({ where: { storeId: id, isActive: true } }),
    prisma.order.count({ where: { storeId: id } }),
  ])

  if (usuarios > 0 || pedidos > 0) {
    return NextResponse.json(
      {
        error:
          `A loja ${loja.nome} ainda tem ${usuarios} usuario(s) e ${pedidos} pedido(s). ` +
          `Mova as pessoas para outra loja antes de desativar.`,
      },
      { status: 409 }
    )
  }

  await prisma.store.update({
    where: { id },
    data: { ativo: false, isDeleted: true, deletedAt: new Date(), modifiedBy: usuario.id },
  })

  return NextResponse.json({ success: true })
}
