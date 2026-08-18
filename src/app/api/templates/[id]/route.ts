import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db/prisma"
import { usuarioDaSessao, semSessao } from "@/lib/sessao"
import { escopoDaLoja, lojaAtiva, foraDaLoja, type UsuarioComLoja } from "@/lib/loja"

/**
 * Template do WhatsApp individual.
 *
 * Sem escopo, um vendedor do Centro lia o texto das campanhas do Cerro Azul,
 * marcava um template `rejected` como `approved` (ou o contrario) e excluia
 * template que a outra loja ja usa em broadcast e agendamento.
 */

/** O template, se pertencer a uma loja que quem pediu alcanca. */
function noEscopo(req: Request, id: string, usuario: UsuarioComLoja) {
  return prisma.whatsappTemplate.findFirst({
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
  const template = await prisma.whatsappTemplate.findFirst({
    where: { id, ...escopoDaLoja(usuario, lojaAtiva(req)) },
  })

  // Template de outra loja responde igual a inexistente: separar os dois casos
  // ja confirmaria que aquele template existe.
  if (!template) return NextResponse.json({ error: "Template não encontrado" }, { status: 404 })
  return NextResponse.json(template)
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const usuario = await usuarioDaSessao()
  if (!usuario) return semSessao()

  const { id } = await params
  if (!(await noEscopo(req, id, usuario))) return foraDaLoja("Template")

  const body = await req.json()

  const data: Record<string, unknown> = {}
  if (body.name !== undefined) data.name = body.name
  if (body.category !== undefined) data.category = body.category
  if (body.headerType !== undefined) data.headerType = body.headerType
  if (body.headerContent !== undefined) data.headerContent = body.headerContent
  if (body.body !== undefined) data.body = body.body
  if (body.footer !== undefined) data.footer = body.footer
  if (body.buttons !== undefined) data.buttons = body.buttons as Prisma.InputJsonValue
  if (body.status !== undefined) {
    data.status = body.status
    if (body.status === "pending") data.submittedAt = new Date()
    if (body.status === "approved") data.approvedAt = new Date()
    if (body.status === "rejected") data.rejectionReason = body.rejectionReason || null
  }
  if (body.metaTemplateId !== undefined) data.metaTemplateId = body.metaTemplateId

  const template = await prisma.whatsappTemplate.update({ where: { id }, data })
  return NextResponse.json(template)
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const usuario = await usuarioDaSessao()
  if (!usuario) return semSessao()

  const { id } = await params
  if (!(await noEscopo(req, id, usuario))) return foraDaLoja("Template")

  // Soft delete (ADR 0005): a linha fica, com quem excluiu e quando. Apagar de
  // verdade levaria junto o rastro de quem fez o que.
  await prisma.whatsappTemplate.update({
    where: { id },
    data: { isDeleted: true, deletedAt: new Date(), modifiedBy: usuario.id },
  })
  return NextResponse.json({ success: true })
}
