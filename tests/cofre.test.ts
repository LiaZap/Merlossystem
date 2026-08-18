/**
 * Cofre das credenciais. O que precisa ser verdade:
 *   - ida e volta preserva o segredo;
 *   - dado adulterado NAO decifra (GCM autentica);
 *   - chave trocada NAO decifra;
 *   - sem chave configurada, falha alto — nunca grava em texto plano;
 *   - nada que va para a tela contem o segredo.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import {
  cifrar, decifrar, cifrarCredenciais, decifrarCredenciais,
  mascarar, resumoPublico, CofreError,
} from "@/lib/cofre"

const CHAVE_A = "a".repeat(64) // 32 bytes em hex
const CHAVE_B = "b".repeat(64)

const ENV = { ...process.env }
beforeEach(() => {
  process.env.INTEGRATIONS_KEY = CHAVE_A
})
afterEach(() => {
  process.env = { ...ENV }
})

describe("ida e volta", () => {
  it("preserva o segredo", () => {
    const segredo = "EAAGm0PX4ZCpsBO7ZC9xKp"
    expect(decifrar(cifrar(segredo))).toBe(segredo)
  })

  it("preserva acento e emoji", () => {
    const s = "token com ção, ãe e 🎉"
    expect(decifrar(cifrar(s))).toBe(s)
  })

  it("preserva string vazia", () => {
    expect(decifrar(cifrar(""))).toBe("")
  })

  it("duas cifras do mesmo texto sao diferentes (IV aleatorio)", () => {
    // Se fossem iguais, daria para saber que duas lojas usam o mesmo token.
    expect(cifrar("igual")).not.toBe(cifrar("igual"))
  })

  it("guarda objeto de credenciais", () => {
    const c = { access_token: "abc123", refresh_token: "xyz789" }
    expect(decifrarCredenciais(cifrarCredenciais(c))).toEqual(c)
  })
})

describe("o texto cifrado nao entrega nada", () => {
  it("nao contem o segredo em claro", () => {
    const guardado = cifrar("senha-secreta-do-bling")
    expect(guardado).not.toContain("senha")
    expect(guardado).not.toContain("bling")
  })

  it("comeca com a versao, para permitir rotacao de chave", () => {
    expect(cifrar("x").startsWith("v1:")).toBe(true)
  })
})

/**
 * Troca um caractere no MEIO do trecho.
 *
 * Mexer no ultimo nao serve: em base64url o caractere final carrega so os bits
 * que sobraram, e a maioria e descartada na decodificacao — a mutacao vira
 * no-op e o teste passa sem testar nada.
 */
function adulterar(trecho: string): string {
  const i = Math.floor(trecho.length / 2)
  const novo = trecho[i] === "A" ? "B" : "A"
  return trecho.slice(0, i) + novo + trecho.slice(i + 1)
}

describe("adulteracao", () => {
  it("recusa texto cifrado alterado", () => {
    const partes = cifrar("original").split(":")
    partes[3] = adulterar(partes[3])
    expect(() => decifrar(partes.join(":"))).toThrow(CofreError)
  })

  it("recusa tag de autenticacao alterada", () => {
    const partes = cifrar("original").split(":")
    partes[2] = adulterar(partes[2])
    expect(() => decifrar(partes.join(":"))).toThrow(CofreError)
  })

  it("recusa IV trocado", () => {
    const a = cifrar("original").split(":")
    const b = cifrar("outro").split(":")
    a[1] = b[1]
    expect(() => decifrar(a.join(":"))).toThrow(CofreError)
  })

  it("recusa formato desconhecido", () => {
    expect(() => decifrar("texto solto")).toThrow(CofreError)
    expect(() => decifrar("v9:a:b:c")).toThrow(/Versao de cofre/)
  })
})

describe("chave", () => {
  it("credencial de uma chave nao abre com outra", () => {
    const guardado = cifrar("segredo")
    process.env.INTEGRATIONS_KEY = CHAVE_B
    expect(() => decifrar(guardado)).toThrow(CofreError)
  })

  it("aceita chave em base64 tambem", () => {
    process.env.INTEGRATIONS_KEY = Buffer.alloc(32, 7).toString("base64")
    expect(decifrar(cifrar("ok"))).toBe("ok")
  })

  it("sem chave configurada, falha em vez de gravar em claro", () => {
    delete process.env.INTEGRATIONS_KEY
    expect(() => cifrar("segredo")).toThrow(/INTEGRATIONS_KEY nao configurada/)
  })

  it("chave de tamanho errado falha alto", () => {
    process.env.INTEGRATIONS_KEY = "curta"
    expect(() => cifrar("x")).toThrow(/precisa de 32/)
  })
})

describe("o que vai para a tela", () => {
  it("mascara mostra so os 4 ultimos", () => {
    expect(mascarar("EAAGm0PX4ZCpsBO79xKp")).toBe("••••9xKp")
  })

  it("segredo curto some inteiro", () => {
    expect(mascarar("abc")).toBe("••••")
  })

  it("resumo publico devolve as chaves, nunca os valores", () => {
    const guardado = cifrarCredenciais({
      access_token: "token-secreto-1234",
      refresh_token: "refresh-secreto-5678",
    })
    const r = resumoPublico(guardado)
    expect(Object.keys(r).sort()).toEqual(["access_token", "refresh_token"])
    expect(r.access_token).toBe("••••1234")
    expect(JSON.stringify(r)).not.toContain("secreto")
  })

  it("credencial ilegivel nao derruba a listagem", () => {
    const guardado = cifrar("x")
    process.env.INTEGRATIONS_KEY = CHAVE_B
    expect(resumoPublico(guardado)).toEqual({ erro: "ilegivel" })
  })

  it("sem credencial, resumo vazio", () => {
    expect(resumoPublico(null)).toEqual({})
  })
})
