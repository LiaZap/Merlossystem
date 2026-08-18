/**
 * TikTok Shop Open API — pontos de contato com o servico externo.
 *
 * CONFIRMADO (partner.tiktokshop.com e implementacoes de referencia,
 * consultado em 17/08/2026):
 *   - base: https://open-api.tiktokglobalshop.com
 *   - assinatura HMAC-SHA256, chave = app_secret
 *   - a string assinada concatena os parametros ORDENADOS como {chave}{valor}
 *   - `sign` e `access_token` ficam de FORA da string assinada
 *   - o app_secret envolve a string: app_secret + ... + app_secret
 *   - resultado em hex MAIUSCULO, enviado no parametro `sign`
 *   - `sign_method` = "HmacSHA256"
 *   - webhook: HMAC-SHA256 de (app_key + corpo cru), chave = app_secret,
 *     hex minusculo, no header Authorization
 *
 * NAO CONFIRMADO — ver `ASSINATURA_INCLUI_CAMINHO` abaixo:
 *   - se o caminho da rota entra na string assinada. A documentacao oficial e
 *     truncada no fetch e as implementacoes da comunidade divergem: umas fazem
 *     `secret + path + params + secret`, outras `secret + params + secret`.
 *   - os caminhos exatos de cada endpoint e a versao vigente
 *
 * Como no Bling, a incerteza esta CONCENTRADA aqui: quando alguem confirmar na
 * documentacao oficial, e este arquivo que muda.
 */

export const TIKTOK_API_BASE = "https://open-api.tiktokglobalshop.com"

/**
 * ⚠️ O UNICO PONTO REALMENTE INCERTO DA INTEGRACAO.
 *
 * `true`  -> app_secret + caminho + params + app_secret
 * `false` -> app_secret + params + app_secret
 *
 * Errar aqui faz TODA chamada voltar com erro de assinatura — e o sintoma e
 * claro e imediato, nao silencioso. Se as chamadas falharem com erro de sign,
 * inverta este valor antes de procurar em qualquer outro lugar.
 */
export const ASSINATURA_INCLUI_CAMINHO = true

/** ⚠️ CONFERIR os caminhos e a versao na documentacao oficial. */
export const TIKTOK_ENDPOINTS = {
  /** Tela onde o lojista autoriza o app (dominio de servicos, nao o de API). */
  autorizar: "https://services.tiktokshop.com/open/authorize",
  /** Troca do auth_code por token. */
  token: "https://auth.tiktok-shops.com/api/v2/token/get",
  /** Renovacao. */
  renovar: "https://auth.tiktok-shops.com/api/v2/token/refresh",
  /** Lojas autorizadas para o app — de onde sai o shop_cipher. */
  lojasAutorizadas: "/authorization/202309/shops",
  /** Busca de produtos. */
  produtos: "/product/202309/products/search",
  /** Busca de pedidos. */
  pedidos: "/order/202309/orders/search",
} as const

export const SIGN_METHOD = "HmacSHA256"

export type ConfigAppTikTok = {
  appKey: string
  appSecret: string
  redirectUri: string
}

export class TikTokConfigError extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = "TikTokConfigError"
  }
}

export function ehTikTokConfigError(e: unknown): e is TikTokConfigError {
  return e instanceof Error && e.name === "TikTokConfigError"
}

/**
 * Credenciais do APP (nao da loja). Ficam em ambiente porque sao unicas da
 * instalacao; o token do lojista vai cifrado no cofre.
 */
export function configDoApp(): ConfigAppTikTok {
  const appKey = process.env.TIKTOK_SHOP_APP_KEY
  const appSecret = process.env.TIKTOK_SHOP_APP_SECRET
  const redirectUri = process.env.TIKTOK_SHOP_REDIRECT_URI

  if (!appKey || !appSecret || !redirectUri) {
    throw new TikTokConfigError(
      "TikTok Shop nao configurado: faltam TIKTOK_SHOP_APP_KEY, TIKTOK_SHOP_APP_SECRET ou TIKTOK_SHOP_REDIRECT_URI"
    )
  }
  return { appKey, appSecret, redirectUri }
}
