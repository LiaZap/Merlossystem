/**
 * Prova que o envio sai com a credencial DA CONTA — olhando o que vai no fio,
 * nao so a identidade do objeto.
 *
 * Se um adapter ignorasse a credencial e caisse no ambiente, a loja B
 * responderia com o token da loja A e o cliente receberia mensagem de outra
 * empresa. Este teste falha se isso voltar a acontecer.
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import { getAdapterDaConta } from "@/lib/channels"

/** Intercepta o fetch para ver QUAL token cada adapter manda. */
function espionarFetch() {
  const chamadas: string[] = []
  vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init: RequestInit = {}) => {
    const h = (init.headers ?? {}) as Record<string, string>
    chamadas.push(h.Authorization ?? "(sem Authorization)")
    return new Response(JSON.stringify({ message_id: "x" }), { status: 200 })
  }))
  return chamadas
}

afterEach(() => vi.unstubAllGlobals())

describe("token usado no envio", () => {
  it("cada conta Instagram envia com o proprio token", async () => {
    process.env.META_PAGE_ACCESS_TOKEN = "TOKEN-DO-AMBIENTE"
    const chamadas = espionarFetch()

    await getAdapterDaConta("instagram", { page_access_token: "TOKEN-CENTRO" })
      .sendText("cliente-1", "oi do centro")
    await getAdapterDaConta("instagram", { page_access_token: "TOKEN-CERRO" })
      .sendText("cliente-2", "oi do cerro")
    await getAdapterDaConta("instagram", null).sendText("cliente-3", "sem conta")

    expect(chamadas).toEqual([
      "Bearer TOKEN-CENTRO",
      "Bearer TOKEN-CERRO",
      "Bearer TOKEN-DO-AMBIENTE",
    ])
  })

  it("WhatsApp usa o phone_id da conta na URL", async () => {
    const urls: string[] = []
    vi.stubGlobal("fetch", vi.fn(async (url: unknown) => {
      urls.push(String(url))
      return new Response(JSON.stringify({ messages: [{ id: "x" }] }), { status: 200 })
    }))

    await getAdapterDaConta("whatsapp", { phone_id: "111", access_token: "a" })
      .sendText("c", "vendas")
    await getAdapterDaConta("whatsapp", { phone_id: "222", access_token: "b" })
      .sendText("c", "sac")

    expect(urls[0]).toContain("/111/messages")
    expect(urls[1]).toContain("/222/messages")
  })
})
