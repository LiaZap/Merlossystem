import { createHmac, timingSafeEqual, randomBytes } from "node:crypto"
import { VALIDADE_STATE_MS } from "./config"

/**
 * O parametro `state` do OAuth.
 *
 * Sem `state` assinado, um callback forjado conecta a conta Bling do atacante
 * na rede da vitima — e como o Bling e conta unica (decisao 6), isso trocaria a
 * integracao das DUAS lojas de uma vez.
 *
 * O state carrega quem iniciou, quando, e um nonce; e vai assinado com
 * `NEXTAUTH_SECRET`, que ja e o segredo do servidor.
 */

type Conteudo = {
  /** Usuario que iniciou a autorizacao. */
  u: string
  /** Momento de emissao (ms). */
  t: number
  /** Aleatorio, para dois pedidos seguidos nao gerarem o mesmo state. */
  n: string
}

function chave(): string {
  const s = process.env.NEXTAUTH_SECRET
  if (!s) throw new Error("NEXTAUTH_SECRET nao configurada")
  return s
}

function assinar(payload: string): string {
  return createHmac("sha256", chave()).update(payload).digest("base64url")
}

export function criarState(usuarioId: string): string {
  const conteudo: Conteudo = {
    u: usuarioId,
    t: Date.now(),
    n: randomBytes(8).toString("base64url"),
  }
  const payload = Buffer.from(JSON.stringify(conteudo), "utf8").toString("base64url")
  return `${payload}.${assinar(payload)}`
}

export type StateValidado =
  | { ok: true; usuarioId: string }
  | { ok: false; motivo: string }

export function validarState(state: string | null): StateValidado {
  if (!state) return { ok: false, motivo: "state ausente" }

  const [payload, assinatura] = state.split(".")
  if (!payload || !assinatura) return { ok: false, motivo: "state malformado" }

  const esperada = assinar(payload)
  const a = Buffer.from(assinatura, "utf8")
  const b = Buffer.from(esperada, "utf8")
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, motivo: "assinatura do state invalida" }
  }

  let conteudo: Conteudo
  try {
    conteudo = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))
  } catch {
    return { ok: false, motivo: "conteudo do state ilegivel" }
  }

  // O code do Bling expira em 1 minuto; um state mais velho que isso so pode
  // ser reaproveitamento.
  if (Date.now() - conteudo.t > VALIDADE_STATE_MS) {
    return { ok: false, motivo: "state expirado" }
  }
  if (!conteudo.u) return { ok: false, motivo: "state sem usuario" }

  return { ok: true, usuarioId: conteudo.u }
}
