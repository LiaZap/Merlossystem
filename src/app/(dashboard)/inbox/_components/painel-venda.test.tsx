/**
 * Caminho critico da venda: escolher peca -> confirmar -> gravar pedido.
 *
 * O que estes testes protegem:
 *   - o corpo do POST leva o `productId` DAQUI (e o que `reservadoPorSku` usa;
 *     mandar o id do Bling quebraria a conta de disponivel em silencio);
 *   - nada e gravado antes de o bloqueio de 3s liberar;
 *   - o que a tela mostra e o `disponivel`, nao o saldo cru do Bling.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { PainelVenda } from "./painel-venda"

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const PRODUTO = {
  id: "prod-local-1",
  nome: "Vestido Lua Cheia",
  sku: "VLC-001",
  preco: 189.9,
  tamanhos: ["M"],
  imagem: null,
  saldo: 5,
  reservado: 3,
  disponivel: 2,
}

const props = {
  aberto: true,
  onFechar: vi.fn(),
  contactId: "contato-1",
  contactNome: "Maria",
  conversationId: "conversa-1",
}

function mockarFetch(resposta: unknown) {
  const fn = vi.fn().mockImplementation((url: string) => {
    if (String(url).includes("/api/products/disponibilidade")) {
      return Promise.resolve({ ok: true, json: async () => resposta })
    }
    return Promise.resolve({
      ok: true,
      json: async () => ({ orderNumber: "MS2608-MER-0007" }),
    })
  })
  vi.stubGlobal("fetch", fn)
  return fn
}

beforeEach(() => vi.clearAllMocks())
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const catalogo = (produtos: unknown[], estoqueAoVivo = true) => ({
  loja: { id: "l1", nome: "Centro" },
  estoqueAoVivo,
  produtos,
})

describe("catalogo", () => {
  it("mostra o disponivel, nao o saldo do Bling", async () => {
    // saldo 5, reservado 3 -> a vendedora so pode prometer 2.
    mockarFetch(catalogo([PRODUTO]))
    render(<PainelVenda {...props} />)

    expect(await screen.findByText("2 disp.")).toBeInTheDocument()
    expect(screen.queryByText("5 disp.")).toBeNull()
  })

  it("marca esgotado quando o disponivel zera, mesmo com saldo no Bling", async () => {
    // O saldo cru diria 3 e a peca ja esta toda prometida.
    mockarFetch(catalogo([{ ...PRODUTO, saldo: 3, reservado: 3, disponivel: 0 }]))
    render(<PainelVenda {...props} />)
    expect(await screen.findByText("esgotado")).toBeInTheDocument()
  })

  it("mostra 'estoque ?' quando nao da para saber, em vez de zero", async () => {
    // Zero travaria a venda de peca que existe.
    mockarFetch(catalogo([{ ...PRODUTO, saldo: null, reservado: 0, disponivel: null }], false))
    render(<PainelVenda {...props} />)
    expect(await screen.findByText("estoque ?")).toBeInTheDocument()
    expect(screen.getByText(/não está ao vivo/i)).toBeInTheDocument()
  })
})

describe("fechar a venda", () => {
  it(
    "grava o pedido com o productId DAQUI e os itens escolhidos",
    async () => {
      const fetchMock = mockarFetch(catalogo([PRODUTO]))
      // Relogio real de proposito: o contador do modal usa setInterval, e
      // misturar timers falsos com userEvent + waitFor trava o teste. Custa
      // ~3s, e este e o caminho do dinheiro.
      const usuario = userEvent.setup()
      render(<PainelVenda {...props} />)

      await usuario.click(await screen.findByRole("button", { name: /adicionar .* tamanho M/i }))
      await usuario.click(screen.getByRole("button", { name: /fechar venda/i }))

      const gravar = screen.getByRole("button", { name: /gravar pedido/i })
      await waitFor(() => expect(gravar).toBeEnabled(), { timeout: 6000 })
      await usuario.click(gravar)

      await waitFor(() => {
        expect(fetchMock.mock.calls.some(([u]) => String(u) === "/api/orders")).toBe(true)
      })

      const post = fetchMock.mock.calls.find(([u]) => String(u) === "/api/orders")!
      const corpo = JSON.parse(post[1].body)
      expect(corpo.contactId).toBe("contato-1")
      expect(corpo.conversationId).toBe("conversa-1")
      expect(corpo.items).toEqual([
        {
          productId: "prod-local-1",
          name: "Vestido Lua Cheia",
          size: "M",
          quantity: 1,
          unitPrice: 189.9,
        },
      ])
      // A tela NAO manda numero nem status: quem decide isso e o servidor.
      expect(corpo.orderNumber).toBeUndefined()
      expect(corpo.mascStatus).toBeUndefined()
    },
    15000
  )

  it("nao grava nada enquanto o bloqueio de 3s nao libera", async () => {
    const fetchMock = mockarFetch(catalogo([PRODUTO]))
    const usuario = userEvent.setup()
    render(<PainelVenda {...props} />)

    await usuario.click(await screen.findByRole("button", { name: /adicionar .* tamanho M/i }))
    await usuario.click(screen.getByRole("button", { name: /fechar venda/i }))

    expect(screen.getByRole("button", { name: /gravar pedido/i })).toBeDisabled()
    expect(fetchMock.mock.calls.some(([u]) => String(u) === "/api/orders")).toBe(false)
  })

  it("avisa quando a venda passa do disponivel, sem impedir", async () => {
    // A peca pode estar na mao da vendedora; quem decide e ela, avisada.
    mockarFetch(catalogo([PRODUTO]))
    const usuario = userEvent.setup()
    render(<PainelVenda {...props} />)

    const add = await screen.findByRole("button", { name: /adicionar .* tamanho M/i })
    await usuario.click(add)
    await usuario.click(add)
    await usuario.click(add) // 3 pecas, disponivel = 2

    expect(screen.getByText(/só há 2 disponível/i)).toBeInTheDocument()
    await usuario.click(screen.getByRole("button", { name: /fechar venda/i }))
    expect(screen.getByText(/vendendo mais do que há disponível/i)).toBeInTheDocument()
  })

  it("nao deixa fechar venda sem item", async () => {
    mockarFetch(catalogo([PRODUTO]))
    render(<PainelVenda {...props} />)
    expect(await screen.findByRole("button", { name: /fechar venda/i })).toBeDisabled()
  })

  it("o resumo diz que o pedido ainda precisa ser lancado no Masc", async () => {
    // Sem isso a vendedora acha que o estoque ja baixou.
    mockarFetch(catalogo([PRODUTO]))
    const usuario = userEvent.setup()
    render(<PainelVenda {...props} />)

    await usuario.click(await screen.findByRole("button", { name: /adicionar .* tamanho M/i }))
    await usuario.click(screen.getByRole("button", { name: /fechar venda/i }))
    expect(screen.getByText(/falta lançar no Masc/i)).toBeInTheDocument()
  })
})
