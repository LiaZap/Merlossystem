import type { PrismaClient } from "@prisma/client"

/**
 * Soft delete aplicado no cliente do Prisma, nao em cada consulta.
 *
 * A alternativa era escrever `isDeleted: false` nas ~50 consultas destes
 * models. Esquecer UMA faz registro excluido reaparecer na tela — e o tipo de
 * erro que ninguem descobre revisando, so quando o cliente pergunta por que o
 * contato que ele apagou voltou. Aqui e um lugar so, e rota nova ja nasce
 * filtrada sem ninguem precisar lembrar.
 *
 * Regra: se quem chamou NAO mencionou `isDeleted`, entra `isDeleted: false`.
 * Se mencionou, respeita — e a saida para telas de auditoria ("o que foi
 * excluido, por quem") sem precisar de um segundo cliente.
 */

/** Models com coluna `is_deleted`. Fora daqui, nada muda. */
export const MODELS_SOFT_DELETE = [
  "Contact",
  "Deal",
  "MediaFile",
  "Lookbook",
  "KnowledgeArticle",
  "QuickReply",
  "WhatsappTemplate",
  "Broadcast",
] as const

const ALVO = new Set<string>(MODELS_SOFT_DELETE)

/**
 * Operacoes filtradas.
 *
 * `findUnique` fica de FORA de proposito: o `where` dele so aceita campo
 * unico, e injetar `isDeleted` ali e erro de runtime do Prisma. Um teste
 * proibe `findUnique` nestes models justamente para o buraco nao existir.
 */
const OPERACOES = ["findMany", "findFirst", "findFirstOrThrow", "count", "aggregate"] as const

type Args = { where?: Record<string, unknown> } | undefined

function comFiltro(args: Args): Args {
  const where = args?.where ?? {}
  // Quem pediu explicitamente manda: `isDeleted: true` lista o que foi
  // excluido, `isDeleted: undefined` traz tudo.
  if ("isDeleted" in where) return args
  return { ...(args ?? {}), where: { ...where, isDeleted: false } }
}

/** Envolve o cliente. Use SEMPRE o retorno, nunca o cliente cru. */
export function comSoftDelete<T extends PrismaClient>(cliente: T) {
  const porOperacao = Object.fromEntries(
    OPERACOES.map((op) => [
      op,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ({ model, args, query }: { model: string; args: any; query: (a: any) => any }) =>
        query(ALVO.has(model) ? comFiltro(args) : args),
    ])
  )

  return cliente.$extends({
    name: "soft-delete",
    query: { $allModels: porOperacao },
  })
}
