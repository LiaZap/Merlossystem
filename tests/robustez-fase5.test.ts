/**
 * Fase 5 — robustez.
 *
 * Cinco defeitos que nao aparecem no uso normal e aparecem no dia ruim:
 * reentrega de webhook duplicando mensagem, `?limit=999999`, upload sem teto,
 * trilha de auditoria vazia, e menu oferecendo caminho que o papel nao pode
 * seguir.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { limiteDaPagina, paginaAtual, LIMITE_MAXIMO } from "@/lib/paginacao"
import {
  tipoAceito,
  recusaDoArquivo,
  recusaPeloCabecalho,
  TETO_POR_TIPO,
  TETO_ABSOLUTO,
} from "@/lib/media/limites"
import { diferenca, ACOES } from "@/lib/auditoria"

const raiz = resolve(__dirname, "..")
const ler = (...p: string[]) => readFileSync(resolve(raiz, ...p), "utf8")
const semComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

// ------------------------------------------------------------- paginacao

describe("teto de paginacao", () => {
  it("grampeia o pedido exagerado", () => {
    // `?limit=999999` montava a lista inteira em memoria. Nao e ataque: e um
    // numero digitado.
    expect(limiteDaPagina("999999", 30)).toBe(LIMITE_MAXIMO)
    expect(limiteDaPagina("101", 30)).toBe(LIMITE_MAXIMO)
  })

  it("texto e vazio caem no padrao da rota", () => {
    // `parseInt("abc")` devolvia NaN, que virava `take: NaN` no Prisma.
    expect(limiteDaPagina("abc", 30)).toBe(30)
    expect(limiteDaPagina(null, 20)).toBe(20)
    expect(limiteDaPagina("", 50)).toBe(50)
  })

  it("zero e negativo viram 1", () => {
    // `take` negativo inverte a ordem no Prisma, silenciosamente.
    expect(limiteDaPagina("0", 30)).toBe(1)
    expect(limiteDaPagina("-5", 30)).toBe(1)
  })

  it("o pedido honesto passa intacto", () => {
    expect(limiteDaPagina("15", 30)).toBe(15)
    expect(limiteDaPagina("100", 30)).toBe(100)
  })

  it("fracionario nao chega ao banco", () => {
    expect(limiteDaPagina("10.9", 30)).toBe(10)
  })

  it("pagina nunca e menor que 1", () => {
    // `skip` negativo o Prisma recusa com erro cru.
    expect(paginaAtual("0")).toBe(1)
    expect(paginaAtual("-3")).toBe(1)
    expect(paginaAtual("abc")).toBe(1)
    expect(paginaAtual("7")).toBe(7)
  })

  it("nenhuma rota lista mais usa parseInt cru", () => {
    const rotas = [
      ["activity-logs"], ["alerts"], ["contacts"], ["conversations"],
      ["media", "gallery"], ["messages"], ["orders"], ["products"],
    ]
    for (const r of rotas) {
      const src = semComentarios(ler("src", "app", "api", ...r, "route.ts"))
      expect(src, r.join("/")).not.toMatch(/parseInt\(searchParams\.get\("(limit|page)"\)/)
      expect(src, r.join("/")).toContain("limiteDaPagina(")
    }
  })
})

// ---------------------------------------------------------------- upload

describe("limite de upload", () => {
  it("recusa tipo que executa script no navegador", () => {
    // A galeria mostra imagem inline; `svg+xml` e XML que roda script.
    expect(tipoAceito("image/svg+xml")).toBeNull()
    expect(tipoAceito("text/html")).toBeNull()
    expect(tipoAceito("application/x-msdownload")).toBeNull()
  })

  it("aceita o que a loja realmente manda", () => {
    expect(tipoAceito("image/jpeg")).toBe("image")
    expect(tipoAceito("video/mp4")).toBe("video")
    expect(tipoAceito("audio/ogg")).toBe("audio")
    expect(tipoAceito("application/pdf")).toBe("document")
  })

  it("ignora o parametro do content-type", () => {
    // Navegador manda `audio/webm;codecs=opus` na gravacao de audio.
    expect(tipoAceito("audio/webm;codecs=opus")).toBe("audio")
    expect(tipoAceito("IMAGE/JPEG")).toBe("image")
  })

  it("recusa arquivo acima do teto do tipo", () => {
    const grande = { size: TETO_POR_TIPO.image + 1, type: "image/jpeg" }
    expect(recusaDoArquivo(grande)?.status).toBe(413)
  })

  it("aceita exatamente no teto", () => {
    expect(recusaDoArquivo({ size: TETO_POR_TIPO.image, type: "image/jpeg" })).toBeNull()
  })

  it("recusa arquivo vazio", () => {
    expect(recusaDoArquivo({ size: 0, type: "image/jpeg" })?.status).toBe(400)
  })

  it("corta pelo cabecalho antes de ler o corpo", () => {
    // `formData()` le tudo na memoria; um video de 1 GB derrubava o processo.
    const h = new Headers({ "content-length": String(TETO_ABSOLUTO + 1) })
    expect(recusaPeloCabecalho(h)?.status).toBe(413)
  })

  it("cabecalho ausente ou mentiroso nao bloqueia sozinho", () => {
    // O cabecalho e do cliente: serve para o caso honesto, nao substitui a
    // conferencia do tamanho real.
    expect(recusaPeloCabecalho(new Headers())).toBeNull()
    expect(recusaPeloCabecalho(new Headers({ "content-length": "abc" }))).toBeNull()
  })

  it("a rota confere nos dois momentos", () => {
    const arquivo = semComentarios(ler("src", "app", "api", "media", "upload", "route.ts"))
    // Sem o cabecalho de imports: la os dois nomes aparecem juntos e a ordem
    // do corpo — que e o que importa — se perderia.
    const src = arquivo.slice(arquivo.indexOf("export async function POST"))
    const posCabecalho = src.indexOf("recusaPeloCabecalho")
    const posFormData = src.indexOf("req.formData()")
    const posArquivo = src.indexOf("recusaDoArquivo")
    expect(posCabecalho).toBeGreaterThan(-1)
    // A ordem e o que importa: cortar ANTES de ler o corpo.
    expect(posCabecalho).toBeLessThan(posFormData)
    expect(posArquivo).toBeGreaterThan(posFormData)
  })
})

// --------------------------------------------------------- idempotencia

describe("reentrega de webhook nao duplica mensagem", () => {
  const gateway = semComentarios(ler("src", "lib", "channels", "gateway.ts"))

  it("sai antes de processar quando ja conhece o externalId", () => {
    // Meta e uazapi reentregam quando nao recebem 200 no prazo. Sem isto a
    // cliente aparecia perguntando a mesma coisa duas vezes.
    const posChecagem = gateway.indexOf("jaProcessada")
    const posCriaContato = gateway.indexOf("prisma.contact.create")
    expect(posChecagem).toBeGreaterThan(-1)
    // Antes ate de criar contato: sair cedo evita baixar a midia de novo.
    expect(posChecagem).toBeLessThan(posCriaContato)
    // A saida em si, e nao so a consulta: desligar o `if` deixaria a consulta
    // no lugar e o processamento seguiria criando a segunda bolha.
    expect(gateway).toContain("if (jaProcessada) return null")
  })

  it("a corrida de duas entregas simultaneas cai no indice unico", () => {
    expect(gateway).toContain('code === "P2002"')
  })

  it("o indice existe no SQL que chega ao banco", () => {
    const sql = ler("prisma", "sql", "constraints.sql")
    expect(sql).toContain("messages_store_external_id")
    expect(sql).toContain("CREATE UNIQUE INDEX IF NOT EXISTS")
    // Parcial: nota interna nasce sem external_id.
    expect(sql).toMatch(/WHERE external_id IS NOT NULL/)
  })

  it("o schema do Prisma declara o mesmo indice", () => {
    const schema = ler("prisma", "schema.prisma")
    expect(schema).toContain("@@unique([storeId, externalId]")
  })
})

describe("as constraints alcancam o banco de producao", () => {
  const bootstrap = semComentarios(ler("scripts", "db-bootstrap.mjs"))

  it("o bootstrap aplica constraints.sql", () => {
    // Faltava: o script criava so as tabelas, e `users_loja_por_papel` nunca
    // chegava ao deploy — o banco publicado ficava sem as regras que o codigo
    // assume existirem.
    expect(bootstrap).toContain("constraints.sql")
    expect(bootstrap).toContain("aplicarConstraints")
  })

  it("aplica tambem em banco que ja tem tabelas", () => {
    // E o canal por onde uma constraint nova alcanca um banco existente. Se
    // isto voltar para dentro do `else`, so banco novo recebe.
    const posSaida = bootstrap.indexOf("schema preservado")
    const posConstraints = bootstrap.indexOf("await aplicarConstraints(cliente)")
    expect(posConstraints).toBeGreaterThan(posSaida)
  })

  it("falha de constraint nao impede o container de subir", () => {
    // Banco com dado que viola a regra nova nao pode virar container que nao
    // inicia: o operador precisa ver o aviso e poder entrar para arrumar.
    expect(bootstrap).toMatch(/catch[\s\S]{0,200}AVISO/)
  })
})

// ------------------------------------------------------------- auditoria

describe("trilha de auditoria", () => {
  it("as acoes registradas sao uma lista fechada", () => {
    expect(ACOES.length).toBeGreaterThan(5)
    expect([...ACOES]).toContain("usuario_criado")
    expect([...ACOES]).toContain("integracao_conectada")
  })

  it("o diff mostra o que mudou, nao o estado inteiro", () => {
    const d = diferenca(
      { name: "Ana", role: "vendedor", isActive: true },
      { name: "Ana", role: "gerente", isActive: undefined }
    )
    // `name` igual e `isActive` nao informado ficam de fora.
    expect(Object.keys(d)).toEqual(["role"])
    expect(d.role).toEqual({ de: "vendedor", para: "gerente" })
  })

  it("as mutacoes sensiveis registram", () => {
    const alvos: Array<[string[], string]> = [
      [["src", "app", "api", "usuarios", "route.ts"], "usuario_criado"],
      [["src", "app", "api", "usuarios", "[id]", "route.ts"], "usuario_desativado"],
      [["src", "app", "api", "integracoes", "route.ts"], "integracao_conectada"],
      [["src", "app", "api", "integracoes", "[id]", "route.ts"], "integracao_desconectada"],
      [["src", "app", "api", "conversations", "[id]", "route.ts"], "conversa_resolvida"],
    ]
    for (const [caminho, acao] of alvos) {
      const src = semComentarios(ler(...caminho))
      expect(src, caminho.join("/")).toContain("registrar(")
      expect(src, `${caminho.join("/")} sem ${acao}`).toContain(acao)
    }
  })

  it("segredo nao entra no log", () => {
    // `details` vira resposta de API na tela de auditoria.
    const src = ler("src", "lib", "auditoria.ts")
    expect(src).toContain("limparDetalhes")
    expect(src).toMatch(/senha\|password\|token\|secret/)
  })

  it("falha de auditoria nao derruba a operacao", () => {
    // A acao do usuario ja aconteceu: abortar depois do fato e pior.
    const src = semComentarios(ler("src", "lib", "auditoria.ts"))
    expect(src).toMatch(/catch[\s\S]{0,160}console\.error/)
  })

  it("a coluna aceita acao de rede", () => {
    // Cadastrar admin e conectar o Bling nao pertencem a loja nenhuma; com
    // `store_id` NOT NULL, as acoes mais sensiveis nao cabiam na tabela.
    const schema = ler("prisma", "schema.prisma")
    const inicio = schema.indexOf("model ActivityLog ")
    const bloco = schema.slice(inicio, schema.indexOf("\n}", inicio))
    expect(inicio).toBeGreaterThan(-1)
    expect(bloco).toMatch(/storeId\s+String\?\s+@map\("store_id"\)/)
    expect(bloco).toMatch(/store\s+Store\?\s+@relation/)
    expect(ler("prisma", "sql", "constraints.sql")).toContain(
      "ALTER TABLE activity_logs ALTER COLUMN store_id DROP NOT NULL"
    )
  })
})

// ------------------------------------------------------------------ menu

describe("o menu nao oferece caminho fechado", () => {
  it("o indice de configuracoes filtra pelo papel", () => {
    // Antes o vendedor via "Equipe [admin]", clicava e caia numa pagina que so
    // dizia "apenas administradores".
    const src = ler("src", "app", "(dashboard)", "settings", "page.tsx")
    expect(src).toContain("usuarioDaSessao")
    expect(src).toMatch(/AREAS\.filter\(/)
    expect(src).toContain("areas.map(")
  })
})
