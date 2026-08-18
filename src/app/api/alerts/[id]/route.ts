import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { usuarioDaSessao, semSessao } from "@/lib/sessao"
import { escopoDaLoja, lojaAtiva, foraDaLoja } from "@/lib/loja"

/**
 * PUT: Acknowledge an alert
 * Quem reconheceu vem da sessao — o body nao decide isso.
 *
 * O alerta tambem precisa ser da loja de quem reconhece: sem escopo, um
 * vendedor do Centro dava baixa em alerta de SLA estourado do Cerro Azul, que
 * sumia do painel de la sem ninguem ter atendido a cliente.
 */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const usuario = await usuarioDaSessao()
  if (!usuario) return semSessao()

  const { id } = await params

  const alvo = await prisma.alert.findFirst({
    where: { id, ...escopoDaLoja(usuario, lojaAtiva(req)) },
    select: { id: true },
  })
  if (!alvo) return foraDaLoja("Alerta")

  const alert = await prisma.alert.update({
    where: { id },
    data: {
      acknowledgedBy: usuario.id,
      acknowledgedAt: new Date(),
    },
  })

  return NextResponse.json(alert)
}
