import { createHmac, timingSafeEqual } from "node:crypto"

/**
 * Autenticacao das rotas que o middleware nao protege por sessao:
 * webhooks (quem chama e a Meta / TikTok / gateway) e crons.
 *
 * Regra: sem segredo configurado, a rota REJEITA. Um webhook que aceita
 * qualquer POST quando a variavel esta vazia e pior do que um webhook fora do
 * ar — o fora do ar aparece no monitoramento, o aberto nao.
 */

export type ResultadoAuth = { ok: true } | { ok: false; motivo: string; status: 401 | 403 }

const negar = (motivo: string, status: 401 | 403 = 401): ResultadoAuth => ({
  ok: false,
  motivo,
  status,
})

/** Comparacao em tempo constante; strings de tamanhos diferentes nunca batem. */
function iguaisEmTempoConstante(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8")
  const bufB = Buffer.from(b, "utf8")
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

// ---------------------------------------------------------------------------
// Meta (WhatsApp, Instagram, Facebook)
// ---------------------------------------------------------------------------

/**
 * Valida o header `X-Hub-Signature-256` que a Meta envia em todo POST:
 * `sha256=<hmac_sha256(corpo_cru, META_APP_SECRET)>`.
 *
 * IMPORTANTE: o HMAC e sobre o corpo CRU. Se a rota fizer `req.json()` antes,
 * o corpo ja foi consumido e um `JSON.stringify` de volta nao reproduz os bytes
 * originais (espacos, ordem, unicode) — a assinatura falha. Sempre
 * `await req.text()` primeiro e `JSON.parse` depois.
 */
export function verificarAssinaturaMeta(corpoCru: string, assinatura: string | null): ResultadoAuth {
  const segredo = process.env.META_APP_SECRET
  if (!segredo) {
    return negar("META_APP_SECRET nao configurado no servidor", 403)
  }
  if (!assinatura?.startsWith("sha256=")) {
    return negar("Assinatura ausente ou em formato invalido")
  }

  const esperado = "sha256=" + createHmac("sha256", segredo).update(corpoCru, "utf8").digest("hex")
  if (!iguaisEmTempoConstante(assinatura, esperado)) {
    return negar("Assinatura invalida")
  }
  return { ok: true }
}

/**
 * Verificacao inicial do webhook (GET com `hub.challenge`).
 * Cada canal tem o proprio token — antes os tres compartilhavam
 * WHATSAPP_VERIFY_TOKEN, o que fazia o token do WhatsApp valer para
 * Instagram e Facebook.
 */
const VERIFY_TOKEN_ENV = {
  whatsapp: "WHATSAPP_VERIFY_TOKEN",
  instagram: "INSTAGRAM_VERIFY_TOKEN",
  facebook: "FACEBOOK_VERIFY_TOKEN",
  tiktok: "TIKTOK_VERIFY_TOKEN",
} as const

export function verificarChallenge(
  canal: keyof typeof VERIFY_TOKEN_ENV,
  url: string
): { ok: true; challenge: string } | { ok: false; motivo: string; status: 403 } {
  const esperado = process.env[VERIFY_TOKEN_ENV[canal]]
  if (!esperado) {
    return { ok: false, motivo: `${VERIFY_TOKEN_ENV[canal]} nao configurado`, status: 403 }
  }

  const { searchParams } = new URL(url)
  const mode = searchParams.get("hub.mode")
  const token = searchParams.get("hub.verify_token")
  const challenge = searchParams.get("hub.challenge")

  if (mode !== "subscribe" || !token || !challenge) {
    return { ok: false, motivo: "Parametros de verificacao ausentes", status: 403 }
  }
  if (!iguaisEmTempoConstante(token, esperado)) {
    return { ok: false, motivo: "Token de verificacao invalido", status: 403 }
  }
  return { ok: true, challenge }
}

// ---------------------------------------------------------------------------
// uazapi
// ---------------------------------------------------------------------------

/**
 * O uazapi nao assina o corpo como a Meta e o TikTok Shop: o que ele oferece e
 * uma URL de webhook configurada por instancia. Entao a autenticacao e por
 * segredo compartilhado.
 *
 * Aceita nos dois lugares porque o painel pode nao deixar definir header:
 *   1. header `x-uazapi-secret` — preferido;
 *   2. `?segredo=` na URL — ultimo recurso, o valor VAZA em log de acesso e
 *      historico de proxy. Se o painel aceitar header, use o header.
 *
 * ponytail: segredo compartilhado, nao HMAC. Trocar por assinatura se o uazapi
 * passar a assinar o corpo.
 */
export function verificarWebhookUazapi(headers: Headers, url: string): ResultadoAuth {
  const segredo = process.env.UAZAPI_WEBHOOK_SECRET
  if (!segredo) {
    return negar("UAZAPI_WEBHOOK_SECRET nao configurado no servidor", 403)
  }
  const recebido =
    headers.get("x-uazapi-secret") || new URL(url).searchParams.get("segredo") || ""
  if (!recebido) return negar("Segredo do webhook ausente")
  if (!iguaisEmTempoConstante(recebido, segredo)) return negar("Segredo do webhook invalido")
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Gateway de pagamento
// ---------------------------------------------------------------------------

/**
 * Segredo compartilhado, configurado no painel do gateway e enviado de volta
 * em header. Cobre o formato do Asaas (`asaas-access-token`) e o header
 * generico usado pelo mock.
 *
 * ponytail: segredo compartilhado, nao HMAC. Trocar por verificacao de
 * assinatura do provedor real (Mercado Pago manda `x-signature` com ts+v1)
 * quando `getPaymentProvider()` deixar de devolver o mock.
 */
export function verificarWebhookPagamento(headers: Headers): ResultadoAuth {
  const segredo = process.env.PAYMENT_WEBHOOK_SECRET
  if (!segredo) {
    return negar("PAYMENT_WEBHOOK_SECRET nao configurado no servidor", 403)
  }
  const recebido = headers.get("x-webhook-secret") || headers.get("asaas-access-token")
  if (!recebido) return negar("Segredo do webhook ausente")
  if (!iguaisEmTempoConstante(recebido, segredo)) return negar("Segredo do webhook invalido")
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Cron
// ---------------------------------------------------------------------------

/**
 * Rotas disparadas por agendador (`/api/alerts/check`, `/api/transcription`).
 * Nao tem sessao: autenticam com `Authorization: Bearer <CRON_SECRET>`.
 */
export function verificarSegredoCron(headers: Headers): ResultadoAuth {
  const segredo = process.env.CRON_SECRET
  if (!segredo) {
    return negar("CRON_SECRET nao configurado no servidor", 403)
  }
  const header = headers.get("authorization") || ""
  const recebido = header.startsWith("Bearer ") ? header.slice(7) : ""
  if (!recebido) return negar("Header Authorization ausente")
  if (!iguaisEmTempoConstante(recebido, segredo)) return negar("CRON_SECRET invalido")
  return { ok: true }
}
