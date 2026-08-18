import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto"

/**
 * Cofre das credenciais de integracao.
 *
 * Token de Bling, TikTok Shop, Instagram e uazapi movimentam dinheiro e dados
 * de cliente. Nunca ficam em texto plano no banco: AES-256-GCM, chave em
 * `INTEGRATIONS_KEY`.
 *
 * GCM e nao CBC porque GCM autentica: se alguem editar o registro direto no
 * banco, a decifra falha em vez de devolver lixo silenciosamente.
 *
 * Formato gravado: `v1:<iv>:<tag>:<texto cifrado>`, tudo em base64url.
 * O prefixo de versao existe para permitir troca de chave sem adivinhar
 * formato antigo.
 */

const VERSAO = "v1"
const TAMANHO_IV = 12 // recomendado para GCM
const TAMANHO_CHAVE = 32 // AES-256

export class CofreError extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = "CofreError"
  }
}

/**
 * Use isto em vez de `instanceof CofreError` nas rotas.
 *
 * O bundler do Next pode instanciar o modulo mais de uma vez (server, RSC,
 * edge), e nesse caso a classe do erro lancado nao e a mesma que a importada —
 * `instanceof` da falso e o handler responde 500 generico em vez do 503 que
 * diz "servidor mal configurado". Comparar pelo nome atravessa a fronteira.
 */
export function ehCofreError(e: unknown): e is CofreError {
  return e instanceof Error && e.name === "CofreError"
}

/**
 * Chave do cofre. Lida a cada uso (nao em module scope) para o processo nao
 * subir com uma chave velha em memoria depois de uma rotacao.
 */
function chave(): Buffer {
  const bruta = process.env.INTEGRATIONS_KEY
  if (!bruta) {
    throw new CofreError(
      "INTEGRATIONS_KEY nao configurada. Gere com: openssl rand -hex 32"
    )
  }
  const buf = /^[0-9a-fA-F]{64}$/.test(bruta)
    ? Buffer.from(bruta, "hex")
    : Buffer.from(bruta, "base64")

  if (buf.length !== TAMANHO_CHAVE) {
    throw new CofreError(
      `INTEGRATIONS_KEY tem ${buf.length} bytes; precisa de ${TAMANHO_CHAVE}. Gere com: openssl rand -hex 32`
    )
  }
  return buf
}

/** Cifra um segredo para gravar no banco. */
export function cifrar(texto: string): string {
  const iv = randomBytes(TAMANHO_IV)
  const cipher = createCipheriv("aes-256-gcm", chave(), iv)
  const cifrado = Buffer.concat([cipher.update(texto, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()

  return [VERSAO, iv.toString("base64url"), tag.toString("base64url"), cifrado.toString("base64url")].join(":")
}

/**
 * Decifra um segredo do banco.
 *
 * Lanca em qualquer sinal de adulteracao — GCM verifica a tag antes de
 * devolver o conteudo. Nao existe "decifrou parcialmente".
 */
export function decifrar(guardado: string): string {
  const partes = guardado.split(":")
  if (partes.length !== 4) {
    throw new CofreError("Credencial em formato desconhecido")
  }

  const [versao, ivB64, tagB64, cifradoB64] = partes
  if (versao !== VERSAO) {
    throw new CofreError(`Versao de cofre nao suportada: ${versao}`)
  }

  try {
    const decipher = createDecipheriv("aes-256-gcm", chave(), Buffer.from(ivB64, "base64url"))
    decipher.setAuthTag(Buffer.from(tagB64, "base64url"))
    return Buffer.concat([
      decipher.update(Buffer.from(cifradoB64, "base64url")),
      decipher.final(),
    ]).toString("utf8")
  } catch (e) {
    if (e instanceof CofreError) throw e
    // Mensagem generica de proposito: distinguir "chave errada" de "dado
    // adulterado" so ajuda quem esta tentando adivinhar.
    throw new CofreError("Nao foi possivel decifrar a credencial (chave trocada ou dado adulterado)")
  }
}

/**
 * Credencial de um provedor: pares chave/valor (`access_token`,
 * `refresh_token`, `instance_token`...). Guardados como um JSON cifrado so.
 */
export type Credenciais = Record<string, string>

export function cifrarCredenciais(c: Credenciais): string {
  return cifrar(JSON.stringify(c))
}

export function decifrarCredenciais(guardado: string): Credenciais {
  const obj = JSON.parse(decifrar(guardado))
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
    throw new CofreError("Credencial decifrada nao e um objeto")
  }
  return obj as Credenciais
}

/**
 * Como o segredo aparece na tela: so o suficiente para o operador reconhecer
 * qual token esta ali. Nunca o valor.
 *
 *   "EAAG...9xKp" -> "••••9xKp"
 */
export function mascarar(valor: string): string {
  if (valor.length <= 4) return "••••"
  return "••••" + valor.slice(-4)
}

/**
 * Resumo publico de uma credencial — o que a API pode devolver.
 * Devolve as chaves presentes e o final de cada uma, nunca o conteudo.
 */
export function resumoPublico(guardado: string | null): Record<string, string> {
  if (!guardado) return {}
  try {
    const c = decifrarCredenciais(guardado)
    return Object.fromEntries(Object.entries(c).map(([k, v]) => [k, mascarar(v)]))
  } catch {
    // Credencial ilegivel (chave trocada, registro adulterado). A tela mostra
    // que existe algo gravado e ilegivel, sem derrubar a listagem inteira.
    return { erro: "ilegivel" }
  }
}

/** Comparacao em tempo constante, para segredo que chega por header. */
export function segredosIguais(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8")
  const bufB = Buffer.from(b, "utf8")
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}
