/**
 * O seletor muda de forma conforme o papel: gestao escolhe, vendedor so ve.
 * Sem isso, um erro de condicao daria ao vendedor um menu que o servidor
 * ignora — pior que nao ter menu.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { SeletorLoja } from "./SeletorLoja"

const LOJAS = [
  { id: "id-centro", nome: "Centro", slug: "centro" },
  { id: "id-cerro", nome: "Cerro Azul", slug: "cerro-azul" },
]

function mockarApi(resposta: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => resposta })
  )
}

beforeEach(() => {
  document.cookie = "loja_ativa=; path=/; max-age=0"
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("gestao", () => {
  it("mostra o menu com as duas lojas e a opcao de ver todas", async () => {
    mockarApi({ lojas: LOJAS, podeTrocar: true })
    render(<SeletorLoja />)

    const gatilho = await screen.findByRole("button", { name: /trocar de loja/i })
    expect(gatilho).toBeInTheDocument()
    expect(gatilho).toHaveTextContent("Todas as lojas")

    // userEvent, nao fireEvent: o menu do Base UI abre no `pointerdown`, e
    // `fireEvent.click` dispara so o `click`. O teste passava por sorte de
    // timing e caia sob carga da suite inteira.
    await userEvent.click(gatilho)
    expect(await screen.findByText("Centro")).toBeInTheDocument()
    expect(await screen.findByText("Cerro Azul")).toBeInTheDocument()
  })

  it("mostra a loja escolhida quando o cookie ja existe", async () => {
    document.cookie = "loja_ativa=id-cerro; path=/"
    mockarApi({ lojas: LOJAS, podeTrocar: true })
    render(<SeletorLoja />)

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /trocar de loja/i })
      ).toHaveTextContent("Cerro Azul")
    })
  })
})

describe("vendedor", () => {
  it("ve a etiqueta da propria loja, sem menu", async () => {
    mockarApi({ lojas: [LOJAS[0]], podeTrocar: false })
    render(<SeletorLoja />)

    expect(await screen.findByText("Centro")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /trocar de loja/i })).toBeNull()
  })
})

describe("degradacao", () => {
  it("some quando a API falha, em vez de quebrar o cabecalho", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("rede")))
    const { container } = render(<SeletorLoja />)
    await waitFor(() => expect(container).toBeEmptyDOMElement())
  })

  it("some quando o usuario nao alcanca loja nenhuma", async () => {
    mockarApi({ lojas: [], podeTrocar: false })
    const { container } = render(<SeletorLoja />)
    await waitFor(() => expect(container).toBeEmptyDOMElement())
  })
})
