import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { usuarioDaSessao, semSessao } from "@/lib/sessao"
import { credenciaisDaConta } from "@/lib/roteamento"
import { ehUazapiConfigError } from "@/lib/uazapi/config"
import { estadoDaInstancia, iniciarPareamento } from "@/lib/uazapi/instancia"

/**
 * Sessao de um numero no uazapi.
 *
 *   GET   estado atual (conectado / conectando / desconectado)
 *   POST  inicia o pareamento e devolve o QR code
 *
 * So admin: cai na excecao `/api/integracoes` do RBAC (`src/lib/rbac.ts`).
 *
 * Sem equivalente na API oficial da Meta — la o numero e permanente. Aqui a
 * sessao cai e precisa de gente lendo QR code no celular da loja.
 */

/** Token da instancia, decifrado na hora. Erro vira resposta HTTP, nao vazamento. */
async function tokenDaConta(id: string) {
  const conta = await prisma.storeIntegracao.findFirst({
    where: { id, provedor: "uazapi", isDeleted: false },
    select: { id: true, rotulo: true },
  })
  if (!conta) return { erro: NextResponse.json({ error: "Conta uazapi nao encontrada" }, { status: 404 }) }

  const credenciais = await credenciaisDaConta(id)
  if (!credenciais?.token) {
    return {
      erro: NextResponse.json(
        { error: "Conta sem token de instancia. Reconecte informando o token." },
        { status: 409 }
      ),
    }
  }
  return { token: credenciais.token, rotulo: conta.rotulo }
}

/** Traduz a falha do uazapi para HTTP, e grava o motivo na conta. */
async function falha(id: string, usuarioId: string, error: unknown) {
  if (ehUazapiConfigError(error)) {
    await prisma.storeIntegracao.update({
      where: { id },
      data: { status: "erro", ultimoErro: error.message, modifiedBy: usuarioId },
    })
    return NextResponse.json({ error: error.message }, { status: 503 })
  }
  console.error("[uazapi] Erro na sessao:", error)
  return NextResponse.json({ error: "Erro ao falar com o uazapi" }, { status: 500 })
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const usuario = await usuarioDaSessao()
  if (!usuario) return semSessao()

  const { id } = await params
  const conta = await tokenDaConta(id)
  if (conta.erro) return conta.erro

  try {
    const estado = await estadoDaInstancia(conta.token!)
    // O status no banco fica alinhado com a realidade a cada consulta — senao a
    // tela mostra "conectado" para um numero que caiu ontem.
    await prisma.storeIntegracao.update({
      where: { id },
      data: {
        status: estado.status === "conectado" ? "conectado" : "desconectado",
        ultimoErro: null,
        modifiedBy: usuario.id,
      },
    })
    return NextResponse.json(estado)
  } catch (error) {
    return falha(id, usuario.id, error)
  }
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const usuario = await usuarioDaSessao()
  if (!usuario) return semSessao()

  const { id } = await params
  const conta = await tokenDaConta(id)
  if (conta.erro) return conta.erro

  try {
    const estado = await iniciarPareamento(conta.token!)
    return NextResponse.json(estado)
  } catch (error) {
    return falha(id, usuario.id, error)
  }
}
