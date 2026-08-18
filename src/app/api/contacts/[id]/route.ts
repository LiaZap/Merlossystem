import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { usuarioDaSessao, semSessao } from "@/lib/sessao"
import { escopoDaLoja, lojaAtiva, foraDaLoja, type UsuarioComLoja } from "@/lib/loja"
import { z } from "zod"

/**
 * Contato individual.
 *
 * Os tres handlers resolvem o contato DENTRO do escopo da loja antes de tocar
 * nele. Sem isso, um vendedor do Centro com o id de um contato do Cerro Azul
 * lia telefone, email e endereco do cliente da outra loja, reescrevia o
 * cadastro e apagava o contato — a carteira e isolada por loja (decisao 5 de
 * docs/integracoes.md), o handler e que nao respeitava.
 */

const updateSchema = z.object({
  name: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  instagramId: z.string().optional().nullable(),
  facebookId: z.string().optional().nullable(),
  tiktokId: z.string().optional().nullable(),
  whatsappId: z.string().optional().nullable(),
  preferredSize: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional().nullable(),
  birthday: z.string().optional().nullable(),
})

/** O contato, se pertencer a uma loja que quem pediu alcanca. */
function noEscopo(req: Request, id: string, usuario: UsuarioComLoja) {
  return prisma.contact.findFirst({
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
  const contact = await prisma.contact.findFirst({
    where: { id, ...escopoDaLoja(usuario, lojaAtiva(req)) },
  })

  // Contato de outra loja responde igual a inexistente: dizer "existe, mas nao
  // e sua" ja confirma que aquele cliente esta cadastrado na rede.
  if (!contact) {
    return NextResponse.json({ error: "Contato não encontrado" }, { status: 404 })
  }

  return NextResponse.json(contact)
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const usuario = await usuarioDaSessao()
    if (!usuario) return semSessao()

    const { id } = await params
    if (!(await noEscopo(req, id, usuario))) return foraDaLoja("Contato")

    const body = await req.json()
    const data = updateSchema.parse(body)

    const contact = await prisma.contact.update({
      where: { id },
      data: {
        ...data,
        birthday: data.birthday ? new Date(data.birthday) : undefined,
      },
    })

    return NextResponse.json(contact)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    return NextResponse.json({ error: "Erro ao atualizar contato" }, { status: 500 })
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const usuario = await usuarioDaSessao()
  if (!usuario) return semSessao()

  const { id } = await params
  if (!(await noEscopo(req, id, usuario))) return foraDaLoja("Contato")

  // Soft delete (ADR 0005): o contato some das telas, mas conversas, pedidos e
  // trilha continuam apontando para ele. Apagar de verdade deixaria pedido
  // orfao — e o historico de compra perderia o nome de quem comprou.
  // Para o apagamento definitivo da LGPD ha rota propria (`DELETE /api/lgpd`).
  await prisma.contact.update({
    where: { id },
    data: { isDeleted: true, deletedAt: new Date(), modifiedBy: usuario.id },
  })

  return NextResponse.json({ success: true })
}
