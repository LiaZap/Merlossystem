import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { usuarioDaSessao, semSessao } from "@/lib/sessao"
import { escopoDaLoja, lojaAtiva, foraDaLoja, type UsuarioComLoja } from "@/lib/loja"

/**
 * Arquivo de midia individual.
 *
 * Os tres handlers resolvem o arquivo DENTRO do escopo da loja. Sem isso, um
 * vendedor do Centro com o id de um arquivo do Cerro Azul baixava a foto do
 * cliente da outra loja, remarcava a pasta/tags dela e apagava o arquivo.
 */

/** `where` do arquivo restrito a loja que quem pediu alcanca. */
function noEscopo(req: Request, id: string, usuario: UsuarioComLoja) {
  return { id, ...escopoDaLoja(usuario, lojaAtiva(req)) }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const usuario = await usuarioDaSessao()
  if (!usuario) return semSessao()

  const { id } = await params
  const file = await prisma.mediaFile.findFirst({
    where: noEscopo(req, id, usuario),
    include: { product: { select: { id: true, name: true } } },
  })

  // Arquivo de outra loja responde igual a inexistente: dizer "existe, mas nao
  // e sua" ja confirma que o arquivo existe.
  if (!file) {
    return NextResponse.json({ error: "Arquivo não encontrado" }, { status: 404 })
  }

  return NextResponse.json(file)
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const usuario = await usuarioDaSessao()
  if (!usuario) return semSessao()

  const { id } = await params
  const alvo = await prisma.mediaFile.findFirst({
    where: noEscopo(req, id, usuario),
    select: { id: true, storeId: true },
  })
  if (!alvo) return foraDaLoja("Arquivo")

  const body = await req.json()

  // O `productId` vem do corpo, entao o escopo do `where` nao o alcanca: sem
  // esta conferencia bastava mandar o id de um produto do Cerro Azul para o
  // GET seguinte devolver o nome dele dentro do include.
  if (body.productId) {
    const produto = await prisma.product.findFirst({
      where: { id: body.productId, storeId: alvo.storeId },
      select: { id: true },
    })
    if (!produto) return foraDaLoja("Produto")
  }

  const file = await prisma.mediaFile.update({
    where: { id },
    data: {
      folder: body.folder,
      tags: body.tags,
      productId: body.productId || null,
    },
  })

  return NextResponse.json(file)
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const usuario = await usuarioDaSessao()
  if (!usuario) return semSessao()

  const { id } = await params

  // Fora do escopo, o id de outra loja destruia o arquivo dela sem volta.
  const file = await prisma.mediaFile.findFirst({ where: noEscopo(req, id, usuario) })
  if (!file) {
    return NextResponse.json({ error: "Arquivo não encontrado" }, { status: 404 })
  }

  /**
   * Soft delete (ADR 0005), e o objeto no MinIO FICA.
   *
   * Apagar o arquivo la e marcar a linha como excluida aqui seria um soft
   * delete mentiroso: restaurar devolveria um registro apontando para uma URL
   * morta, e as mensagens ja enviadas que referenciam esta midia
   * (`message_media`) ficariam com imagem quebrada no historico da conversa.
   *
   * O custo disso e armazenamento: arquivo excluido continua ocupando espaco
   * no bucket. A limpeza definitiva e trabalho de rotina separada, que le
   * `is_deleted = true` com idade suficiente — nao do clique da vendedora.
   */
  await prisma.mediaFile.update({
    where: { id },
    data: { isDeleted: true, deletedAt: new Date(), modifiedBy: usuario.id },
  })

  return NextResponse.json({ success: true })
}
