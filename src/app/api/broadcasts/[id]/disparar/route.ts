import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { usuarioDaSessao, semSessao } from "@/lib/sessao"
import { escopoDaLoja, lojaAtiva, foraDaLoja } from "@/lib/loja"
import { processarLote, progresso } from "@/lib/broadcasts/disparo"
import { registrar } from "@/lib/auditoria"

/**
 * Processa UM lote da campanha e devolve o progresso.
 *
 * Um lote por chamada, e nao a campanha inteira: um handler que envia mil
 * mensagens numa requisicao estoura o tempo limite do servidor e deixa a
 * campanha em estado desconhecido — parte enviada, sem ninguem saber onde
 * parou. Quem chama repete enquanto houver `restantes`.
 *
 * Chamar duas vezes ao mesmo tempo e seguro: cada chamada RESERVA linhas
 * diferentes (`for update skip locked`), entao a cliente nao recebe duas vezes.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const usuario = await usuarioDaSessao()
  if (!usuario) return semSessao()

  const { id } = await params

  const campanha = await prisma.broadcast.findFirst({
    where: { id, ...escopoDaLoja(usuario, lojaAtiva(req)) },
    select: { id: true, storeId: true, status: true, storeIntegracaoId: true, name: true },
  })
  if (!campanha) return foraDaLoja("Campanha")

  if (campanha.status !== "sending") {
    return NextResponse.json(
      {
        error:
          campanha.status === "completed"
            ? "Campanha já concluída."
            : "A campanha não está em envio. Inicie o disparo antes.",
        ...(await progresso(id, campanha.status)),
      },
      { status: 409 }
    )
  }

  // Sem conta escolhida nao ha por qual numero enviar. Recusar aqui e melhor
  // do que escolher uma conta sozinho: numa loja com dois numeros, a campanha
  // de marketing sairia pelo numero de atendimento.
  if (!campanha.storeIntegracaoId) {
    await prisma.broadcast.update({ where: { id }, data: { status: "paused" } })
    return NextResponse.json(
      { error: "Esta campanha não tem conta de envio definida. Edite a campanha e escolha por qual número ela sai." },
      { status: 422 }
    )
  }

  const resultado = await processarLote(id)

  // Um registro por campanha, no fim: uma linha por lote encheria a trilha de
  // ruido sem dizer mais nada.
  if (resultado.concluida) {
    await registrar({
      storeId: campanha.storeId,
      userId: usuario.id,
      acao: "campanha_disparada",
      entidade: "campanha",
      entidadeId: id,
      detalhes: {
        nome: campanha.name,
        enviados: resultado.enviados,
        falhas: resultado.falhas,
        total: resultado.total,
      },
      req,
    })
  }

  return NextResponse.json(resultado)
}
