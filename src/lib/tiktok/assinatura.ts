import { createHmac, timingSafeEqual } from "node:crypto"
import { ASSINATURA_INCLUI_CAMINHO } from "./config"

/**
 * Assinatura das requisicoes ao TikTok Shop.
 *
 * Regra (ver o cabecalho de `config.ts` para o que esta confirmado):
 *   1. pega os parametros da query, MENOS `sign` e `access_token`;
 *   2. ordena por chave, em ordem alfabetica;
 *   3. concatena como `{chave}{valor}`, sem separador;
 *   4. envolve com o app_secret: `secret + [caminho] + concatenado + secret`;
 *   5. HMAC-SHA256 com o app_secret como chave;
 *   6. hex MAIUSCULO.
 *
 * `sign` sai porque e o resultado, e `access_token` sai porque muda a cada
 * renovacao — assinar sobre ele quebraria toda chamada logo apos um refresh.
 */

export type Params = Record<string, string | number | undefined>

/** Parametros que nunca entram na string assinada. */
const EXCLUIDOS = new Set(["sign", "access_token"])

/**
 * Monta a string que vai ser assinada. Exportada porque e o unico ponto da
 * integracao que da para verificar sem chamar o TikTok.
 */
export function montarStringAssinada(
  caminho: string,
  params: Params,
  appSecret: string
): string {
  const concatenado = Object.entries(params)
    .filter(([chave, valor]) => !EXCLUIDOS.has(chave) && valor !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([chave, valor]) => `${chave}${valor}`)
    .join("")

  const miolo = ASSINATURA_INCLUI_CAMINHO ? `${caminho}${concatenado}` : concatenado
  return `${appSecret}${miolo}${appSecret}`
}

/** Assinatura de uma requisicao, em hex maiusculo. */
export function assinar(caminho: string, params: Params, appSecret: string): string {
  return createHmac("sha256", appSecret)
    .update(montarStringAssinada(caminho, params, appSecret), "utf8")
    .digest("hex")
    .toUpperCase()
}

/**
 * Parametros prontos para a chamada: os informados + os obrigatorios + `sign`.
 *
 * `timestamp` entra em SEGUNDOS. Recebe o relogio por parametro para o teste
 * poder fixar o valor — assinatura com horario variavel nao se verifica.
 */
export function paramsAssinados(
  caminho: string,
  params: Params,
  cfg: { appKey: string; appSecret: string },
  agoraMs: number = Date.now()
): Record<string, string> {
  const completos: Params = {
    ...params,
    app_key: cfg.appKey,
    timestamp: Math.floor(agoraMs / 1000),
    sign_method: "HmacSHA256",
  }

  const sign = assinar(caminho, completos, cfg.appSecret)

  const saida: Record<string, string> = {}
  for (const [k, v] of Object.entries(completos)) {
    if (v !== undefined) saida[k] = String(v)
  }
  saida.sign = sign
  return saida
}

// ---------------------------------------------------------------------------
// Webhook
// ---------------------------------------------------------------------------

/**
 * Assinatura do webhook do TikTok Shop.
 *
 * Diferente da assinatura de requisicao: aqui e HMAC-SHA256 de
 * `app_key + corpo cru`, com o app_secret como chave, em hex MINUSCULO, e vem
 * no header `Authorization`.
 *
 * O corpo tem que ser o CRU — se a rota fizer `req.json()` antes, os bytes
 * originais se perdem e a assinatura nunca bate.
 */
export function verificarAssinaturaWebhook(
  corpoCru: string,
  assinaturaRecebida: string | null,
  cfg: { appKey: string; appSecret: string }
): { ok: true } | { ok: false; motivo: string } {
  if (!assinaturaRecebida) return { ok: false, motivo: "assinatura ausente" }

  const esperada = createHmac("sha256", cfg.appSecret)
    .update(`${cfg.appKey}${corpoCru}`, "utf8")
    .digest("hex")

  const a = Buffer.from(assinaturaRecebida.trim().toLowerCase(), "utf8")
  const b = Buffer.from(esperada, "utf8")
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, motivo: "assinatura invalida" }
  }
  return { ok: true }
}
