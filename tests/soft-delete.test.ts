/**
 * Soft delete (ADR 0005).
 *
 * O risco desta migracao nao e adicionar a coluna — e **esquecer um filtro**.
 * Registro excluido que reaparece na tela e o tipo de erro que ninguem
 * descobre revisando codigo. Por isso o filtro mora no cliente do Prisma, e
 * estes testes travam as tres coisas que o mantem honesto:
 *
 *   1. nenhuma rota volta a apagar de verdade (menos a LGPD, que e obrigada);
 *   2. os models com `is_deleted` nao sao consultados por `findUnique`, que o
 *      guard nao alcanca;
 *   3. excluir grava QUEM e QUANDO, nao so o booleano.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { MODELS_SOFT_DELETE } from "@/lib/db/soft-delete"
import { listarRotas } from "./rotas"

const raiz = resolve(__dirname, "..")
const ler = (...p: string[]) => readFileSync(resolve(raiz, ...p), "utf8")
const schema = ler("prisma", "schema.prisma")
const rotas = listarRotas()

/** `Contact` -> `contact`, para casar com `prisma.contact.` */
const camel = (m: string) => m[0].toLowerCase() + m.slice(1)

describe("schema", () => {
  it.each(MODELS_SOFT_DELETE)("%s tem as colunas de exclusao logica", (model) => {
    const bloco = schema.match(new RegExp(`model ${model} \\{[\\s\\S]*?\\n\\}`, "m"))
    expect(bloco, model).toBeTruthy()
    for (const coluna of ["deleted_at", "is_deleted", "modified_by", "updated_at"]) {
      expect(bloco![0], `${model}.${coluna}`).toContain(coluna)
    }
  })

  it("is_deleted nasce false — registro antigo nao some no deploy", () => {
    for (const model of MODELS_SOFT_DELETE) {
      const bloco = schema.match(new RegExp(`model ${model} \\{[\\s\\S]*?\\n\\}`, "m"))![0]
      expect(bloco, model).toMatch(/isDeleted\s+Boolean\s+@default\(false\)/)
    }
  })
})

describe("nenhuma rota apaga de verdade", () => {
  const FISICO = /prisma\.\w+\.(delete|deleteMany)\s*\(/

  it.each(
    rotas
      .filter((r) => FISICO.test(r.fonte))
      .map((r) => [r.rota, r.fonte] as const)
  )("%s so apaga com a excecao da LGPD declarada", (_rota, fonte) => {
    // A LGPD (art. 18, VI) da direito a ELIMINACAO: soft delete nao cumpre,
    // porque o dado continuaria no banco. Toda linha que apaga de verdade tem
    // que dizer isso na propria linha.
    for (const linha of fonte.split("\n")) {
      if (FISICO.test(linha)) {
        expect(linha).toContain("compliance:delete-fisico-lgpd")
      }
    }
  })

  it("o apagamento definitivo existe em um lugar so", () => {
    const comFisico = rotas.filter((r) => FISICO.test(r.fonte)).map((r) => r.rota)
    expect(comFisico).toEqual(["/api/lgpd"])
  })

  it.each(MODELS_SOFT_DELETE)("excluir %s grava quem e quando", (model) => {
    const nome = camel(model)
    const usa = rotas.filter((r) => r.fonte.includes(`prisma.${nome}.update(`))
    const excluem = usa.filter((r) => r.fonte.includes("isDeleted: true"))
    // Nem todo model tem rota de exclusao; os que tem precisam do rastro.
    for (const r of excluem) {
      const trecho = r.fonte.slice(r.fonte.indexOf("isDeleted: true"))
      expect(trecho.slice(0, 160), r.rota).toContain("deletedAt")
      expect(trecho.slice(0, 160), r.rota).toContain("modifiedBy")
    }
  })
})

describe("o guard central nao tem buraco", () => {
  const guard = ler("src", "lib", "db", "soft-delete.ts")

  it("o cliente exportado passa pelo guard", () => {
    // Usar o PrismaClient cru em qualquer lugar reabre tudo de uma vez.
    const cliente = ler("src", "lib", "db", "prisma.ts")
    expect(cliente).toContain("comSoftDelete")
    expect(cliente).toMatch(/return comSoftDelete\(new PrismaClient/)
  })

  it("findUnique fica de fora do guard — e por isso e proibido nestes models", () => {
    // O `where` do findUnique so aceita campo unico: injetar isDeleted ali e
    // erro de runtime. Entao o buraco tem que nao existir no codigo.
    expect(guard).not.toMatch(/"findUnique"/)

    for (const model of MODELS_SOFT_DELETE) {
      const nome = camel(model)
      const culpadas = rotas
        .filter((r) => r.fonte.includes(`prisma.${nome}.findUnique`))
        .map((r) => r.rota)
      // `/api/lgpd` exporta o dossie de um contato que pode estar excluido —
      // e a unica que precisa enxergar por cima do guard.
      expect(culpadas.filter((r) => r !== "/api/lgpd"), model).toEqual([])
    }
  })

  it("quem pede isDeleted explicitamente e respeitado", () => {
    // Sem essa saida, a tela de auditoria ("o que foi excluido, por quem")
    // precisaria de um segundo cliente sem guard — e ai alguem usaria ele
    // para outra coisa.
    expect(guard).toMatch(/if \("isDeleted" in where\) return args/)
  })

  it("models fora da lista nao sao tocados", () => {
    expect(guard).toMatch(/ALVO\.has\(model\)/)
  })
})
