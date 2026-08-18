import { prisma } from "@/lib/db/prisma"
import { getAdapterDaConta } from "@/lib/channels"
import { credenciaisDaConta } from "@/lib/roteamento"
import { destinatarioDoCanal } from "@/lib/chat/enviar"

/**
 * Disparo de campanha.
 *
 * Ate aqui, "Iniciar envio" so gravava `status: "sending"` e carimbava
 * `startedAt`. A campanha ficava eternamente "enviando" e nenhuma mensagem
 * saia — o pior tipo de defeito, porque a tela mostrava que tinha funcionado.
 *
 * A FILA E O PROPRIO POSTGRES, e nao BullMQ como manda o padrao da base
 * (ADR 0007). O motivo: BullMQ exige Redis e um processo worker, que este
 * deploy nao tem, e a tabela `broadcast_recipients` ja e uma fila duravel — uma
 * linha por destinatario, com status, id externo e erro. Trocar por Redis
 * depois nao muda nada aqui: quem chama continua pedindo "processe o proximo
 * lote".
 *
 * Garantias:
 *   - FIFO, por `created_at` (regra da base);
 *   - ninguem recebe duas vezes, porque a linha e RESERVADA antes do envio,
 *     com `FOR UPDATE SKIP LOCKED`;
 *   - retomavel: o que ja saiu esta gravado, entao pausar e continuar depois
 *     nao reenvia;
 *   - opt-out conferido na hora do envio, nao so na montagem da lista.
 */

/** Destinatarios por chamada. Pequeno de proposito: cada lote e uma transacao
 *  curta, e o limite de velocidade do WhatsApp e por segundo. */
export const TAMANHO_DO_LOTE = 20

export type ProgressoDoDisparo = {
  status: string
  total: number
  enviados: number
  falhas: number
  restantes: number
  concluida: boolean
}

/**
 * Monta a lista de destinatarios a partir do filtro do segmento.
 *
 * Roda UMA vez por campanha (idempotente: se ja existem linhas, nao faz nada).
 * O retrato e tirado no inicio de proposito — se a lista fosse recalculada a
 * cada lote, uma cliente cadastrada no meio do disparo entraria pela metade e
 * o total exibido mudaria durante o envio.
 */
export async function materializarDestinatarios(broadcastId: string): Promise<number> {
  const existentes = await prisma.broadcastRecipient.count({ where: { broadcastId } })
  if (existentes > 0) return existentes

  const campanha = await prisma.broadcast.findUnique({
    where: { id: broadcastId },
    select: { storeId: true, segmentFilter: true },
  })
  if (!campanha) return 0

  const contatos = await prisma.contact.findMany({
    where: filtroDoSegmento(campanha.storeId, campanha.segmentFilter),
    select: { id: true },
  })

  if (contatos.length > 0) {
    await prisma.broadcastRecipient.createMany({
      data: contatos.map((c) => ({ broadcastId, contactId: c.id })),
      skipDuplicates: true,
    })
  }

  await prisma.broadcast.update({
    where: { id: broadcastId },
    data: { totalRecipients: contatos.length },
  })

  return contatos.length
}

/**
 * Traduz o filtro do segmento para um `where` do Prisma.
 *
 * Mesma logica da contagem em `POST /api/broadcasts` — e por isso mora aqui,
 * onde os dois usam. Divergir entre "quantos vao receber" e "quem recebeu" e o
 * tipo de erro que so aparece depois do disparo.
 */
export function filtroDoSegmento(
  storeId: string,
  segmentFilter: unknown
): Record<string, unknown> {
  const filtro = (segmentFilter ?? {}) as Record<string, unknown>
  // `optOut: false` na origem: quem pediu para nao receber nao entra na lista
  // nem para constar. A conferencia se repete na hora do envio, porque o
  // opt-out pode chegar no meio do disparo.
  const where: Record<string, unknown> = { optOut: false, storeId, isDeleted: false }

  if (Array.isArray(filtro.tags) && filtro.tags.length > 0) {
    where.tags = { hasEvery: filtro.tags as string[] }
  }
  if (filtro.preferred_size) where.preferredSize = filtro.preferred_size
  if (filtro.min_spent) where.totalSpent = { gte: filtro.min_spent }
  if (filtro.max_days_since_purchase) {
    const desde = new Date()
    desde.setDate(desde.getDate() - Number(filtro.max_days_since_purchase))
    where.lastContactAt = { gte: desde }
  }
  return where
}

type LinhaReservada = { id: string; contact_id: string }

/**
 * Reserva ate `TAMANHO_DO_LOTE` destinatarios pendentes.
 *
 * `FOR UPDATE SKIP LOCKED` e o que impede envio dobrado: duas chamadas
 * simultaneas (a aba aberta do atendente e o cron, por exemplo) pegam
 * conjuntos diferentes em vez de disputar os mesmos. Sem isso, a cliente
 * receberia a campanha duas vezes.
 */
async function reservarLote(broadcastId: string): Promise<LinhaReservada[]> {
  return prisma.$queryRaw<LinhaReservada[]>`
    update broadcast_recipients
       set status = 'sending'
     where id in (
       select id from broadcast_recipients
        where broadcast_id = ${broadcastId}
          and status = 'pending'
        order by created_at
        limit ${TAMANHO_DO_LOTE}
        for update skip locked
     )
    returning id, contact_id
  `
}

/**
 * Processa UM lote. Devolve o progresso.
 *
 * Quem chama decide o ritmo — a tela chama em sequencia enquanto a campanha
 * estiver enviando, e um cron pode chamar tambem. Nao ha laco infinito aqui de
 * proposito: um handler que envia mil mensagens numa requisicao estoura o
 * tempo limite e deixa a campanha em estado desconhecido.
 */
export async function processarLote(broadcastId: string): Promise<ProgressoDoDisparo> {
  const campanha = await prisma.broadcast.findUnique({
    where: { id: broadcastId },
    include: { template: true, integracao: { select: { id: true, provedor: true } } },
  })
  if (!campanha) throw new Error("Campanha não encontrada")

  // Pausar tem que parar de verdade: o lote seguinte confere o status antes de
  // reservar qualquer linha.
  if (campanha.status !== "sending") return progresso(broadcastId, campanha.status)

  await materializarDestinatarios(broadcastId)

  const lote = await reservarLote(broadcastId)
  if (lote.length === 0) {
    await prisma.broadcast.update({
      where: { id: broadcastId },
      data: { status: "completed", completedAt: new Date() },
    })
    return progresso(broadcastId, "completed")
  }

  const credenciais = campanha.integracao
    ? await credenciaisDaConta(campanha.integracao.id)
    : null
  const adapter = getAdapterDaConta(
    campanha.channel as "whatsapp",
    credenciais,
    campanha.integracao?.provedor
  )
  // O uazapi nao tem template aprovado: o texto do template vai como mensagem
  // comum. Chamar `sendTemplate` ali devolveria erro em todos os destinatarios.
  const usaTemplate = campanha.integracao?.provedor !== "uazapi"

  for (const linha of lote) {
    const contato = await prisma.contact.findUnique({
      where: { id: linha.contact_id },
      select: {
        optOut: true,
        phone: true,
        whatsappId: true,
        instagramId: true,
        facebookId: true,
        tiktokId: true,
        name: true,
      },
    })

    // Opt-out conferido AGORA, nao so na montagem da lista: entre o inicio e
    // este lote podem ter se passado minutos, e "pare de me mandar" tem que
    // valer da proxima mensagem em diante (LGPD).
    if (!contato || contato.optOut) {
      await marcarFalha(linha.id, "Contato pediu para não receber (opt-out)")
      continue
    }

    const destino = destinatarioDoCanal(campanha.channel, contato)
    if (!destino) {
      await marcarFalha(linha.id, `Contato sem identificador para ${campanha.channel}`)
      continue
    }

    try {
      const r = usaTemplate
        ? await adapter.sendTemplate(
            destino,
            campanha.template.name,
            [contato.name ?? ""],
            campanha.template.language
          )
        : await adapter.sendText(destino, campanha.content || campanha.template.body)

      if (r.success) {
        await prisma.broadcastRecipient.update({
          where: { id: linha.id },
          data: { status: "sent", externalId: r.externalId ?? null, sentAt: new Date() },
        })
        await prisma.broadcast.update({
          where: { id: broadcastId },
          data: { sentCount: { increment: 1 } },
        })
      } else {
        await marcarFalha(linha.id, r.error || "O canal recusou a mensagem")
      }
    } catch (e) {
      // Rede caindo no meio do lote nao pode deixar a linha presa em `sending`:
      // ela nunca mais seria reservada e a campanha jamais concluiria.
      await marcarFalha(linha.id, e instanceof Error ? e.message : "Falha de rede")
    }
  }

  return progresso(broadcastId, "sending")
}

async function marcarFalha(recipientId: string, motivo: string) {
  const linha = await prisma.broadcastRecipient.update({
    where: { id: recipientId },
    data: { status: "failed", errorMessage: motivo },
    select: { broadcastId: true },
  })
  await prisma.broadcast.update({
    where: { id: linha.broadcastId },
    data: { failedCount: { increment: 1 } },
  })
}

export async function progresso(
  broadcastId: string,
  status: string
): Promise<ProgressoDoDisparo> {
  const [total, enviados, falhas, restantes] = await Promise.all([
    prisma.broadcastRecipient.count({ where: { broadcastId } }),
    prisma.broadcastRecipient.count({ where: { broadcastId, status: "sent" } }),
    prisma.broadcastRecipient.count({ where: { broadcastId, status: "failed" } }),
    prisma.broadcastRecipient.count({ where: { broadcastId, status: "pending" } }),
  ])
  return {
    status,
    total,
    enviados,
    falhas,
    restantes,
    concluida: status === "completed" || (restantes === 0 && total > 0),
  }
}
