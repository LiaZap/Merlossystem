import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { usuarioDaSessao, semSessao } from "@/lib/sessao"
import { escopoDaLoja, lojaAtiva, foraDaLoja } from "@/lib/loja"

/**
 * Conversa individual.
 *
 * Os dois handlers resolvem a conversa DENTRO do escopo da loja antes de tocar
 * nela. Sem isso, um vendedor do Centro com o id de uma conversa do Cerro Azul
 * lia o historico e os dados pessoais da cliente da outra loja, e ainda puxava
 * a conversa para si gravando `assignedTo`.
 */

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const usuario = await usuarioDaSessao()
  if (!usuario) return semSessao()

  const { id } = await params

  const conversation = await prisma.conversation.findFirst({
    where: { id, ...escopoDaLoja(usuario, lojaAtiva(req)) },
    include: {
      contact: true,
      agent: { select: { id: true, name: true, avatarUrl: true } },
    },
  })

  // Conversa de outra loja responde igual a inexistente: dizer "existe, mas
  // nao e sua" ja confirma que aquela cliente fala com a rede.
  if (!conversation) {
    return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 })
  }

  return NextResponse.json(conversation)
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const usuario = await usuarioDaSessao()
  if (!usuario) return semSessao()

  const { id } = await params

  const alvo = await prisma.conversation.findFirst({
    where: { id, ...escopoDaLoja(usuario, lojaAtiva(req)) },
    select: { id: true },
  })
  if (!alvo) return foraDaLoja("Conversa")

  const body = await req.json()

  const data: Record<string, unknown> = {}
  if (body.status !== undefined) data.status = body.status
  if (body.assignedTo !== undefined) data.assignedTo = body.assignedTo || null
  if (body.priority !== undefined) data.priority = body.priority

  // Mark as read
  if (body.markRead) {
    data.unreadCount = 0
  }

  const conversation = await prisma.conversation.update({
    where: { id },
    data,
    include: {
      contact: true,
      agent: { select: { id: true, name: true, avatarUrl: true } },
    },
  })

  return NextResponse.json(conversation)
}
