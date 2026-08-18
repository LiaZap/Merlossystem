/**
 * Credencial por conta nos adapters.
 *
 * A regra: o envio usa a credencial da conta por onde a conversa entrou. Se um
 * adapter ignorar a credencial e cair no ambiente, a loja B responde com o
 * token da loja A — e o cliente recebe mensagem de outra empresa.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { getAdapter, getAdapterDaConta } from "@/lib/channels"
import { criarWhatsappAdapter } from "@/lib/channels/whatsapp"
import { criarInstagramAdapter } from "@/lib/channels/instagram"
import { criarFacebookAdapter } from "@/lib/channels/facebook"
import { CHAVES_ESPERADAS, chavesFaltando } from "@/lib/integracoes"

const raiz = resolve(__dirname, "..")
const ler = (...p: string[]) => readFileSync(resolve(raiz, ...p), "utf8")

const ENV = { ...process.env }
afterEach(() => {
  process.env = { ...ENV }
})

describe("fabricas existem para os canais com credencial propria", () => {
  it.each([
    ["whatsapp", () => criarWhatsappAdapter({ phoneId: "1", accessToken: "t" })],
    ["instagram", () => criarInstagramAdapter({ pageAccessToken: "t" })],
    ["facebook", () => criarFacebookAdapter({ pageAccessToken: "t" })],
  ])("%s tem fabrica", (canal, criar) => {
    const a = criar()
    expect(a.channel).toBe(canal)
  })

  it.each(["instagram", "facebook"])("%s nao le mais env dentro do adapter", (canal) => {
    const src = ler("src", "lib", "channels", `${canal}.ts`)
    // process.env so pode aparecer em configDoAmbiente — o resto usa o getter.
    const depoisDoAmbiente = src.slice(src.indexOf("function criarAdapter"))
    expect(depoisDoAmbiente, canal).not.toContain("process.env")
  })
})

describe("getAdapterDaConta escolhe pela credencial", () => {
  it.each([
    ["whatsapp", { phone_id: "1", access_token: "t" }],
    ["instagram", { page_access_token: "t" }],
    ["facebook", { page_access_token: "t" }],
  ] as const)("%s com credencial completa vira adapter proprio", (canal, cred) => {
    const daConta = getAdapterDaConta(canal, { ...cred })
    expect(daConta).not.toBe(getAdapter(canal))
    expect(daConta.channel).toBe(canal)
  })

  it.each([
    ["whatsapp", { phone_id: "1" }],
    ["instagram", { instagram_account_id: "abc" }],
    ["facebook", {}],
  ] as const)("%s com credencial incompleta cai no ambiente", (canal, cred) => {
    expect(getAdapterDaConta(canal, { ...cred })).toBe(getAdapter(canal))
  })

  it("duas contas do mesmo canal nao compartilham instancia", () => {
    // Se compartilhassem, duas lojas enviando ao mesmo tempo usariam a mesma
    // credencial — a ultima a configurar venceria.
    const a = getAdapterDaConta("instagram", { page_access_token: "loja-a" })
    const b = getAdapterDaConta("instagram", { page_access_token: "loja-b" })
    expect(a).not.toBe(b)
  })

  it("tiktok ainda nao tem credencial por conta", () => {
    // O adapter do TikTok nao tem configuracao nenhuma hoje; declarar suporte
    // seria mentira.
    expect(getAdapterDaConta("tiktok", { qualquer: "coisa" })).toBe(getAdapter("tiktok"))
    expect(CHAVES_ESPERADAS.tiktok_shop).toBeUndefined()
  })
})

describe("chaves esperadas por provedor", () => {
  it("aponta exatamente o que falta", () => {
    expect(chavesFaltando("whatsapp_oficial", { phone_id: "1" })).toEqual(["access_token"])
    expect(chavesFaltando("uazapi", {})).toEqual(["token"])
    expect(chavesFaltando("instagram", {})).toEqual(["page_access_token"])
    expect(chavesFaltando("instagram", { page_access_token: "t" })).toEqual([])
  })

  it("provedor sem chave declarada nao bloqueia", () => {
    // Bling e preenchido pelo OAuth, nao a mao.
    expect(chavesFaltando("bling", {})).toEqual([])
  })

  it("as chaves batem com o que getAdapterDaConta procura", () => {
    const src = ler("src", "lib", "channels", "index.ts")
    for (const chaves of Object.values(CHAVES_ESPERADAS)) {
      for (const chave of chaves ?? []) {
        expect(src, chave).toContain(`credenciais.${chave}`)
      }
    }
  })
})

describe("a rota de conectar recusa credencial incompleta", () => {
  it("valida antes de gravar", () => {
    // Credencial errada e gravada cifrada e so falha no primeiro envio, longe
    // de quem digitou.
    const src = ler("src", "app", "api", "integracoes", "route.ts")
    expect(src).toContain("chavesFaltando")
    expect(src).toMatch(/faltando\.length > 0[\s\S]{0,200}status: 400/)
  })
})
