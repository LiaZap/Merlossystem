import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { usuarioDaSessao, semSessao } from "@/lib/sessao"
import { listarDepositos, ehBlingError } from "@/lib/bling/cliente"
import { ehBlingConfigError } from "@/lib/bling/config"

/**
 * Depositos cadastrados no Bling — para a tela de lojas oferecer escolha em
 * vez de pedir um id digitado na mao.
 *
 * O de-para `stores.bling_deposito_id` e o que separa Centro de Cerro Azul
 * dentro da conta unica (decisao 6). Digitar o id errado nao da erro: mostra o
 * estoque da outra loja, calado. Escolher de uma lista tira essa chance.
 *
 * Somente leitura, e so admin (excecao `/api/integracoes` do RBAC).
 */
export async function GET() {
  const usuario = await usuarioDaSessao()
  if (!usuario) return semSessao()

  const integracao = await prisma.storeIntegracao.findFirst({
    where: { provedor: "bling", isDeleted: false, status: "conectado" },
    select: { id: true },
  })

  // Bling desconectado nao e erro: a tela cai no campo de texto livre.
  if (!integracao) {
    return NextResponse.json({ conectado: false, depositos: [] })
  }

  try {
    const depositos = await listarDepositos(integracao.id)
    return NextResponse.json({
      conectado: true,
      depositos: depositos.map((d) => ({ id: String(d.id), descricao: d.descricao ?? null })),
    })
  } catch (e) {
    if (ehBlingConfigError(e)) {
      return NextResponse.json({ error: (e as Error).message }, { status: 503 })
    }
    if (ehBlingError(e)) {
      const status = e.status === 401 ? 409 : 502
      return NextResponse.json({ error: "Bling: " + e.message }, { status })
    }
    console.error("[Bling] Depositos:", e)
    return NextResponse.json({ error: "Erro ao consultar o Bling" }, { status: 500 })
  }
}
