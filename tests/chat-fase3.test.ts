/**
 * Fase 3 — o chat que a atendente usa o dia inteiro.
 *
 * Duas frentes, como no resto da base:
 *   1. logica pura (mesclagem de mensagens, destinatario do canal);
 *   2. varredura estatica sobre o fonte, travando invariantes que ja quebraram
 *      uma vez e nao dao erro nenhum quando quebram de novo.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { mesclarMensagens } from "@/lib/chat/mesclar"
import { destinatarioDoCanal } from "@/lib/chat/enviar"

const raiz = resolve(__dirname, "..")
const ler = (...p: string[]) => readFileSync(resolve(raiz, ...p), "utf8")

/**
 * Fonte sem comentario.
 *
 * Necessario porque estes testes procuram padroes no texto do arquivo, e os
 * comentarios desta base citam de proposito o que NAO se deve fazer
 * ("`findFirst` e nao `findUnique`, porque..."). Sem tirar os comentarios, a
 * explicacao do acerto e lida como se fosse o erro.
 */
const semComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

const msg = (
  id: string,
  extra: Partial<{ content: string; senderType: string; createdAt: string; pendente: boolean }> = {}
) => ({
  id,
  content: extra.content ?? `texto ${id}`,
  senderType: extra.senderType ?? "agent",
  createdAt: extra.createdAt ?? "2026-08-18T10:00:00.000Z",
  ...(extra.pendente ? { pendente: true } : {}),
})

// ---------------------------------------------------------------- mesclagem

describe("mesclagem de mensagens", () => {
  it("nao duplica: o mesmo id vindo duas vezes conta uma", () => {
    const r = mesclarMensagens([msg("a")], [msg("a")])
    expect(r.map((m) => m.id)).toEqual(["a"])
  })

  it("a versao do servidor vence a da tela", () => {
    // O status de entrega muda por webhook DEPOIS de a mensagem existir. Se a
    // copia local vencesse, a bolha ficaria presa em "enviado" para sempre.
    const naTela = { ...msg("a"), content: "antigo" }
    const doServidor = { ...msg("a"), content: "atualizado" }
    const r = mesclarMensagens([naTela], [doServidor])
    expect(r[0].content).toBe("atualizado")
  })

  it("descarta a otimista quando o servidor confirma a mesma mensagem", () => {
    // Sem isto a atendente ve a mensagem duas vezes: a bolha local e a real.
    const otimista = msg("local:1", { content: "boa tarde", pendente: true })
    const real = msg("uuid-1", { content: "boa tarde" })
    const r = mesclarMensagens([otimista], [real])
    expect(r.map((m) => m.id)).toEqual(["uuid-1"])
  })

  it("mantem a otimista enquanto o servidor nao confirma", () => {
    // O contrario tambem quebra: sumir a bolha antes da confirmacao faz a
    // atendente achar que o envio foi perdido e mandar de novo.
    const otimista = msg("local:1", { content: "boa tarde", pendente: true })
    const outra = msg("uuid-9", { content: "outra coisa" })
    const r = mesclarMensagens([otimista], [outra])
    expect(r.map((m) => m.id)).toContain("local:1")
  })

  it("nao confunde nota interna com mensagem de mesmo texto", () => {
    const otimista = msg("local:1", {
      content: "cliente insistente",
      senderType: "agent",
      pendente: true,
    })
    const daCliente = msg("uuid-1", {
      content: "cliente insistente",
      senderType: "customer",
    })
    const r = mesclarMensagens([otimista], [daCliente])
    // Remetentes diferentes: a otimista continua pendente.
    expect(r.map((m) => m.id)).toContain("local:1")
  })

  it("preserva o historico ja carregado por 'mensagens anteriores'", () => {
    // Antes a lista era SUBSTITUIDA a cada 5s e o historico paginado sumia.
    const antigas = [
      msg("velha-1", { createdAt: "2026-08-01T09:00:00.000Z" }),
      msg("velha-2", { createdAt: "2026-08-01T09:05:00.000Z" }),
    ]
    const recentes = [msg("nova-1", { createdAt: "2026-08-18T09:00:00.000Z" })]
    const r = mesclarMensagens(antigas, recentes)
    expect(r.map((m) => m.id)).toEqual(["velha-1", "velha-2", "nova-1"])
  })

  it("ordena por data, nao pela ordem de chegada", () => {
    const r = mesclarMensagens(
      [msg("c", { createdAt: "2026-08-18T12:00:00.000Z" })],
      [
        msg("a", { createdAt: "2026-08-18T10:00:00.000Z" }),
        msg("b", { createdAt: "2026-08-18T11:00:00.000Z" }),
      ]
    )
    expect(r.map((m) => m.id)).toEqual(["a", "b", "c"])
  })
})

// ------------------------------------------------------------- destinatario

describe("destinatario do canal", () => {
  const vazio = {
    phone: null,
    whatsappId: null,
    instagramId: null,
    facebookId: null,
    tiktokId: null,
  }

  it("WhatsApp cai no telefone quando nao ha whatsappId", () => {
    // Contato criado pelo CRM (nao por mensagem recebida) so tem telefone.
    expect(destinatarioDoCanal("whatsapp", { ...vazio, phone: "5544999" })).toBe("5544999")
  })

  it("WhatsApp prefere o whatsappId ao telefone", () => {
    expect(
      destinatarioDoCanal("whatsapp", { ...vazio, phone: "5544999", whatsappId: "wa-1" })
    ).toBe("wa-1")
  })

  it("os outros canais nao tem fallback", () => {
    expect(destinatarioDoCanal("instagram", { ...vazio, phone: "5544999" })).toBeNull()
    expect(destinatarioDoCanal("facebook", { ...vazio, phone: "5544999" })).toBeNull()
    expect(destinatarioDoCanal("tiktok", { ...vazio, phone: "5544999" })).toBeNull()
  })

  it("canal desconhecido nao vira envio as cegas", () => {
    expect(destinatarioDoCanal("telegram", { ...vazio, phone: "5544999" })).toBeNull()
  })
})

// ------------------------------------------------- invariantes do codigo

describe("mensagem recusada pelo canal deixa rastro", () => {
  const rota = ler("src", "app", "api", "messages", "route.ts")
  const gateway = ler("src", "lib", "channels", "gateway.ts")

  it("a rota grava a mensagem tambem quando a entrega falha", () => {
    // O defeito original: `return 500` ANTES de saveOutgoingMessage. A
    // atendente via um toast, a mensagem nao existia em lugar nenhum e nao
    // havia como reenviar.
    expect(rota).toContain("erroDeEnvio")
    const posEntrega = rota.indexOf("entregarNoCanal")
    const posGrava = rota.indexOf("saveOutgoingMessage(")
    expect(posEntrega).toBeGreaterThan(-1)
    expect(posGrava).toBeGreaterThan(posEntrega)
  })

  it("a rota nao aborta com 500 entre a entrega e a gravacao", () => {
    const trecho = rota.slice(rota.indexOf("entregarNoCanal"), rota.indexOf("saveOutgoingMessage("))
    expect(trecho).not.toContain("status: 500")
  })

  it("o gateway traduz o erro para o status `failed`", () => {
    expect(gateway).toContain('"failed"')
    expect(gateway).toContain("erroDeEnvio")
  })

  it("o reenvio so aceita mensagem que falhou", () => {
    const reenviar = semComentarios(
      ler("src", "app", "api", "messages", "[id]", "reenviar", "route.ts")
    )
    expect(reenviar).toContain('externalStatus !== "failed"')
    // Escopo de loja: o id vem da URL, entao resolver por `findUnique` (que o
    // guard de soft delete nao alcanca) abriria a conta da outra loja.
    expect(reenviar).toContain("escopoDaLoja")
    expect(reenviar).toContain("prisma.message.findFirst")
    expect(reenviar).not.toContain("findUnique")
  })

  it("a bolha oferece reenviar e mostra o motivo", () => {
    const bolha = ler("src", "components", "inbox", "BolhaMensagem.tsx")
    expect(bolha).toContain('externalStatus === "failed"')
    expect(bolha).toContain("erroDeEnvio")
    expect(bolha).toMatch(/onReenviar/)
  })
})

describe("rolagem do historico", () => {
  it("o ScrollArea entrega o elemento que realmente rola", () => {
    const sa = ler("src", "components", "ui", "scroll-area.tsx")
    // A prop tem que chegar no Viewport. Na Root, atribuir scrollTop nao faz
    // nada — foi o bug: o chat nunca descia para a mensagem nova.
    const posViewport = sa.indexOf("ScrollAreaPrimitive.Viewport")
    const posRef = sa.indexOf("ref={viewportRef}")
    expect(posRef).toBeGreaterThan(posViewport)
  })

  it("o chat usa viewportRef, nao ref no ScrollArea", () => {
    const chat = ler("src", "components", "inbox", "ChatWindow.tsx")
    expect(chat).toContain("viewportRef={viewportRef}")
    expect(chat).not.toMatch(/<ScrollArea[^>]*\sref=/)
  })

  it("so rola sozinho quando a atendente ja estava no fim", () => {
    // Puxar a tela para baixo enquanto ela le o historico tira o texto do olho.
    const chat = ler("src", "components", "inbox", "ChatWindow.tsx")
    expect(chat).toContain("estaNoFim")
    expect(chat).toMatch(/if \(colado\)/)
  })
})

describe("transferir e resolver fazem alguma coisa", () => {
  const cabecalho = ler("src", "components", "inbox", "CabecalhoConversa.tsx")

  it("os controles tem acao ligada", () => {
    // Antes eram dois <Button> sem onClick: clicava e nada acontecia.
    expect(cabecalho).toContain("onTransferir")
    expect(cabecalho).toContain("onResolver")
    expect(cabecalho).toMatch(/onChange=/)
  })

  it("a lista de destinatarios vem do servidor, nao do codigo", () => {
    expect(cabecalho).toContain("/api/usuarios")
  })
})

describe("PUT da conversa nao aceita qualquer coisa", () => {
  const rota = ler("src", "app", "api", "conversations", "[id]", "route.ts")

  it("valida status e prioridade contra uma lista fechada", () => {
    // `status: "banana"` fazia a conversa desaparecer da caixa de entrada (que
    // filtra open|pending) sem erro nenhum e sem como achar de volta.
    expect(rota).toContain("z.enum")
    expect(rota).toContain("safeParse")
    // O `body` usado no handler tem que ser o validado, nao o cru do request.
    const semCrus = semComentarios(rota)
    expect(semCrus).toContain("const body = parse.data")
    expect(semCrus).not.toMatch(/const body = await req\.json\(\)/)
  })

  it("confere a loja de quem vai receber a conversa", () => {
    // Sem isto dava para atribuir a conversa a um vendedor da outra loja, que
    // ficava com o nome nela sem nunca poder abri-la.
    const posAssigned = rota.indexOf("body.assignedTo")
    const posConsulta = rota.indexOf("prisma.user.findFirst")
    expect(posConsulta).toBeGreaterThan(posAssigned)
    expect(rota).toContain("storeId: alvo.storeId")
  })
})

describe("lista de usuarios nao vaza dado sensivel", () => {
  const rota = ler("src", "app", "api", "usuarios", "route.ts")

  it("o select nao traz senha nem e-mail", () => {
    // A rota e aberta a todo atendente (precisa dela para transferir), entao o
    // que ela devolve tem que ser o minimo para desenhar um seletor.
    expect(rota).toContain("select:")
    expect(rota).not.toContain("passwordHash")
    expect(rota).not.toMatch(/email:\s*true/)
  })

  it("filtra apenas usuarios ativos", () => {
    expect(rota).toContain("isActive: true")
  })
})

describe("menu de atalhos vem do banco", () => {
  const menu = ler("src", "components", "inbox", "MenuAtalhos.tsx")
  const chat = ler("src", "components", "inbox", "ChatWindow.tsx")

  it("busca no servidor em vez de lista escrita a mao", () => {
    expect(menu).toContain("/api/quick-replies")
    // A dica antiga era uma linha fixa no codigo, que nao acompanhava o
    // cadastro real das respostas rapidas.
    expect(chat).not.toContain("/frete /medidas /troca")
  })

  it("oferece apenas respostas ativas", () => {
    expect(menu).toContain("apenasAtivas")
  })

  it("nao abre no meio de uma frase com barra", () => {
    // "parcelo em 10/12" nao deve virar busca de atalho.
    const abre = /^\/(\S*)$/
    expect(abre.test("/fre")).toBe(true)
    expect(abre.test("/")).toBe(true)
    expect(abre.test("parcelo em 10/12")).toBe(false)
    expect(abre.test("/frete quanto custa")).toBe(false)
    expect(chat).toContain("/^\\/(\\S*)$/")
  })
})

describe("aviso de mensagem nova", () => {
  const aviso = ler("src", "lib", "chat", "aviso-sonoro.ts")

  it("o audio e armado num gesto do usuario", () => {
    // Criar o AudioContext no carregamento da pagina o deixa suspenso: a
    // primeira mensagem nao toca nada, sem erro no console.
    expect(aviso).toContain("pointerdown")
    expect(aviso).toContain("{ once: true }")
  })

  it("so notifica quando a aba esta escondida", () => {
    expect(aviso).toContain('document.visibilityState === "visible"')
  })

  it("nao pede permissao sozinho", () => {
    // Pedir sem o usuario ter agido gera popup do nada e o navegador penaliza.
    const posPedir = aviso.indexOf("export async function pedirPermissaoDeAviso")
    const posRequest = aviso.indexOf("requestPermission")
    expect(posRequest).toBeGreaterThan(posPedir)
  })
})

describe("busca de conversas nao dispara por tecla", () => {
  it("a caixa de entrada aplica a busca com atraso", () => {
    const page = ler("src", "app", "(dashboard)", "inbox", "page.tsx")
    expect(page).toContain("buscaAplicada")
    expect(page).toContain("setTimeout")
    // O fetch usa o termo com debounce, nao o valor cru do campo.
    expect(page).toMatch(/params\.set\("search", buscaAplicada\)/)
  })
})
