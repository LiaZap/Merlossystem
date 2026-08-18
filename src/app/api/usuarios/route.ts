import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { usuarioDaSessao, semSessao } from "@/lib/sessao"
import { lojaAtiva, ehGestao } from "@/lib/loja"

/**
 * Quem pode receber uma conversa transferida.
 *
 * NAO usa `escopoDaLoja`: aquele helper devolve `{ storeId }`, e admin/gerente
 * tem `storeId` nulo de proposito (alcancam as duas lojas, docs/rbac.md). Com o
 * filtro direto, a gestao desaparecia da lista de transferencia — justamente
 * quem o vendedor precisa acionar quando nao sabe resolver.
 *
 * Devolve o minimo para desenhar um seletor: id, nome, papel e avatar. Sem
 * e-mail, sem data de ultimo acesso, sem hash de senha. E uma lista que todo
 * atendente consegue abrir; nao e a tela de gestao de equipe.
 */
export async function GET(req: Request) {
  const usuario = await usuarioDaSessao()
  if (!usuario) return semSessao()

  // Vendedor: a loja e a do cadastro dele, nunca a pedida no request (cookie e
  // query string sao do cliente). Gestao: a loja escolhida no seletor, ou as
  // duas quando nao escolheu.
  const loja = ehGestao(usuario.role) ? lojaAtiva(req) : usuario.storeId

  const usuarios = await prisma.user.findMany({
    where: {
      isActive: true,
      // `storeId: null` = gestao, que atende as duas lojas. Sem loja definida
      // (gestao sem seletor), lista todos os ativos.
      ...(loja ? { OR: [{ storeId: loja }, { storeId: null }] } : {}),
    },
    select: { id: true, name: true, role: true, avatarUrl: true, storeId: true },
    orderBy: { name: "asc" },
  })

  return NextResponse.json(usuarios)
}
