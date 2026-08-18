import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { usuarioDaSessao, semSessao } from "@/lib/sessao"
import { escopoDaLoja, lojaAtiva, foraDaLoja, type UsuarioComLoja } from "@/lib/loja"
import { z } from "zod"

/**
 * Resposta rapida individual.
 *
 * Sem escopo, um vendedor do Centro reescrevia o texto do atalho `/frete` do
 * Cerro Azul — e como o atalho e disparado no chat, o cliente da outra loja
 * recebia a mensagem adulterada sem ninguem de la ter mexido em nada.
 */

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
  category: z.string().optional().nullable(),
  shortcut: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
})

/** A resposta rapida, se pertencer a uma loja que quem pediu alcanca. */
function noEscopo(req: Request, id: string, usuario: UsuarioComLoja) {
  return prisma.quickReply.findFirst({
    where: { id, ...escopoDaLoja(usuario, lojaAtiva(req)) },
    select: { id: true },
  })
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const usuario = await usuarioDaSessao()
    if (!usuario) return semSessao()

    const { id } = await params
    if (!(await noEscopo(req, id, usuario))) return foraDaLoja("Resposta rapida")

    const body = await req.json()
    const data = updateSchema.parse(body)

    const reply = await prisma.quickReply.update({ where: { id }, data })

    return NextResponse.json(reply)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    return NextResponse.json({ error: "Erro ao atualizar" }, { status: 500 })
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const usuario = await usuarioDaSessao()
  if (!usuario) return semSessao()

  const { id } = await params
  if (!(await noEscopo(req, id, usuario))) return foraDaLoja("Resposta rapida")

  // Soft delete (ADR 0005): a linha fica, com quem excluiu e quando. Apagar de
  // verdade levaria junto o rastro de quem fez o que.
  await prisma.quickReply.update({
    where: { id },
    data: { isDeleted: true, deletedAt: new Date(), modifiedBy: usuario.id },
  })
  return NextResponse.json({ success: true })
}
