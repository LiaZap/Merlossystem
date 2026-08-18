import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

/**
 * Armazenamento de midia — MinIO (ADR 0006).
 *
 * Usa o SDK da S3, nao o do MinIO: o mesmo codigo fala com o MinIO daqui, com
 * S3, R2 ou Backblaze depois. Trocar de provedor vira mudanca de variavel de
 * ambiente, nao reescrita.
 *
 * O bucket e **privado**. O binario nunca tem URL publica: quem ve pelo sistema
 * passa por `/api/media/[id]/raw`, que exige sessao e escopo de loja; quem
 * precisa buscar de fora (a Meta, ao enviar midia para a cliente) recebe URL
 * assinada com validade curta.
 */

export class ArmazenamentoError extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = "ArmazenamentoError"
  }
}

/** Erro cruza o limite do bundle do Next; `instanceof` nao sobrevive. */
export function ehArmazenamentoError(e: unknown): e is ArmazenamentoError {
  return e instanceof Error && e.name === "ArmazenamentoError"
}

type Config = { endpoint: string; bucket: string; accessKey: string; secretKey: string; regiao: string }

function config(): Config {
  const endpoint = process.env.S3_ENDPOINT
  const bucket = process.env.S3_BUCKET
  const accessKey = process.env.S3_ACCESS_KEY
  const secretKey = process.env.S3_SECRET_KEY

  if (!endpoint || !bucket || !accessKey || !secretKey) {
    throw new ArmazenamentoError(
      "Armazenamento nao configurado: faltam S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY ou S3_SECRET_KEY"
    )
  }
  return { endpoint, bucket, accessKey, secretKey, regiao: process.env.S3_REGION || "us-east-1" }
}

let cliente: S3Client | null = null
let clienteDe = ""

function s3(cfg: Config): S3Client {
  // Recria se o endpoint mudou (troca de env em teste); senao reusa a conexao.
  if (cliente && clienteDe === cfg.endpoint) return cliente
  cliente = new S3Client({
    endpoint: cfg.endpoint,
    region: cfg.regiao,
    credentials: { accessKeyId: cfg.accessKey, secretAccessKey: cfg.secretKey },
    // MinIO nao serve bucket como subdominio: sem isto a URL vira
    // `bucket.localhost` e nao resolve.
    forcePathStyle: true,
  })
  clienteDe = cfg.endpoint
  return cliente
}

/**
 * Chave do objeto: `loja/pasta/uuid.ext`.
 *
 * A loja entra no CAMINHO de proposito — auditoria, cota por loja e limpeza
 * ficam possiveis sem consultar o banco.
 */
export function montarChave(storeId: string, pasta: string, nomeOriginal?: string): string {
  const ext = nomeOriginal?.match(/\.([a-zA-Z0-9]{1,8})$/)?.[1]?.toLowerCase() ?? "bin"
  const limpa = pasta.replace(/[^a-z0-9-]/gi, "").toLowerCase() || "general"
  return `${storeId}/${limpa}/${crypto.randomUUID()}.${ext}`
}

export async function guardar(
  chave: string,
  corpo: Buffer,
  mimeType: string
): Promise<void> {
  const cfg = config()
  await s3(cfg).send(
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: chave,
      Body: corpo,
      ContentType: mimeType,
    })
  )
}

/** Bytes do objeto, para a rota autenticada servir. */
export async function ler(chave: string): Promise<{ corpo: Buffer; mimeType: string }> {
  const cfg = config()
  const r = await s3(cfg).send(new GetObjectCommand({ Bucket: cfg.bucket, Key: chave }))
  if (!r.Body) throw new ArmazenamentoError(`Objeto sem corpo: ${chave}`)

  const bytes = await r.Body.transformToByteArray()
  return {
    corpo: Buffer.from(bytes),
    mimeType: r.ContentType ?? "application/octet-stream",
  }
}

export async function apagar(chave: string): Promise<void> {
  const cfg = config()
  await s3(cfg).send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: chave }))
}

/**
 * URL temporaria para quem esta FORA do sistema buscar o arquivo.
 *
 * Existe por um motivo so: ao enviar midia, quem baixa e a Meta/uazapi, e eles
 * nao tem sessao nossa. Fora desse caso, use a rota autenticada.
 *
 * TTL curto de proposito — a URL e um segredo enquanto vale, e ela viaja para
 * fora do nosso perimetro.
 */
export async function urlAssinada(chave: string, segundos = 600): Promise<string> {
  const cfg = config()
  return getSignedUrl(s3(cfg), new GetObjectCommand({ Bucket: cfg.bucket, Key: chave }), {
    expiresIn: segundos,
  })
}
