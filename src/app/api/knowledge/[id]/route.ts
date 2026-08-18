import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { usuarioDaSessao, semSessao } from "@/lib/sessao"
import { escopoDaLoja, lojaAtiva, foraDaLoja, type UsuarioComLoja } from "@/lib/loja"

/**
 * Artigo da base de conhecimento.
 *
 * Os tres handlers resolvem o artigo DENTRO do escopo da loja antes de tocar
 * nele. Sem isso, um vendedor do Centro com o id de um artigo do Cerro Azul
 * lia procedimento interno da outra loja (inclusive o marcado como
 * `isPublic: false`), reescrevia o conteudo que a IA usa para responder
 * cliente, e apagava o artigo de vez — delete aqui e fisico.
 */

/** O artigo, se pertencer a uma loja que quem pediu alcanca. */
function noEscopo(req: Request, id: string, usuario: UsuarioComLoja) {
  return prisma.knowledgeArticle.findFirst({
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
  const article = await prisma.knowledgeArticle.findFirst({
    where: { id, ...escopoDaLoja(usuario, lojaAtiva(req)) },
  })

  // Artigo de outra loja responde igual a inexistente: dizer "existe, mas nao
  // e sua" ja confirma que aquele artigo existe.
  if (!article) return NextResponse.json({ error: "Artigo não encontrado" }, { status: 404 })
  return NextResponse.json(article)
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const usuario = await usuarioDaSessao()
  if (!usuario) return semSessao()

  const { id } = await params
  if (!(await noEscopo(req, id, usuario))) return foraDaLoja("Artigo")

  const body = await req.json()

  const article = await prisma.knowledgeArticle.update({
    where: { id },
    data: {
      title: body.title,
      content: body.content,
      category: body.category,
      tags: body.tags,
      isPublic: body.isPublic,
    },
  })

  return NextResponse.json(article)
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const usuario = await usuarioDaSessao()
  if (!usuario) return semSessao()

  const { id } = await params
  if (!(await noEscopo(req, id, usuario))) return foraDaLoja("Artigo")

  // Soft delete (ADR 0005): a linha fica, com quem excluiu e quando. Apagar de
  // verdade levaria junto o rastro de quem fez o que.
  await prisma.knowledgeArticle.update({
    where: { id },
    data: { isDeleted: true, deletedAt: new Date(), modifiedBy: usuario.id },
  })
  return NextResponse.json({ success: true })
}
