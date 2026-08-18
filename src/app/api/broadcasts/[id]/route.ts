import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { usuarioDaSessao, semSessao } from "@/lib/sessao"
import { escopoDaLoja, lojaAtiva, foraDaLoja, type UsuarioComLoja } from "@/lib/loja"

/**
 * Campanha individual.
 *
 * Os tres handlers rodavam sem sessao e sem escopo. Com o id de uma campanha do
 * Cerro Azul, um vendedor do Centro lia a lista de destinatarios (nome e
 * telefone de cliente da outra loja), disparava a campanha marcando
 * `status: "sending"`, e apagava campanha e destinatarios com o historico de
 * envio junto.
 */

/** A campanha, se pertencer a uma loja que quem pediu alcanca. */
function noEscopo(req: Request, id: string, usuario: UsuarioComLoja) {
  return prisma.broadcast.findFirst({
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

  const broadcast = await prisma.broadcast.findFirst({
    where: { id, ...escopoDaLoja(usuario, lojaAtiva(req)) },
    include: {
      template: true,
      creator: { select: { id: true, name: true } },
      recipients: {
        include: {
          contact: { select: { id: true, name: true, phone: true } },
        },
        take: 50,
        orderBy: { createdAt: "desc" },
      },
    },
  })

  // Campanha de outra loja responde igual a inexistente: dizer "existe, mas nao
  // e sua" ja confirma a campanha da outra loja.
  if (!broadcast) {
    return NextResponse.json({ error: "Broadcast não encontrado" }, { status: 404 })
  }

  return NextResponse.json(broadcast)
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const usuario = await usuarioDaSessao()
  if (!usuario) return semSessao()

  const { id } = await params
  if (!(await noEscopo(req, id, usuario))) return foraDaLoja("Broadcast")

  const body = await req.json()

  const data: Record<string, unknown> = {}
  if (body.status !== undefined) {
    data.status = body.status
    if (body.status === "sending") data.startedAt = new Date()
    if (body.status === "completed") data.completedAt = new Date()
  }
  if (body.name !== undefined) data.name = body.name
  if (body.scheduledFor !== undefined) data.scheduledFor = body.scheduledFor ? new Date(body.scheduledFor) : null

  const broadcast = await prisma.broadcast.update({ where: { id }, data })
  return NextResponse.json(broadcast)
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const usuario = await usuarioDaSessao()
  if (!usuario) return semSessao()

  const { id } = await params
  if (!(await noEscopo(req, id, usuario))) return foraDaLoja("Broadcast")

  // Soft delete (ADR 0005). Os destinatarios ficam: `broadcast_recipients` e o
  // registro de para quem a campanha JA foi enviada — apagar reescreveria o
  // que aconteceu. A loja deles vem da campanha pai, ja marcada acima.
  await prisma.broadcast.update({
    where: { id },
    data: { isDeleted: true, deletedAt: new Date(), modifiedBy: usuario.id },
  })
  return NextResponse.json({ success: true })
}
