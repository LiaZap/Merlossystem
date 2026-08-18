/**
 * Mescla o que esta na tela com o que o servidor acabou de mandar.
 *
 * Existe como funcao pura, fora do componente, porque e a logica mais facil de
 * quebrar do chat e a mais dificil de conferir no olho: envolve mensagem
 * otimista sem id do banco, historico paginado que nao pode ser descartado, e
 * status de entrega que muda por webhook depois de a mensagem existir.
 *
 * O que substituir a lista inteira (o comportamento anterior) causava:
 *   - a bolha otimista piscava e desaparecia ate o proximo ciclo;
 *   - o historico trazido por "mensagens anteriores" sumia em 5 segundos;
 *   - toda bolha remontava, atropelando quem estava lendo.
 */

export type MensagemMesclavel = {
  id: string
  content: string | null
  senderType: string
  createdAt: string
  /** Otimista: existe na tela e ainda nao no banco. */
  pendente?: boolean
}

/**
 * @param atuais   o que ja esta na tela (inclui otimistas e historico antigo)
 * @param recentes a pagina que o servidor devolveu
 */
export function mesclarMensagens<T extends MensagemMesclavel>(
  atuais: T[],
  recentes: T[]
): T[] {
  const porId = new Map<string, T>()
  for (const m of atuais) porId.set(m.id, m)
  // A versao do servidor vence a local: `sent` -> `delivered` -> `read` chega
  // por webhook, entao o que veio agora e mais novo que o que temos.
  for (const m of recentes) porId.set(m.id, m)

  return Array.from(porId.values())
    .filter((m) => !(m.pendente && confirmadaPeloServidor(m, recentes)))
    .sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  )
}

/**
 * A otimista ja voltou do servidor?
 *
 * Comparamos conteudo + remetente porque a otimista NAO tem o id do banco: ela
 * nasceu no navegador. Sem descartar, a mesma mensagem aparece duas vezes
 * (a bolha local e a real) e a atendente acha que enviou em dobro.
 *
 * Nota interna nao e comparada com mensagem de canal: as duas podem ter o mesmo
 * texto e sao registros diferentes.
 */
function confirmadaPeloServidor(
  otimista: MensagemMesclavel,
  recentes: MensagemMesclavel[]
): boolean {
  return recentes.some(
    (r) =>
      !r.pendente &&
      r.senderType === otimista.senderType &&
      r.content === otimista.content
  )
}
