/**
 * Envio de midia pelo chat, do lado do navegador.
 *
 * Fora do ChatWindow porque sao duas etapas independentes — subir o arquivo e
 * mandar a mensagem — e cada uma falha por motivo proprio: o upload pode ser
 * recusado por tamanho ou tipo (`lib/media/limites.ts`), e o envio pode ser
 * recusado pelo canal. Tratar as duas juntas dentro do componente escondia qual
 * das duas quebrou.
 */

export type ResultadoMidia = { ok: true } | { ok: false; erro: string }

/** Sobe o arquivo e manda na conversa. */
export async function subirEEnviar(
  conversationId: string,
  arquivo: File
): Promise<ResultadoMidia> {
  const form = new FormData()
  form.append("file", arquivo)
  form.append("folder", "chat")

  const upload = await fetch("/api/media/upload", { method: "POST", body: form })
  if (!upload.ok) {
    const erro = await upload.json().catch(() => ({}))
    // A mensagem do servidor e especifica ("5,2 MB excede o limite de 5 MB para
    // image"); repassar e melhor do que um "erro ao enviar" generico.
    return { ok: false, erro: erro.error || "Não foi possível enviar o arquivo." }
  }

  const salvo = await upload.json()
  return enviarDaBiblioteca(conversationId, [salvo.id])
}

/** Manda arquivos que ja estao na galeria da loja. */
export async function enviarDaBiblioteca(
  conversationId: string,
  mediaFileIds: string[],
  legenda?: string
): Promise<ResultadoMidia> {
  const res = await fetch("/api/media/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conversationId, mediaFileIds, caption: legenda }),
  })
  if (!res.ok) {
    const erro = await res.json().catch(() => ({}))
    return {
      ok: false,
      // O arquivo ESTA salvo; quem falhou foi a entrega. Dizer so "erro" faria
      // a atendente subir o mesmo arquivo de novo.
      erro: erro.error || "Arquivo salvo, mas o canal recusou a mensagem.",
    }
  }
  return { ok: true }
}
