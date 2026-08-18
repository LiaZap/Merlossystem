/**
 * Autoria vem da sessao, nunca do corpo da requisicao.
 *
 * Checagem estatica sobre o fonte das 50 rotas: e o unico jeito de travar a
 * regra sem subir banco. Se alguem voltar a ler `createdBy` do body — em rota
 * existente ou nova — o teste aponta o arquivo.
 */
import { describe, it, expect } from "vitest"
import { listarRotas } from "./rotas"

const rotas = listarRotas()

/** Campos que dizem QUEM fez a acao. */
const CAMPOS_DE_AUTORIA = [
  "createdBy",
  "senderId",
  "changedBy",
  "acknowledgedBy",
  "uploadedBy",
  "resolvedBy",
]

/**
 * Le autoria da entrada do cliente: `body.createdBy`, `data.senderId`,
 * `formData.get("uploadedBy")`.
 *
 * O `(?!\s*=[^=])` no fim exclui atribuicao — `data.resolvedBy = usuario.id`
 * escreve no objeto local a partir da sessao, que e justamente o certo.
 */
const LEITURA_DO_CLIENTE = new RegExp(
  `\\b(body|data|input|payload)\\.(${CAMPOS_DE_AUTORIA.join("|")})\\b(?!\\s*=[^=])` +
    `|formData\\.get\\(\\s*["'](${CAMPOS_DE_AUTORIA.join("|")})["']`
)

/** Declara o campo no schema Zod, ou seja, aceita do cliente. */
const NO_SCHEMA_ZOD = new RegExp(`^\\s*(${CAMPOS_DE_AUTORIA.join("|")})\\s*:\\s*z\\.`, "m")

describe("autoria nunca vem do cliente", () => {
  it.each(rotas.map((r) => [r.rota, r.fonte] as const))(
    "%s nao le autoria do body/formData",
    (_rota, fonte) => {
      const linhasRuins = fonte
        .split("\n")
        .map((l, i) => ({ n: i + 1, l }))
        .filter(({ l }) => !l.trim().startsWith("//") && LEITURA_DO_CLIENTE.test(l))
      expect(linhasRuins.map((x) => `L${x.n}: ${x.l.trim()}`)).toEqual([])
    }
  )

  it.each(rotas.map((r) => [r.rota, r.fonte] as const))(
    "%s nao aceita campo de autoria no schema Zod",
    (_rota, fonte) => {
      expect(NO_SCHEMA_ZOD.test(fonte)).toBe(false)
    }
  )
})

describe("quem grava autoria usa a sessao", () => {
  // Grava autoria = escreve o campo, seja como `campo: valor` (objeto Prisma)
  // ou `data.campo = valor` (objeto montado a mao).
  const gravamAutoria = rotas.filter((r) =>
    CAMPOS_DE_AUTORIA.some((c) => new RegExp(`\\b${c}\\s*[:=]`).test(r.fonte))
  )

  it("as rotas que gravam autoria sao as esperadas", () => {
    expect(gravamAutoria.map((r) => r.rota).sort()).toEqual([
      "/api/alerts/[id]",
      "/api/broadcasts",
      "/api/deals/[id]",
      "/api/knowledge",
      "/api/media/send",
      "/api/media/upload",
      "/api/messages",
      "/api/orders",
      "/api/orders/[id]",
      "/api/orders/[id]/masc",
      "/api/returns/[id]",
      "/api/scheduled",
    ])
  })

  it.each(gravamAutoria.map((r) => [r.rota, r.fonte] as const))(
    "%s pega o usuario da sessao",
    (_rota, fonte) => {
      expect(fonte).toContain("usuarioDaSessao")
      expect(fonte).toContain("usuario.id")
    }
  )
})

describe("trilha de auditoria", () => {
  const activityLogs = rotas.find((r) => r.rota === "/api/activity-logs")!

  it("grava userId e ipAddress do servidor, nao do body", () => {
    expect(activityLogs.fonte).toContain("userId: usuario.id")
    expect(activityLogs.fonte).not.toContain("body.userId")
    expect(activityLogs.fonte).not.toContain("body.ipAddress")
    expect(activityLogs.fonte).toContain("x-forwarded-for")
  })
})
