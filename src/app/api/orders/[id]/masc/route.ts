import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db/prisma"
import { usuarioDaSessao, semSessao } from "@/lib/sessao"
import { escopoDaLoja, lojaAtiva, foraDaLoja } from "@/lib/loja"

/**
 * Lancamento do pedido de canal no Masc.
 *
 * O Masc e o dono da venda e este sistema nao escreve em ERP nenhum
 * (ADR 0004). O ciclo de um pedido de WhatsApp so fecha quando uma PESSOA
 * lanca a venda no Masc — e o Masc, pelo vinculo dele, baixa o estoque no
 * Bling. Esta rota registra que isso aconteceu.
 *
 * Nao ha chamada a API do Masc aqui, e nao e omissao: nao ha evidencia de que
 * o Masc tenha API publica. Fingir integracao com um POST que nao existe seria
 * pior do que assumir que o passo e manual.
 */

const lancamentoSchema = z
  .object({
    status: z.enum(["lancado", "dispensado", "pendente"]),
    /** Numero da venda no Masc — e a unica chave que cruza os dois sistemas. */
    vendaId: z.string().trim().min(1).optional(),
    observacao: z.string().trim().max(500).optional(),
  })
  .refine((d) => d.status !== "lancado" || !!d.vendaId, {
    message: "Informe o numero da venda no Masc para marcar como lancado",
    path: ["vendaId"],
  })
  .refine((d) => d.status !== "dispensado" || !!d.observacao, {
    message: "Explique por que este pedido nao vai para o Masc",
    path: ["observacao"],
  })

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const usuario = await usuarioDaSessao()
  if (!usuario) return semSessao()

  const { id } = await params

  try {
    const data = lancamentoSchema.parse(await req.json())

    const alvo = await prisma.order.findFirst({
      where: { id, ...escopoDaLoja(usuario, lojaAtiva(req)) },
      select: { id: true, mascStatus: true, mascVendaId: true, orderNumber: true },
    })
    if (!alvo) return foraDaLoja("Pedido")

    // Marcar duas vezes como lancado com numeros diferentes e sinal de que a
    // venda foi digitada duas vezes no Masc — e ai o estoque baixou em dobro.
    //
    // A condicao NAO olha `mascStatus`: antes olhava, e dava para contornar em
    // dois passos — voltar para "pendente" (que zerava o numero) e lancar de
    // novo com outro. O que importa e se ja houve um numero registrado.
    if (
      data.status === "lancado" &&
      alvo.mascVendaId &&
      alvo.mascVendaId !== data.vendaId
    ) {
      return NextResponse.json(
        {
          error:
            `O pedido ${alvo.orderNumber} ja foi lancado no Masc como venda ` +
            `${alvo.mascVendaId}. Confira antes de trocar: se houver duas vendas ` +
            `no Masc para este pedido, o estoque baixou duas vezes.`,
        },
        { status: 409 }
      )
    }

    const lancou = data.status === "lancado"
    const order = await prisma.$transaction(async (tx) => {
      const atualizado = await tx.order.update({
        where: { id },
        data: {
          mascStatus: data.status,
          // Voltar para a fila NAO apaga o numero: "pendente + numero" quer
          // dizer "foi lancado como X e esta sendo refeito", e e o que impede
          // relancar com outro numero sem ninguem ver. Apagar perdia o rastro
          // e reabria o furo.
          mascVendaId: lancou ? data.vendaId! : alvo.mascVendaId,
          mascLancadoEm: lancou ? new Date() : null,
          mascLancadoPor: lancou ? usuario.id : null,
          mascObservacao: data.observacao ?? null,
          modifiedBy: usuario.id,
        },
        include: { contact: { select: { id: true, name: true, phone: true } } },
      })

      // Entra na linha do tempo do pedido: quem conferir depois ve o caminho
      // inteiro sem precisar de log de servidor.
      await tx.orderEvent.create({
        data: {
          orderId: id,
          status: atualizado.status,
          description: lancou
            ? `Lancado no Masc — venda ${data.vendaId}`
            : data.status === "dispensado"
              ? `Nao vai para o Masc — ${data.observacao}`
              : "Voltou para a fila do Masc",
          createdBy: usuario.id,
        },
      })

      return atualizado
    })

    return NextResponse.json(order)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    console.error("[Orders/Masc] Erro ao registrar lancamento:", error)
    return NextResponse.json({ error: "Erro ao registrar o lancamento" }, { status: 500 })
  }
}
