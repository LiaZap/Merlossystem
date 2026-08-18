import sharp from "sharp"
import { guardar, montarChave, ArmazenamentoError } from "./armazenamento"

/**
 * Upload de midia para o MinIO (ADR 0006).
 *
 * O que mudou em relacao ao Cloudinary, e vale saber:
 *
 * 1. **O thumbnail vira arquivo.** No Cloudinary ele era gerado por URL
 *    (`width=200&format=webp`) e nao ocupava espaco. MinIO guarda bytes e
 *    devolve bytes, entao o thumb e gerado aqui com `sharp` e salvo como um
 *    segundo objeto.
 * 2. **Video nao tem mais thumbnail.** O Cloudinary extraia um quadro; fazer o
 *    mesmo aqui exigiria ffmpeg no servidor. Preferi a regressao visivel a uma
 *    dependencia pesada — a tela ja trata `thumbnailUrl` nulo.
 * 3. **A URL nao e publica.** Ver `armazenamento.ts`.
 */

/** Miniatura quadrada. 200px e o que a galeria e o chat usam hoje. */
const LADO_THUMB = 200

export interface ResultadoUpload {
  /** Objeto no bucket. Vai para `media_files.file_key`. */
  chave: string
  /** Objeto da miniatura, quando gerada. */
  chaveThumb?: string
  bytes: number
  width?: number
  height?: number
  mimeType: string
}

/** URL que o sistema usa para exibir. Passa pela rota autenticada, nao pelo bucket. */
export function urlInterna(mediaFileId: string): string {
  return `/api/media/${mediaFileId}/raw`
}

export function urlInternaThumb(mediaFileId: string): string {
  return `/api/media/${mediaFileId}/raw?thumb=1`
}

/**
 * Miniatura de imagem. `null` para o que nao for imagem, ou se o arquivo nao
 * for decodificavel — thumb e conveniencia e nao pode derrubar o upload.
 */
async function gerarThumb(buffer: Buffer, mimeType: string): Promise<Buffer | null> {
  if (!mimeType.startsWith("image/")) return null
  try {
    return await sharp(buffer)
      .resize(LADO_THUMB, LADO_THUMB, { fit: "cover" })
      .webp({ quality: 80 })
      .toBuffer()
  } catch (e) {
    console.error("[Media] Falha ao gerar miniatura:", e)
    return null
  }
}

/** Dimensoes da imagem. Silencioso: nao saber o tamanho nao impede guardar. */
async function dimensoes(buffer: Buffer, mimeType: string) {
  if (!mimeType.startsWith("image/")) return {}
  try {
    const meta = await sharp(buffer).metadata()
    return { width: meta.width, height: meta.height }
  } catch {
    return {}
  }
}

export async function subirArquivo(
  buffer: Buffer,
  opcoes: { storeId: string; pasta: string; nomeOriginal?: string; mimeType: string }
): Promise<ResultadoUpload> {
  const { storeId, pasta, nomeOriginal, mimeType } = opcoes

  const chave = montarChave(storeId, pasta, nomeOriginal)
  await guardar(chave, buffer, mimeType)

  let chaveThumb: string | undefined
  const thumb = await gerarThumb(buffer, mimeType)
  if (thumb) {
    chaveThumb = `${chave}.thumb.webp`
    await guardar(chaveThumb, thumb, "image/webp")
  }

  return {
    chave,
    chaveThumb,
    bytes: buffer.length,
    ...(await dimensoes(buffer, mimeType)),
    mimeType,
  }
}

/**
 * Baixa de uma URL e guarda. E o caminho do webhook: a Meta entrega a midia
 * como URL (ou como data URL, quando a rota ja baixou os bytes).
 */
export async function subirDeUrl(
  url: string,
  opcoes: { storeId: string; pasta: string; mimeType?: string }
): Promise<ResultadoUpload> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new ArmazenamentoError(`Nao foi possivel baixar a midia: HTTP ${res.status}`)
  }

  const buffer = Buffer.from(await res.arrayBuffer())
  const mimeType =
    opcoes.mimeType || res.headers.get("content-type") || "application/octet-stream"

  return subirArquivo(buffer, { storeId: opcoes.storeId, pasta: opcoes.pasta, mimeType })
}

export function getFileTypeFromMime(mimeType: string): "image" | "video" | "audio" | "document" {
  if (mimeType.startsWith("image/")) return "image"
  if (mimeType.startsWith("video/")) return "video"
  if (mimeType.startsWith("audio/")) return "audio"
  return "document"
}
