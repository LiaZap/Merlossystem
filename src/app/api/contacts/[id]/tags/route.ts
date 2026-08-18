import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { usuarioDaSessao, semSessao } from "@/lib/sessao"
import { escopoDaLoja, lojaAtiva } from "@/lib/loja"

/**
 * PUT: Update tags for a contact
 * Body: { tags: string[] } — replaces all tags
 * Or: { add: string } — adds a single tag
 * Or: { remove: string } — removes a single tag
 *
 * A leitura ja resolve o contato dentro do escopo da loja: sem isso um
 * vendedor do Centro reescrevia as tags de um cliente do Cerro Azul — e como
 * `tags` alimenta segmentacao e disparo em massa, marcar o cliente alheio
 * bastava para incluir ele numa campanha da loja errada.
 */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const usuario = await usuarioDaSessao()
  if (!usuario) return semSessao()

  const { id } = await params
  const body = await req.json()

  const contact = await prisma.contact.findFirst({
    where: { id, ...escopoDaLoja(usuario, lojaAtiva(req)) },
    select: { tags: true },
  })

  if (!contact) {
    return NextResponse.json({ error: "Contato não encontrado" }, { status: 404 })
  }

  let newTags = contact.tags

  if (body.tags !== undefined) {
    // Replace all tags
    newTags = body.tags
  } else if (body.add) {
    // Add single tag
    if (!newTags.includes(body.add)) {
      newTags = [...newTags, body.add]
    }
  } else if (body.remove) {
    // Remove single tag
    newTags = newTags.filter((t) => t !== body.remove)
  }

  const updated = await prisma.contact.update({
    where: { id },
    data: { tags: newTags },
    select: { id: true, tags: true },
  })

  return NextResponse.json(updated)
}
