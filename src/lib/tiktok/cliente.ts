import { prisma } from "@/lib/db/prisma"
import { cifrarCredenciais, decifrarCredenciais, type Credenciais } from "@/lib/cofre"
import { TIKTOK_API_BASE, TIKTOK_ENDPOINTS, configDoApp, TikTokConfigError } from "./config"
import { paramsAssinados } from "./assinatura"

/**
 * Cliente do TikTok Shop — leitura apenas.
 *
 * Mesma regra do Bling: enquanto a fonte da verdade de pedido e estoque nao
 * estiver definida com o Masc (decisao 8 de docs/integracoes.md), escrever no
 * e-commerce cria divergencia. Nao ha metodo de escrita aqui.
 */

export class TikTokError extends Error {
  constructor(
    mensagem: string,
    readonly status?: number
  ) {
    super(mensagem)
    this.name = "TikTokError"
  }
}

export function ehTikTokError(e: unknown): e is TikTokError {
  return e instanceof Error && e.name === "TikTokError"
}

export type TokensTikTok = {
  access_token: string
  refresh_token: string
  /** Identificador da loja no TikTok, exigido nas chamadas. */
  shop_cipher?: string
  shop_id?: string
  expira_em: string
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

function montarTokens(dados: Record<string, unknown>): TokensTikTok {
  // O TikTok embrulha a resposta em `data`.
  const corpo = (dados.data ?? dados) as Record<string, unknown>
  const access = corpo.access_token
  const refresh = corpo.refresh_token
  if (typeof access !== "string" || typeof refresh !== "string") {
    throw new TikTokError("Resposta de token sem access_token/refresh_token")
  }
  const segundos =
    typeof corpo.access_token_expire_in === "number"
      ? corpo.access_token_expire_in
      : 7 * 24 * 3600
  return {
    access_token: access,
    refresh_token: refresh,
    expira_em: new Date(Date.now() + segundos * 1000).toISOString(),
  }
}

/** Troca o `auth_code` do callback por tokens. */
export async function trocarCodePorTokens(authCode: string): Promise<TokensTikTok> {
  const cfg = configDoApp()
  const url = new URL(TIKTOK_ENDPOINTS.token)
  url.searchParams.set("app_key", cfg.appKey)
  url.searchParams.set("app_secret", cfg.appSecret)
  url.searchParams.set("auth_code", authCode)
  url.searchParams.set("grant_type", "authorized_code")

  const res = await fetch(url, { headers: { Accept: "application/json" } })
  const dados = await res.json().catch(() => ({}))
  if (!res.ok || dados?.code) {
    throw new TikTokError(dados?.message || "Falha ao trocar o auth_code", res.status)
  }
  return montarTokens(dados)
}

export async function renovarTokens(refreshToken: string): Promise<TokensTikTok> {
  const cfg = configDoApp()
  const url = new URL(TIKTOK_ENDPOINTS.renovar)
  url.searchParams.set("app_key", cfg.appKey)
  url.searchParams.set("app_secret", cfg.appSecret)
  url.searchParams.set("refresh_token", refreshToken)
  url.searchParams.set("grant_type", "refresh_token")

  const res = await fetch(url, { headers: { Accept: "application/json" } })
  const dados = await res.json().catch(() => ({}))
  if (!res.ok || dados?.code) {
    throw new TikTokError(dados?.message || "Falha ao renovar o token", res.status)
  }
  return montarTokens(dados)
}

// ---------------------------------------------------------------------------
// Chamada autenticada
// ---------------------------------------------------------------------------

const MARGEM_RENOVACAO_MS = 10 * 60 * 1000

async function credenciaisValidas(integracaoId: string): Promise<Credenciais> {
  const registro = await prisma.storeIntegracao.findFirst({
    where: { id: integracaoId, isDeleted: false, provedor: "tiktok_shop" },
    select: { id: true, credenciaisCifradas: true },
  })
  if (!registro?.credenciaisCifradas) {
    throw new TikTokError("TikTok Shop nao esta conectado")
  }

  let tokens: Credenciais
  try {
    tokens = decifrarCredenciais(registro.credenciaisCifradas)
  } catch {
    throw new TikTokError("Credencial do TikTok ilegivel — reconecte a integracao")
  }

  const expira = tokens.expira_em ? Date.parse(tokens.expira_em) : 0
  if (expira - MARGEM_RENOVACAO_MS > Date.now()) return tokens

  const novos = await renovarTokens(tokens.refresh_token)
  // Preserva o shop_cipher: ele identifica a loja e nao volta na renovacao.
  const atualizadas = { ...tokens, ...novos }
  await prisma.storeIntegracao.update({
    where: { id: registro.id },
    data: {
      credenciaisCifradas: cifrarCredenciais(atualizadas),
      status: "conectado",
      expiraEm: new Date(novos.expira_em),
      ultimoErro: null,
    },
  })
  return atualizadas
}

/** GET assinado. Nao existe equivalente de escrita — ver o topo do arquivo. */
async function buscar<T>(
  integracaoId: string,
  caminho: string,
  params: Record<string, string | number | undefined> = {}
): Promise<T> {
  const cfg = configDoApp()
  const tokens = await credenciaisValidas(integracaoId)

  const assinados = paramsAssinados(
    caminho,
    { ...params, shop_cipher: tokens.shop_cipher },
    cfg
  )

  const url = new URL(TIKTOK_API_BASE + caminho)
  for (const [k, v] of Object.entries(assinados)) url.searchParams.set(k, v)

  const res = await fetch(url, {
    headers: {
      // O token vai em header proprio, e por isso fica fora da assinatura.
      "x-tts-access-token": tokens.access_token,
      Accept: "application/json",
    },
  })

  const dados = await res.json().catch(() => ({}))
  if (!res.ok || dados?.code) {
    const mensagem = dados?.message || `TikTok respondeu ${res.status}`
    await prisma.storeIntegracao
      .update({
        where: { id: integracaoId },
        data: {
          ultimoErro: `${mensagem} (${caminho})`,
          status: res.status === 401 ? "expirado" : "erro",
        },
      })
      .catch(() => {})
    throw new TikTokError(mensagem, res.status)
  }

  await prisma.storeIntegracao
    .update({
      where: { id: integracaoId },
      data: { ultimaSincronizacao: new Date(), ultimoErro: null, status: "conectado" },
    })
    .catch(() => {})

  return (dados.data ?? dados) as T
}

// ---------------------------------------------------------------------------
// Leituras
// ---------------------------------------------------------------------------

export type LojaTikTok = { id?: string; name?: string; cipher?: string }
export type ProdutoTikTok = { id?: string; title?: string; status?: string }
export type PedidoTikTok = { id?: string; status?: string; create_time?: number }

/** Lojas que autorizaram o app — de onde sai o `shop_cipher`. */
export async function listarLojas(integracaoId: string) {
  const r = await buscar<{ shops?: LojaTikTok[] }>(
    integracaoId,
    TIKTOK_ENDPOINTS.lojasAutorizadas
  )
  return r.shops ?? []
}

export async function listarProdutos(integracaoId: string, pagina = 1, tamanho = 50) {
  const r = await buscar<{ products?: ProdutoTikTok[] }>(
    integracaoId,
    TIKTOK_ENDPOINTS.produtos,
    { page_number: pagina, page_size: tamanho }
  )
  return r.products ?? []
}

export async function listarPedidos(integracaoId: string, pagina = 1, tamanho = 50) {
  const r = await buscar<{ orders?: PedidoTikTok[] }>(
    integracaoId,
    TIKTOK_ENDPOINTS.pedidos,
    { page_number: pagina, page_size: tamanho }
  )
  return r.orders ?? []
}

export { TikTokConfigError }
