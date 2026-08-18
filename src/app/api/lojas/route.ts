import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { usuarioDaSessao, semSessao } from "@/lib/sessao"
import { ehGestao } from "@/lib/loja"

/**
 * GET: lojas que o usuario alcanca.
 *
 * Gestao (admin, gerente) recebe as duas — e o que alimenta o seletor.
 * Vendedor e viewer recebem so a propria, para a interface poder mostrar em
 * qual loja ele esta sem dar a entender que existe escolha.
 *
 * Criar/editar/excluir loja e configuracao e fica so com admin (src/lib/rbac.ts).
 */
export async function GET() {
  const usuario = await usuarioDaSessao()
  if (!usuario) return semSessao()

  const lojas = await prisma.store.findMany({
    where: {
      ativo: true,
      ...(ehGestao(usuario.role) ? {} : { id: usuario.storeId ?? "__sem_loja__" }),
    },
    select: { id: true, nome: true, slug: true },
    orderBy: { nome: "asc" },
  })

  return NextResponse.json({ lojas, podeTrocar: ehGestao(usuario.role) })
}
