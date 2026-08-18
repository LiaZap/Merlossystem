/**
 * So o que esta funcao precisa: rodar SQL parametrizado.
 *
 * Tipar como `Prisma.TransactionClient` prenderia a assinatura ao cliente
 * gerado, e o cliente daqui e ESTENDIDO (soft delete) — os dois tipos nao
 * batem. Pedir a capacidade, e nao o cliente inteiro, aceita os dois.
 */
type ExecutorSql = {
  $queryRaw: <T = unknown>(consulta: TemplateStringsArray, ...valores: unknown[]) => Promise<T>
}

/**
 * Numero do pedido — sequencial por loja e por mes.
 *
 * Antes era `MS{AA}{MM}-{4 digitos aleatorios}`. Com `@@unique([storeId,
 * orderNumber])`, dois sorteios iguais viram erro P2002 e o pedido do cliente
 * some com um 500 na tela da vendedora. E o sorteio colide MUITO antes do que
 * parece: em 10.000 valores, ~120 pedidos no mes ja dao mais de 50% de chance
 * de pelo menos uma colisao (paradoxo do aniversario).
 *
 * Sequencial tambem resolve um segundo problema, que so aparece com o Masc no
 * meio: quem confere a fila precisa saber se falta algum pedido. Com numero
 * aleatorio nao da para ver buraco na sequencia.
 */

/** `MS2608-CEN-0001` — mes, sigla da loja, sequencia. */
export function montarNumero(prefixo: string, sequencia: number): string {
  return `${prefixo}${String(sequencia).padStart(4, "0")}`
}

/** Sigla estavel de 3 letras a partir do nome da loja. */
export function siglaDaLoja(nome: string): string {
  // NFD separa o acento da letra, e [^a-zA-Z] leva o acento junto com
  // espaco e pontuacao: "Cerro Azul" -> CER, "Centro" -> CEN.
  const limpo = nome
    .normalize("NFD")
    .replace(/[^a-zA-Z]/g, "")
    .toUpperCase()
  return (limpo.slice(0, 3) || "LOJ").padEnd(3, "X")
}

/** Prefixo do mes corrente para uma loja: `MS2608-CEN-`. */
export function prefixoDoMes(nomeDaLoja: string, agora: Date): string {
  const ano = String(agora.getFullYear()).slice(-2)
  const mes = String(agora.getMonth() + 1).padStart(2, "0")
  return `MS${ano}${mes}-${siglaDaLoja(nomeDaLoja)}-`
}

/**
 * Proximo numero livre da loja neste mes.
 *
 * Pega o maior sufixo como NUMERO, via SQL. Ordenar por texto parece
 * equivalente e nao e: com `padStart(4)`, o pedido 10000 tem sufixo de 5
 * digitos, e "10000" vem ANTES de "9999" na ordem alfabetica. O maior lido
 * seria 9999 para sempre, o proximo calculado seria 10000 — que ja existe — e a
 * criacao de pedidos morreria com P2002 ate virar o mes.
 *
 * O `~ '^[0-9]+$'` descarta sufixo fora do padrao (importacao, pedido antigo)
 * em vez de deixar virar `NaN`. Antes o fallback era 1, que e justamente o
 * numero que ja existe — o chute reproduzia a colisao que queria evitar.
 *
 * Duas requisicoes simultaneas ainda podem ler o mesmo maior valor; quem chama
 * trata o P2002 e refaz a conta. O indice unico e a garantia final.
 */
export async function proximoNumero(
  db: ExecutorSql,
  storeId: string,
  nomeDaLoja: string,
  agora: Date
): Promise<string> {
  const prefixo = prefixoDoMes(nomeDaLoja, agora)
  // 1-based: o sufixo comeca logo depois do prefixo.
  const inicio = prefixo.length + 1

  // `substr(x, N)`, nao `substring(x from N)`: com o offset vindo como
  // parametro, o Postgres escolhe a variante de REGEX do `substring` e devolve
  // null em toda linha — o maior viraria 0 e todo pedido tentaria o numero 1.
  const [linha] = await db.$queryRaw<{ max: number | null }[]>`
    select max(substr(order_number, ${inicio})::int) as max
    from orders
    where store_id = ${storeId}
      and order_number like ${prefixo + "%"}
      and substr(order_number, ${inicio}) ~ '^[0-9]+$'
  `

  return montarNumero(prefixo, Number(linha?.max ?? 0) + 1)
}
