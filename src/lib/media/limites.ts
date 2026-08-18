/**
 * Limites de upload.
 *
 * A rota subia qualquer coisa: nao havia checagem de tamanho nem de tipo, e a
 * primeira linha ja era `await req.formData()` — que le o corpo INTEIRO na
 * memoria antes de qualquer verificacao. Uma pessoa logada mandando um arquivo
 * de 5 GB derrubava o processo, e nao precisava de ma intencao: um video do
 * celular moderno passa de 1 GB.
 *
 * Os tetos daqui sao os do canal mais restritivo, porque midia que nao cabe no
 * WhatsApp e midia que a atendente nao consegue enviar — aceitar o upload so
 * adiaria a frustracao para a hora do envio, com o arquivo ja ocupando o MinIO.
 */

export const TETO_POR_TIPO = {
  /** WhatsApp Cloud API: 5 MB por imagem. */
  image: 5 * 1024 * 1024,
  /** WhatsApp: 16 MB. */
  video: 16 * 1024 * 1024,
  /** WhatsApp: 16 MB. */
  audio: 16 * 1024 * 1024,
  /** WhatsApp: 100 MB. */
  document: 100 * 1024 * 1024,
} as const

export type TipoDeMidia = keyof typeof TETO_POR_TIPO

/** Maior teto — o corte grosso antes de ler o corpo da requisicao. */
export const TETO_ABSOLUTO = Math.max(...Object.values(TETO_POR_TIPO))

/**
 * Tipos aceitos, por extenso.
 *
 * Lista fechada, nao `image/*`: `image/svg+xml` e um documento XML que executa
 * script quando aberto no navegador, e a galeria mostra as imagens da loja
 * inline. Da mesma forma, `text/html` subido como "documento" viraria XSS
 * guardado se algum dia for servido sem `Content-Disposition: attachment`.
 */
export const MIMES_ACEITOS: Record<TipoDeMidia, readonly string[]> = {
  image: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  video: ["video/mp4", "video/quicktime", "video/webm", "video/3gpp"],
  audio: ["audio/mpeg", "audio/ogg", "audio/wav", "audio/webm", "audio/aac", "audio/mp4"],
  document: [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain",
    "text/csv",
  ],
}

export type Recusa = { erro: string; status: 400 | 413 | 415 }

/** Em que categoria o mime cai, ou `null` se nao aceitamos. */
export function tipoAceito(mimeType: string): TipoDeMidia | null {
  const limpo = mimeType.split(";")[0].trim().toLowerCase()
  for (const [tipo, aceitos] of Object.entries(MIMES_ACEITOS)) {
    if (aceitos.includes(limpo)) return tipo as TipoDeMidia
  }
  return null
}

function emMB(bytes: number): string {
  return `${Math.round((bytes / 1024 / 1024) * 10) / 10} MB`
}

/**
 * Corte grosso pelo cabecalho, ANTES de ler o corpo.
 *
 * `content-length` vem do cliente e pode mentir — por isso nao substitui a
 * checagem do tamanho real depois. Serve para o caso honesto e comum (arquivo
 * grande de verdade), evitando carregar centenas de MB na memoria so para
 * descobrir que nao cabem.
 */
export function recusaPeloCabecalho(headers: Headers): Recusa | null {
  const declarado = Number(headers.get("content-length"))
  if (!Number.isFinite(declarado) || declarado <= 0) return null
  if (declarado > TETO_ABSOLUTO) {
    return {
      erro: `Arquivo de ${emMB(declarado)}. O limite é ${emMB(TETO_ABSOLUTO)}.`,
      status: 413,
    }
  }
  return null
}

/** Checagem final, com o arquivo em maos. `null` = pode subir. */
export function recusaDoArquivo(arquivo: {
  size: number
  type: string
}): Recusa | null {
  const tipo = tipoAceito(arquivo.type)
  if (!tipo) {
    return {
      erro: `Tipo de arquivo não aceito${arquivo.type ? ` (${arquivo.type})` : ""}.`,
      status: 415,
    }
  }
  if (arquivo.size <= 0) {
    return { erro: "Arquivo vazio.", status: 400 }
  }
  if (arquivo.size > TETO_POR_TIPO[tipo]) {
    return {
      erro: `${emMB(arquivo.size)} excede o limite de ${emMB(TETO_POR_TIPO[tipo])} para ${tipo}.`,
      status: 413,
    }
  }
  return null
}
