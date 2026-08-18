import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { usuarioDaSessao, semSessao } from "@/lib/sessao"
import { escopoDaLoja, lojaAtiva, foraDaLoja, type UsuarioComLoja } from "@/lib/loja"

/**
 * Mensagem agendada individual.
 *
 * Sem escopo, um vendedor do Centro reescrevia o conteudo de um agendamento do
 * Cerro Azul e a mensagem adulterada saia para o cliente da outra loja; ou
 * cancelava o disparo, e a outra loja so descobria quando o cliente nao
 * respondia.
 */

/** O agendamento, se pertencer a uma loja que quem pediu alcanca. */
function noEscopo(req: Request, id: string, usuario: UsuarioComLoja) {
  return prisma.scheduledMessage.findFirst({
    where: { id, ...escopoDaLoja(usuario, lojaAtiva(req)) },
    select: { id: true },
  })
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const usuario = await usuarioDaSessao()
  if (!usuario) return semSessao()

  const { id } = await params
  if (!(await noEscopo(req, id, usuario))) return foraDaLoja("Agendamento")

  const body = await req.json()

  const data: Record<string, unknown> = {}
  if (body.status !== undefined) data.status = body.status
  if (body.scheduledFor !== undefined) data.scheduledFor = new Date(body.scheduledFor)
  if (body.content !== undefined) data.content = body.content
  if (body.sentAt !== undefined) data.sentAt = new Date(body.sentAt)
  if (body.errorMessage !== undefined) data.errorMessage = body.errorMessage

  const message = await prisma.scheduledMessage.update({ where: { id }, data })
  return NextResponse.json(message)
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const usuario = await usuarioDaSessao()
  if (!usuario) return semSessao()

  const { id } = await params
  if (!(await noEscopo(req, id, usuario))) return foraDaLoja("Agendamento")

  await prisma.scheduledMessage.update({
    where: { id },
    data: { status: "cancelled" },
  })
  return NextResponse.json({ success: true })
}
