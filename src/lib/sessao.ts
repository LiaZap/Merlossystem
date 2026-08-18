import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import { authOptions } from "@/lib/auth"
import type { UsuarioComLoja } from "@/lib/loja"

/**
 * Quem esta executando a acao — sempre da sessao, nunca do corpo da requisicao.
 *
 * Autoria (`senderId`, `createdBy`, `changedBy`, `acknowledgedBy`,
 * `uploadedBy`, `resolvedBy`, `userId` da trilha) vinha do body: bastava
 * trocar o id no JSON para registrar a acao em nome de outra pessoa. Trilha de
 * auditoria que o proprio autor escolhe nao e trilha de auditoria.
 *
 * Uso no route handler:
 *
 *   const usuario = await usuarioDaSessao()
 *   if (!usuario) return semSessao()
 *   ... createdBy: usuario.id
 *
 * A sessao e JWT, entao isto le o cookie — nao vai ao banco.
 */
export async function usuarioDaSessao(): Promise<UsuarioComLoja | null> {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return null
  return {
    id: session.user.id,
    role: session.user.role,
    storeId: session.user.storeId ?? null,
  }
}

/**
 * O middleware ja barra requisicao sem sessao; isto so existe para o caso de
 * alguem tirar a rota do matcher. Falhar fechado sai mais barato que gravar
 * autoria nula.
 */
export function semSessao() {
  return NextResponse.json({ error: "Nao autenticado" }, { status: 401 })
}
