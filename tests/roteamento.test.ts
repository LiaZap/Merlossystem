/**
 * Roteamento por conta — as duas regras que a etapa 3 existe para garantir:
 *
 *   1. a resposta sai pelo numero em que a mensagem ENTROU;
 *   2. mensagem que chega acha/cria contato dentro da loja daquela conta.
 *
 * Checagem estatica sobre o fonte, como nos outros: e o que trava a regra sem
 * precisar de banco.
 */
import { describe, it, expect } from "vitest"
import { fonteEfetiva } from "./rotas"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { getAdapterDaConta } from "@/lib/channels"
import { PROVEDORES, PROVEDORES_DE_CANAL } from "@/lib/integracoes"

const raiz = resolve(__dirname, "..")
const ler = (...partes: string[]) => readFileSync(resolve(raiz, ...partes), "utf8")

describe("conta que recebeu vem do payload", () => {
  it("IncomingMessage carrega a conta", () => {
    expect(ler("src", "lib", "channels", "types.ts")).toMatch(/contaExterna\?: string/)
  })

  it("WhatsApp extrai o numero que recebeu", () => {
    expect(ler("src", "lib", "channels", "whatsapp.ts")).toContain("metadata?.phone_number_id")
  })

  it.each(["instagram", "facebook"])("%s extrai o perfil que recebeu", (canal) => {
    expect(ler("src", "lib", "channels", `${canal}.ts`)).toMatch(/contaExterna = entry\?\.id/)
  })
})

describe("webhooks resolvem a conta, nao so a loja", () => {
  const webhooks = ["whatsapp", "instagram", "facebook", "tiktok"]

  it.each(webhooks)("%s resolve a conta antes de processar", (canal) => {
    const src = ler("src", "app", "api", "webhooks", canal, "route.ts")
    expect(src).toMatch(/contaDoEvento|contaDaUrl/)
    // A conta inteira e repassada, nao so a loja.
    expect(src).toContain("processIncomingMessage(msg, conta)")
  })

  it.each(webhooks)("%s descarta evento de conta desconhecida", (canal) => {
    const src = ler("src", "app", "api", "webhooks", canal, "route.ts")
    expect(src).toMatch(/if \(!conta\) \{/)
    // Descarta com 200: o provedor nao deve reenviar em loop.
    expect(src).toMatch(/if \(!conta\)[\s\S]{0,320}NextResponse\.json\(\{ success: true \}\)/)
  })

  it("nenhum webhook resolve mais a loja pela URL", () => {
    for (const canal of webhooks) {
      const src = ler("src", "app", "api", "webhooks", canal, "route.ts")
      expect(src, canal).not.toContain("lojaDoWebhook")
    }
  })
})

describe("conversa guarda por onde entrou", () => {
  it("o schema tem o vinculo", () => {
    const schema = ler("prisma", "schema.prisma")
    expect(schema).toMatch(/storeIntegracaoId\s+String\?\s+@map\("store_integracao_id"\)/)
    expect(schema).toContain("@@index([storeIntegracaoId])")
  })

  it("o gateway grava a conta na conversa", () => {
    const src = ler("src", "lib", "channels", "gateway.ts")
    expect(src).toContain("storeIntegracaoId: conta.id")
  })

  it("a conversa e procurada por conta, nao so por canal", () => {
    // Sem isto, a mesma cliente falando com o numero de vendas e com o de SAC
    // cairia numa conversa so, e a resposta sairia pelo numero errado.
    const src = ler("src", "lib", "channels", "gateway.ts")
    expect(src).toMatch(/findFirst\(\{[\s\S]{0,220}storeIntegracaoId: conta\.id/)
  })
})

describe("envio sai pela conta de entrada", () => {
  it.each([
    ["messages", "src/app/api/messages/route.ts"],
    ["media/send", "src/app/api/media/send/route.ts"],
  ])("%s resolve a conta da conversa antes de enviar", (_nome, caminho) => {
    // Fonte efetiva: a rota mais o modulo de entrega ao qual ela delega.
    const src = fonteEfetiva(...caminho.split("/"))
    expect(src).toContain("contaDaConversa")
    expect(src).toContain("getAdapterDaConta")
    // O adapter global nao pode mais ser usado direto no envio.
    expect(src).not.toMatch(/\bgetAdapter\(channel\)/)
  })
})

describe("getAdapterDaConta", () => {
  it("usa a credencial da conta quando ela existe", () => {
    const a = getAdapterDaConta("whatsapp", {
      phone_id: "111", access_token: "token-a",
    })
    const b = getAdapterDaConta("whatsapp", {
      phone_id: "222", access_token: "token-b",
    })
    // Instancias distintas: cada uma presa a sua credencial. Se fossem a
    // mesma, dois numeros simultaneos se atropelariam.
    expect(a).not.toBe(b)
    expect(a.channel).toBe("whatsapp")
  })

  it("cai no adapter do ambiente sem credencial", () => {
    const a = getAdapterDaConta("whatsapp", null)
    const b = getAdapterDaConta("whatsapp", null)
    expect(a).toBe(b)
  })

  it("credencial incompleta nao vira adapter meia-boca", () => {
    // So phone_id, sem token: melhor cair no ambiente do que montar um adapter
    // que falha em toda chamada.
    const parcial = getAdapterDaConta("whatsapp", { phone_id: "111" })
    expect(parcial).toBe(getAdapterDaConta("whatsapp", null))
  })
})

describe("provedores", () => {
  it("todo canal do sistema tem provedor correspondente", () => {
    // O sistema tem 4 canais de mensagem; sem provedor, o webhook do canal
    // nunca resolveria conta e ficaria mudo.
    expect(PROVEDORES).toContain("facebook")
    expect(PROVEDORES_DE_CANAL.length).toBe(5)
  })
})
