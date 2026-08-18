import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { usuarioDaSessao, semSessao } from "@/lib/sessao"
import { escopoDaLoja, lojaAtiva, foraDaLoja, type UsuarioComLoja } from "@/lib/loja"

/**
 * Lookbook individual.
 *
 * Os tres handlers resolvem o lookbook DENTRO do escopo da loja antes de tocar
 * nele. Sem isso, um vendedor do Centro com o id de um lookbook do Cerro Azul
 * lia a vitrine que a outra loja monta (quais produtos ela empurra junto),
 * renomeava a colecao e excluia o lookbook inteiro.
 */

/** O lookbook, se pertencer a uma loja que quem pediu alcanca. */
function noEscopo(req: Request, id: string, usuario: UsuarioComLoja) {
  return prisma.lookbook.findFirst({
    where: { id, ...escopoDaLoja(usuario, lojaAtiva(req)) },
    select: { id: true },
  })
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const usuario = await usuarioDaSessao()
  if (!usuario) return semSessao()

  const { id } = await params
  const lookbook = await prisma.lookbook.findFirst({
    where: { id, ...escopoDaLoja(usuario, lojaAtiva(req)) },
  })

  // Lookbook de outra loja responde igual a inexistente: dizer "existe, mas
  // nao e sua" ja confirma que aquele lookbook existe.
  if (!lookbook) {
    return NextResponse.json({ error: "Lookbook não encontrado" }, { status: 404 })
  }

  return NextResponse.json(lookbook)
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const usuario = await usuarioDaSessao()
  if (!usuario) return semSessao()

  const { id } = await params
  if (!(await noEscopo(req, id, usuario))) return foraDaLoja("Lookbook")

  const body = await req.json()

  const lookbook = await prisma.lookbook.update({
    where: { id },
    data: {
      name: body.name,
      description: body.description,
      coverMediaId: body.coverMediaId,
      productIds: body.productIds,
      mediaIds: body.mediaIds,
      active: body.active,
    },
  })

  return NextResponse.json(lookbook)
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const usuario = await usuarioDaSessao()
  if (!usuario) return semSessao()

  const { id } = await params
  if (!(await noEscopo(req, id, usuario))) return foraDaLoja("Lookbook")

  // Soft delete (ADR 0005): a linha fica, com quem excluiu e quando. Apagar de
  // verdade levaria junto o rastro de quem fez o que.
  await prisma.lookbook.update({
    where: { id },
    data: { isDeleted: true, deletedAt: new Date(), modifiedBy: usuario.id },
  })
  return NextResponse.json({ success: true })
}
