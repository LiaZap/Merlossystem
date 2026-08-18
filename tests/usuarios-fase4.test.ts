/**
 * Fase 4 — cadastro de equipe e conexao de canais.
 *
 * O defeito que motivou tudo: `/api/register` criava usuario com o papel
 * `"agent"`, que nao existe no RBAC e nao satisfaz nenhum dos dois ramos da
 * constraint `users_loja_por_papel`. Toda criacao depois do primeiro admin
 * falhava no banco — e por isso a tela de Equipe nunca passou de mock.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import {
  PAPEIS,
  PAPEIS_SEM_LOJA,
  ROTULO_DO_PAPEL,
  DESCRICAO_DO_PAPEL,
  lojaCombinaComPapel,
  deixariaSemAdmin,
  criarUsuarioSchema,
  CAMPOS_PUBLICOS,
  CAMPOS_DE_GESTAO,
} from "@/lib/usuarios"
import { rolesPermitidos, podeAcessar } from "@/lib/rbac"
import { CHAVES_ESPERADAS, REFERENCIA_DO_PROVEDOR, PROVEDORES_DE_CANAL } from "@/lib/integracoes"

const raiz = resolve(__dirname, "..")
const ler = (...p: string[]) => readFileSync(resolve(raiz, ...p), "utf8")
const semComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

/** Os dois ramos do CHECK `users_loja_por_papel`, como estao no banco. */
function constraintAceita(papel: string, storeId: string | null): boolean {
  return (
    (["admin", "gerente"].includes(papel) && storeId === null) ||
    (["vendedor", "viewer"].includes(papel) && storeId !== null)
  )
}

describe("papeis do sistema sao uma lista so", () => {
  it("os quatro papeis reais, e nada de `agent`", () => {
    expect([...PAPEIS]).toEqual(["admin", "gerente", "vendedor", "viewer"])
    expect(PAPEIS).not.toContain("agent")
  })

  it("todo papel tem rotulo e descricao para a tela", () => {
    for (const p of PAPEIS) {
      expect(ROTULO_DO_PAPEL[p], `rotulo de ${p}`).toBeTruthy()
      expect(DESCRICAO_DO_PAPEL[p], `descricao de ${p}`).toBeTruthy()
    }
  })

  it("todo papel e reconhecido pelo RBAC", () => {
    // Papel que o RBAC nao conhece cria usuario que nao acessa nada.
    for (const p of PAPEIS) {
      const alcanca = ["GET", "POST", "PUT", "DELETE"].some((m) =>
        rolesPermitidos("/api/conversations", m).includes(p)
      )
      expect(alcanca, `${p} nao aparece em nenhuma permissao`).toBe(true)
    }
  })

  it("`agent` nao passa em nada — era o papel que a rota antiga gravava", () => {
    for (const caminho of ["/api/conversations", "/api/messages", "/api/orders"]) {
      for (const metodo of ["GET", "POST"]) {
        expect(podeAcessar("agent", caminho, metodo), `agent ${metodo} ${caminho}`).toBe(false)
      }
    }
  })
})

describe("loja e papel andam juntos", () => {
  it("a regra da aplicacao concorda com a constraint do banco", () => {
    // Divergir aqui significa a API aceitar e o Postgres recusar: o usuario ve
    // um erro de constraint cru em vez de uma mensagem util.
    const casos: Array<[string, string | null]> = [
      ["admin", null],
      ["admin", "centro"],
      ["gerente", null],
      ["gerente", "centro"],
      ["vendedor", null],
      ["vendedor", "centro"],
      ["viewer", null],
      ["viewer", "cerro"],
    ]
    for (const [papel, loja] of casos) {
      expect(lojaCombinaComPapel(papel, loja), `${papel} + ${loja}`).toBe(
        constraintAceita(papel, loja)
      )
    }
  })

  it("`agent` e recusado com e sem loja", () => {
    // Prova do defeito: nenhum dos dois ramos aceita, entao o insert falhava
    // sempre, independente do que a tela mandasse.
    expect(constraintAceita("agent", null)).toBe(false)
    expect(constraintAceita("agent", "centro")).toBe(false)
  })

  it("gestao nao tem loja; atendimento tem", () => {
    expect([...PAPEIS_SEM_LOJA]).toEqual(["admin", "gerente"])
  })
})

describe("validacao do cadastro", () => {
  const base = { name: "Maria Silva", email: "maria@merlos.com", password: "senha1234" }

  it("aceita um cadastro completo", () => {
    const r = criarUsuarioSchema.safeParse({ ...base, role: "vendedor", storeId: "centro" })
    expect(r.success).toBe(true)
  })

  it("recusa papel que nao existe", () => {
    expect(criarUsuarioSchema.safeParse({ ...base, role: "agent" }).success).toBe(false)
    expect(criarUsuarioSchema.safeParse({ ...base, role: "superuser" }).success).toBe(false)
  })

  it("exige senha de 8 caracteres", () => {
    // O /api/register aceitava 6. Como aqui quem define a senha inicial e o
    // admin e ela circula por fora do sistema, o piso subiu.
    const curta = criarUsuarioSchema.safeParse({ ...base, password: "1234567", role: "admin" })
    expect(curta.success).toBe(false)
  })

  it("recusa e-mail invalido", () => {
    const r = criarUsuarioSchema.safeParse({ ...base, email: "maria arroba", role: "admin" })
    expect(r.success).toBe(false)
  })
})

describe("a API nao devolve o que nao deve", () => {
  it("nem a lista publica nem a de gestao trazem a senha", () => {
    expect(Object.keys(CAMPOS_PUBLICOS)).not.toContain("passwordHash")
    expect(Object.keys(CAMPOS_DE_GESTAO)).not.toContain("passwordHash")
  })

  it("a lista publica nao traz e-mail; a de gestao traz", () => {
    // A leitura basica e aberta a todo atendente (seletor de transferencia);
    // entregar o e-mail de todo mundo junto seria vazamento.
    expect(Object.keys(CAMPOS_PUBLICOS)).not.toContain("email")
    expect(Object.keys(CAMPOS_DE_GESTAO)).toContain("email")
  })

  it("o detalhe exige admin na propria rota, nao so no RBAC", () => {
    const rota = semComentarios(ler("src", "app", "api", "usuarios", "route.ts"))
    expect(rota).toContain('detalhe')
    expect(rota).toMatch(/usuario\.role !== "admin"/)
  })
})

describe("nao da para trancar a empresa para fora", () => {
  const rota = semComentarios(ler("src", "app", "api", "usuarios", "[id]", "route.ts"))

  const admin = { papelAtual: "admin", ativoAtual: true }

  it("rebaixar o ultimo admin e bloqueado", () => {
    expect(
      deixariaSemAdmin({ ...admin, papelFinal: "vendedor", ativoFinal: true, outrosAdminsAtivos: 0 })
    ).toBe(true)
  })

  it("desativar o ultimo admin e bloqueado", () => {
    expect(
      deixariaSemAdmin({ ...admin, papelFinal: "admin", ativoFinal: false, outrosAdminsAtivos: 0 })
    ).toBe(true)
  })

  it("com outro admin ativo, as duas coisas sao liberadas", () => {
    expect(
      deixariaSemAdmin({ ...admin, papelFinal: "vendedor", ativoFinal: true, outrosAdminsAtivos: 1 })
    ).toBe(false)
    expect(
      deixariaSemAdmin({ ...admin, papelFinal: "admin", ativoFinal: false, outrosAdminsAtivos: 1 })
    ).toBe(false)
  })

  it("o admin continuar admin nunca bloqueia", () => {
    // Trocar so o nome ou a senha do unico admin tem que passar.
    expect(
      deixariaSemAdmin({ ...admin, papelFinal: "admin", ativoFinal: true, outrosAdminsAtivos: 0 })
    ).toBe(false)
  })

  it("quem nao e admin ativo nao dispara a trava", () => {
    // Um vendedor sendo desativado nao tem nada a ver com a regra.
    expect(
      deixariaSemAdmin({
        papelAtual: "vendedor",
        ativoAtual: true,
        papelFinal: "vendedor",
        ativoFinal: false,
        outrosAdminsAtivos: 0,
      })
    ).toBe(false)
    // Admin JA desativado tambem nao: ele nao ocupa o posto.
    expect(
      deixariaSemAdmin({
        papelAtual: "admin",
        ativoAtual: false,
        papelFinal: "vendedor",
        ativoFinal: false,
        outrosAdminsAtivos: 0,
      })
    ).toBe(false)
  })

  it("promover alguem a admin nunca e bloqueado", () => {
    expect(
      deixariaSemAdmin({
        papelAtual: "vendedor",
        ativoAtual: true,
        papelFinal: "admin",
        ativoFinal: true,
        outrosAdminsAtivos: 0,
      })
    ).toBe(false)
  })

  it("os dois handlers consultam a trava", () => {
    // Duas ocorrencias: uma no PUT, uma no DELETE.
    expect(rota.match(/deixariaSemAdmin\(/g)?.length).toBe(2)
  })

  it("ninguem desativa o proprio acesso", () => {
    expect(rota).toMatch(/alvo\.id === usuario\.id/)
  })

  it("DELETE desativa, nao apaga", () => {
    // O usuario e autor de mensagens, pedidos e da trilha de auditoria: apagar
    // a linha reescreveria o historico (ADR 0005).
    expect(rota).toContain("isActive: false")
    expect(rota).not.toContain("prisma.user.delete")
  })

  it("papel e loja sao avaliados no estado FINAL da edicao", () => {
    // Trocar so o papel, mantendo a loja antiga, deixa o par invalido.
    expect(rota).toContain("papelFinal")
    expect(rota).toContain("lojaFinal")
  })
})

describe("register virou so bootstrap", () => {
  const rota = semComentarios(ler("src", "app", "api", "register", "route.ts"))

  it("nao cria mais equipe pela rota publica", () => {
    expect(rota).toContain("ehBootstrap")
    expect(rota).toMatch(/status: 403/)
    // O papel invalido nao pode voltar por aqui.
    expect(rota).not.toContain('"agent"')
    expect(rota).not.toContain("role: z.enum")
  })

  it("o primeiro usuario nasce admin", () => {
    expect(rota).toMatch(/roleFinal = "admin"/)
  })
})

describe("tela de equipe usa dados de verdade", () => {
  const tela = ler("src", "app", "(dashboard)", "settings", "team", "page.tsx")

  it("nao tem mais lista de pessoas escrita no codigo", () => {
    expect(tela).not.toContain("initialMembers")
    expect(tela).toContain("/api/usuarios?detalhe=1")
  })

  it("oferece os quatro papeis, da constante, nao escritos a mao", () => {
    expect(tela).toContain("PAPEIS.map")
    expect(tela).not.toMatch(/value="agent"/)
  })

  it("desativar passa pela confirmacao com bloqueio", () => {
    expect(tela).toContain("ModalConfirmacaoBlock")
  })
})

describe("conectar canal por token", () => {
  const form = ler(
    "src",
    "app",
    "(dashboard)",
    "settings",
    "integracoes",
    "_components",
    "conectar-conta.tsx"
  )

  it("os campos vem de CHAVES_ESPERADAS, nao escritos a mao", () => {
    // Assim acrescentar uma credencial no backend faz o campo aparecer sozinho,
    // em vez de a tela salvar credencial incompleta.
    expect(form).toContain("CHAVES_ESPERADAS[provedor]")
    expect(form).toContain("chaves.map")
  })

  it("todo provedor de canal por token sabe explicar sua referencia", () => {
    // Sem esta explicacao a pessoa digita o valor errado, a integracao grava
    // sem erro e o canal fica mudo: o webhook nao acha a conta.
    for (const p of PROVEDORES_DE_CANAL) {
      if (!CHAVES_ESPERADAS[p]) continue // conecta por OAuth
      expect(REFERENCIA_DO_PROVEDOR[p], `referencia de ${p}`).toBeTruthy()
      expect(REFERENCIA_DO_PROVEDOR[p]!.ajuda.length).toBeGreaterThan(20)
    }
  })

  it("a tela cobre os quatro canais que faltavam", () => {
    for (const p of ["whatsapp_oficial", "uazapi", "instagram", "facebook"]) {
      expect(form, `${p} ausente do seletor`).toContain(p)
    }
  })

  it("avisa que o uazapi nao e oficial", () => {
    expect(form).toContain("não é a API oficial")
  })

  it("trocar de canal limpa a credencial digitada", () => {
    // Token de um provedor nao serve para outro; deixar o valor no campo
    // salvaria a credencial errada sem ninguem perceber.
    expect(form).toContain("setCredenciais({})")
  })
})
