/**
 * Fase 6 — a campanha passa a enviar de verdade.
 *
 * O defeito: existia um botao "Iniciar envio" que gravava `status: "sending"`,
 * carimbava `startedAt` e mais nada. A campanha ficava eternamente "enviando" e
 * zero mensagens saiam — o pior tipo de falso, porque a tela mostrava sucesso.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { filtroDoSegmento, TAMANHO_DO_LOTE } from "@/lib/broadcasts/disparo"
import { textoDoProduto } from "@/components/inbox/SeletorProduto"

const raiz = resolve(__dirname, "..")
const ler = (...p: string[]) => readFileSync(resolve(raiz, ...p), "utf8")
const semComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

const disparo = semComentarios(ler("src", "lib", "broadcasts", "disparo.ts"))
const rota = semComentarios(ler("src", "app", "api", "broadcasts", "[id]", "disparar", "route.ts"))

// -------------------------------------------------- ninguem recebe 2 vezes

describe("a mesma cliente nunca recebe a campanha duas vezes", () => {
  it("a linha e reservada antes do envio", () => {
    // Sem reservar, duas chamadas simultaneas (a aba aberta da atendente e um
    // cron, por exemplo) pegam o mesmo destinatario e a cliente recebe em
    // dobro. `skip locked` faz cada chamada levar um conjunto diferente.
    expect(disparo).toContain("for update skip locked")
    expect(disparo).toContain("set status = 'sending'")
  })

  it("a reserva e FIFO, como manda a base", () => {
    expect(disparo).toMatch(/order by created_at/)
  })

  it("falha de rede nao deixa a linha presa em `sending`", () => {
    // Linha presa nunca mais e reservada, e a campanha jamais conclui.
    const posTry = disparo.indexOf("try {")
    const posCatch = disparo.indexOf("catch (e)")
    expect(posTry).toBeGreaterThan(-1)
    expect(posCatch).toBeGreaterThan(posTry)
    expect(disparo).toMatch(/catch[\s\S]{0,200}marcarFalha/)
  })

  it("o que ja saiu fica gravado, entao retomar nao reenvia", () => {
    expect(disparo).toContain('status: "sent"')
    // A reserva so pega quem esta `pending`.
    expect(disparo).toMatch(/where broadcast_id = \$\{broadcastId\}\s*\n\s*and status = 'pending'/)
  })
})

// -------------------------------------------------------------- lote e tempo

describe("o envio acontece em lotes", () => {
  it("o lote e pequeno", () => {
    // Um handler que envia mil mensagens numa requisicao estoura o tempo limite
    // e deixa a campanha em estado desconhecido.
    expect(TAMANHO_DO_LOTE).toBeGreaterThan(0)
    expect(TAMANHO_DO_LOTE).toBeLessThanOrEqual(50)
  })

  it("a rota processa UM lote por chamada, sem laco", () => {
    expect(rota).toContain("processarLote(")
    expect(rota).not.toMatch(/while\s*\(|for\s*\(;;\)/)
  })

  it("a tela repete a chamada ate acabar", () => {
    const tela = ler("src", "app", "(dashboard)", "broadcasts", "page.tsx")
    expect(tela).toContain("dispararEmLotes")
    expect(tela).toContain("/disparar")
    // Marcar `sending` sozinho nao envia nada: era o defeito.
    expect(tela).toMatch(/if \(status === "sending"\) void dispararEmLotes/)
  })
})

// ------------------------------------------------------------- pausa e conta

describe("pausar para de verdade", () => {
  it("o lote confere o status antes de reservar", () => {
    const posChecagem = disparo.indexOf('campanha.status !== "sending"')
    const posReserva = disparo.indexOf("reservarLote(broadcastId)")
    expect(posChecagem).toBeGreaterThan(-1)
    expect(posChecagem).toBeLessThan(posReserva)
  })

  it("a rota recusa campanha que nao esta enviando", () => {
    expect(rota).toMatch(/status !== "sending"/)
    expect(rota).toContain("status: 409")
  })
})

describe("a campanha sai pela conta certa", () => {
  it("sem conta definida, recusa em vez de escolher sozinho", () => {
    // Numa loja com dois numeros, adivinhar mandaria o marketing pelo numero
    // do SAC. O projeto ja decidiu o contrario para as respostas.
    expect(rota).toContain("storeIntegracaoId")
    expect(rota).toContain("status: 422")
    // E pausa, para nao ficar tentando em laco.
    expect(rota).toMatch(/status: "paused"/)
  })

  it("a criacao aceita a conta e confere a loja dela", () => {
    const criar = semComentarios(ler("src", "app", "api", "broadcasts", "route.ts"))
    expect(criar).toContain("storeIntegracaoId")
    expect(criar).toMatch(/storeIntegracao\.findFirst/)
    expect(criar).toContain("foraDaLoja(\"Conta de envio\")")
  })

  it("uma conta so na loja dispensa a escolha", () => {
    const criar = semComentarios(ler("src", "app", "api", "broadcasts", "route.ts"))
    expect(criar).toMatch(/contas\.length === 1/)
  })

  it("uazapi manda texto, nao template", () => {
    // `sendTemplate` do uazapi falha de proposito: nao ha template aprovado
    // ali. Sem esta ramificacao, TODOS os destinatarios falhariam.
    expect(disparo).toMatch(/provedor !== "uazapi"/)
    expect(disparo).toContain("adapter.sendText(")
    expect(disparo).toContain("adapter.sendTemplate(")
  })
})

// ------------------------------------------------------------------- lgpd

describe("opt-out e respeitado", () => {
  it("quem pediu para nao receber fica fora da lista", () => {
    const where = filtroDoSegmento("centro", {})
    expect(where.optOut).toBe(false)
    expect(where.storeId).toBe("centro")
    // Contato apagado por LGPD tambem nao entra.
    expect(where.isDeleted).toBe(false)
  })

  it("o opt-out e conferido de novo na hora do envio", () => {
    // Entre montar a lista e chegar neste lote passam minutos; "pare de me
    // mandar" tem que valer da proxima mensagem em diante.
    expect(disparo).toMatch(/contato\.optOut/)
    expect(disparo).toContain("opt-out")
  })

  it("o filtro do segmento e o mesmo da contagem", () => {
    // Quando contagem e envio tinham cada um a sua copia, "vai para 300" e
    // "saiu para 287" divergiam sem explicacao.
    const criar = ler("src", "app", "api", "broadcasts", "route.ts")
    expect(criar).toContain("filtroDoSegmento(")
  })

  it("o filtro traduz cada criterio do segmento", () => {
    const where = filtroDoSegmento("centro", {
      tags: ["vip"],
      preferred_size: "M",
      min_spent: 500,
    })
    expect(where.tags).toEqual({ hasEvery: ["vip"] })
    expect(where.preferredSize).toBe("M")
    expect(where.totalSpent).toEqual({ gte: 500 })
  })
})

// -------------------------------------------------------- seletor de produto

describe("seletor de produto no chat", () => {
  const base = {
    id: "p1",
    name: "Vestido Midi",
    sku: "VM-01",
    price: "199.90",
    sizes: ["P", "M", "G"],
    stock: { P: 2, M: 0, G: 5 },
    imageUrls: ["https://exemplo/foto.jpg"],
  }

  it("oferece so o tamanho que tem em estoque", () => {
    // Oferecer o que acabou gera troca e cliente frustrada.
    const texto = textoDoProduto(base)
    expect(texto).toContain("P, G")
    expect(texto).not.toContain("M,")
  })

  it("diz claramente quando nao ha estoque", () => {
    const texto = textoDoProduto({ ...base, stock: { P: 0, M: 0, G: 0 } })
    expect(texto).toContain("sem estoque")
  })

  it("mostra o preco em real", () => {
    expect(textoDoProduto(base)).toMatch(/R\$\s?199,90/)
  })

  it("nao quebra sem foto nem tamanhos", () => {
    const texto = textoDoProduto({ ...base, sizes: [], imageUrls: [] })
    expect(texto).toContain("Vestido Midi")
  })

  it("o marcador de pendencia saiu da interface", () => {
    const chat = ler("src", "components", "inbox", "ChatWindow.tsx")
    expect(chat).not.toContain("Fase 6")
    expect(chat).toContain("SeletorProduto")
  })

  it("o texto vai para o campo, nao direto para a cliente", () => {
    // A vendedora quase sempre acrescenta uma frase antes de mandar.
    const chat = ler("src", "components", "inbox", "ChatWindow.tsx")
    expect(chat).toMatch(/onEscolher=\{\(texto\) => \{\s*\n\s*setTexto/)
  })
})

describe("regra de senha nao diverge entre tela e API", () => {
  it("o cadastro do primeiro admin pede os mesmos 8 caracteres", () => {
    // A API subiu para 8 na fase 4 e a tela continuou dizendo 6: quem seguisse
    // a tela levava um erro do servidor sem entender por que.
    const tela = ler("src", "app", "(auth)", "register", "page.tsx")
    expect(tela).toContain("minLength={8}")
    expect(tela).not.toContain("Mínimo 6")
    const api = ler("src", "app", "api", "register", "route.ts")
    expect(api).toMatch(/min\(8/)
  })
})
