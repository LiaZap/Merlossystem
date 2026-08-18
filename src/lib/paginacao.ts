/**
 * Limites de paginacao vindos da query string.
 *
 * O padrao espalhado pelas rotas era `parseInt(searchParams.get("limit") || "30")`,
 * com dois furos, os dois acionaveis por qualquer pessoa logada:
 *
 *   ?limit=999999  -> o Postgres monta a lista inteira em memoria e o Next
 *                     serializa tudo em JSON. Com histórico de verdade isso
 *                     derruba o processo — e nao e ataque, e um numero digitado.
 *   ?limit=abc     -> `parseInt` devolve NaN, que vira `take: NaN` no Prisma.
 *   ?limit=-5      -> `take` negativo inverte a ordem no Prisma, silenciosamente.
 *   ?page=0        -> `skip: -limit`, que o Prisma recusa com erro cru.
 *
 * Um numero fora da faixa nao e erro do usuario: e grampeado ao limite. Recusar
 * com 400 so trocaria uma falha por outra na tela de quem esta trabalhando.
 */

/** Teto absoluto. Nenhuma rota devolve mais que isto de uma vez. */
export const LIMITE_MAXIMO = 100

/**
 * @param valor  o que veio na query string (`null` quando ausente)
 * @param padrao quantos itens a rota devolve sem pedido explicito
 */
export function limiteDaPagina(valor: string | null, padrao: number): number {
  // Ausente e vazio caem no padrao da rota, e a checagem tem que vir ANTES do
  // `Number`: `Number(null)` e `Number("")` valem 0, que passa por
  // `Number.isFinite` e sairia grampeado em 1 — o caso mais comum de todos
  // (nenhum parametro na URL) devolveria um item por pagina.
  if (valor === null || valor.trim() === "") return padrao

  const n = Number(valor)
  if (!Number.isFinite(n)) return padrao
  const inteiro = Math.trunc(n)
  if (inteiro < 1) return 1
  return Math.min(inteiro, LIMITE_MAXIMO)
}

/** Pagina 1 em diante. Fora disso, 1. */
export function paginaAtual(valor: string | null): number {
  if (valor === null || valor.trim() === "") return 1
  const n = Number(valor)
  if (!Number.isFinite(n)) return 1
  return Math.max(1, Math.trunc(n))
}

/** Quantos registros pular. Nunca negativo. */
export function pular(pagina: number, limite: number): number {
  return (paginaAtual(String(pagina)) - 1) * limite
}
