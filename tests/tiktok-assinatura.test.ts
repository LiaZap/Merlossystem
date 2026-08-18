/**
 * Assinatura do TikTok Shop.
 *
 * E a parte da integracao que da para verificar sem chamar o TikTok — entao
 * vale testar a fundo. Errar a ordem, esquecer de excluir `access_token` ou
 * trocar a caixa do hex faz TODA chamada voltar com erro de assinatura.
 */
import { describe, it, expect } from "vitest"
import { createHmac } from "node:crypto"
import {
  montarStringAssinada,
  assinar,
  paramsAssinados,
  verificarAssinaturaWebhook,
} from "@/lib/tiktok/assinatura"
import { ASSINATURA_INCLUI_CAMINHO } from "@/lib/tiktok/config"

const SECRET = "segredo-do-app"
const CFG = { appKey: "chave-do-app", appSecret: SECRET }
const CAMINHO = "/product/202309/products/search"

describe("string assinada", () => {
  it("ordena os parametros alfabeticamente, nao na ordem informada", () => {
    const fora = montarStringAssinada(CAMINHO, { zebra: "1", alfa: "2" }, SECRET)
    const dentro = montarStringAssinada(CAMINHO, { alfa: "2", zebra: "1" }, SECRET)
    expect(fora).toBe(dentro)
    expect(fora).toContain("alfa2zebra1")
    expect(fora).not.toContain("zebra1alfa2")
  })

  it("concatena como chave+valor, sem separador", () => {
    const s = montarStringAssinada(CAMINHO, { a: "1", b: "2" }, SECRET)
    expect(s).toContain("a1b2")
  })

  it("envolve com o app_secret nas duas pontas", () => {
    const s = montarStringAssinada(CAMINHO, { a: "1" }, SECRET)
    expect(s.startsWith(SECRET)).toBe(true)
    expect(s.endsWith(SECRET)).toBe(true)
  })

  it("exclui `sign` — ele e o resultado, nao a entrada", () => {
    const com = montarStringAssinada(CAMINHO, { a: "1", sign: "ABC123" }, SECRET)
    const sem = montarStringAssinada(CAMINHO, { a: "1" }, SECRET)
    expect(com).toBe(sem)
  })

  it("exclui `access_token` — senao toda chamada quebra apos um refresh", () => {
    const antes = montarStringAssinada(CAMINHO, { a: "1", access_token: "token-velho" }, SECRET)
    const depois = montarStringAssinada(CAMINHO, { a: "1", access_token: "token-novo" }, SECRET)
    expect(antes).toBe(depois)
  })

  it("ignora parametro indefinido em vez de assinar 'undefined'", () => {
    const com = montarStringAssinada(CAMINHO, { a: "1", b: undefined }, SECRET)
    const sem = montarStringAssinada(CAMINHO, { a: "1" }, SECRET)
    expect(com).toBe(sem)
    expect(com).not.toContain("undefined")
  })

  it("o caminho entra ou nao conforme a constante declarada", () => {
    const s = montarStringAssinada(CAMINHO, { a: "1" }, SECRET)
    expect(s.includes(CAMINHO)).toBe(ASSINATURA_INCLUI_CAMINHO)
  })

  it("caminhos diferentes geram assinaturas diferentes (quando o caminho conta)", () => {
    const a = assinar("/rota/um", { x: "1" }, SECRET)
    const b = assinar("/rota/dois", { x: "1" }, SECRET)
    if (ASSINATURA_INCLUI_CAMINHO) expect(a).not.toBe(b)
    else expect(a).toBe(b)
  })
})

describe("assinatura", () => {
  it("e hex maiusculo", () => {
    const s = assinar(CAMINHO, { a: "1" }, SECRET)
    expect(s).toMatch(/^[0-9A-F]{64}$/)
  })

  it("bate com o HMAC calculado a mao", () => {
    // Reproduz a conta por fora, para o teste nao so repetir a implementacao.
    const esperado = createHmac("sha256", SECRET)
      .update(montarStringAssinada(CAMINHO, { a: "1" }, SECRET), "utf8")
      .digest("hex")
      .toUpperCase()
    expect(assinar(CAMINHO, { a: "1" }, SECRET)).toBe(esperado)
  })

  it("muda se o segredo mudar", () => {
    expect(assinar(CAMINHO, { a: "1" }, SECRET)).not.toBe(
      assinar(CAMINHO, { a: "1" }, "outro-segredo")
    )
  })
})

describe("parametros prontos para a chamada", () => {
  const AGORA = 1_760_000_000_000

  it("acrescenta app_key, timestamp em segundos e sign_method", () => {
    const p = paramsAssinados(CAMINHO, { shop_id: "abc" }, CFG, AGORA)
    expect(p.app_key).toBe("chave-do-app")
    expect(p.timestamp).toBe(String(Math.floor(AGORA / 1000)))
    expect(p.sign_method).toBe("HmacSHA256")
    expect(p.shop_id).toBe("abc")
  })

  it("inclui o sign e ele confere com a assinatura dos demais", () => {
    const p = paramsAssinados(CAMINHO, { shop_id: "abc" }, CFG, AGORA)
    const { sign, ...resto } = p
    expect(sign).toBe(assinar(CAMINHO, resto, SECRET))
  })

  it("o mesmo momento gera a mesma assinatura", () => {
    // Sem relogio injetavel, duas chamadas no mesmo segundo poderiam divergir
    // e o bug so apareceria na virada do segundo.
    const a = paramsAssinados(CAMINHO, { x: "1" }, CFG, AGORA)
    const b = paramsAssinados(CAMINHO, { x: "1" }, CFG, AGORA)
    expect(a.sign).toBe(b.sign)
  })

  it("o app_secret NUNCA vai nos parametros enviados", () => {
    const p = paramsAssinados(CAMINHO, { x: "1" }, CFG, AGORA)
    expect(JSON.stringify(p)).not.toContain(SECRET)
  })
})

describe("assinatura do webhook", () => {
  const CORPO = '{"type":"ORDER_STATUS_CHANGE","data":{"order_id":"123"}}'
  const valida = () =>
    createHmac("sha256", SECRET).update(`${CFG.appKey}${CORPO}`, "utf8").digest("hex")

  it("aceita assinatura correta", () => {
    expect(verificarAssinaturaWebhook(CORPO, valida(), CFG).ok).toBe(true)
  })

  it("aceita em maiuscula tambem", () => {
    expect(verificarAssinaturaWebhook(CORPO, valida().toUpperCase(), CFG).ok).toBe(true)
  })

  it("recusa corpo adulterado", () => {
    const r = verificarAssinaturaWebhook('{"order_id":"999"}', valida(), CFG)
    expect(r.ok).toBe(false)
  })

  it("recusa assinatura de outro segredo", () => {
    const outra = createHmac("sha256", "outro").update(`${CFG.appKey}${CORPO}`).digest("hex")
    expect(verificarAssinaturaWebhook(CORPO, outra, CFG).ok).toBe(false)
  })

  it("recusa ausente", () => {
    expect(verificarAssinaturaWebhook(CORPO, null, CFG).ok).toBe(false)
    expect(verificarAssinaturaWebhook(CORPO, "", CFG).ok).toBe(false)
  })

  it("a chave do app entra na conta, nao so o corpo", () => {
    const semAppKey = createHmac("sha256", SECRET).update(CORPO, "utf8").digest("hex")
    expect(verificarAssinaturaWebhook(CORPO, semAppKey, CFG).ok).toBe(false)
  })
})
