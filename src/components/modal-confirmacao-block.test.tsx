/**
 * O bloqueio de 3s e regra da base para acao critica (CLAUDE.md).
 *
 * O que ele protege: quem clica "salvar" dezenas de vezes por dia para de ler o
 * dialogo. Se o botao estiver clicavel no primeiro frame, o resumo nunca e
 * lido — e o modal vira um obstaculo decorativo.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, act } from "@testing-library/react"
import { ModalConfirmacaoBlock } from "./modal-confirmacao-block"

const props = {
  aberto: true,
  titulo: "Fechar venda",
  mensagem: "Confirma?",
  onConfirmar: vi.fn(),
  onCancelar: vi.fn(),
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
})
afterEach(() => {
  vi.useRealTimers()
})

/** Avanca o relogio dentro do act, para o React processar os setState. */
function avancar(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

describe("bloqueio de 3 segundos", () => {
  it("nasce com os dois botoes desabilitados", () => {
    render(<ModalConfirmacaoBlock {...props} />)
    expect(screen.getByRole("button", { name: /confirmar/i })).toBeDisabled()
    expect(screen.getByRole("button", { name: /cancelar/i })).toBeDisabled()
  })

  it("continua bloqueado em 2s e libera em 3s", () => {
    render(<ModalConfirmacaoBlock {...props} />)

    avancar(2000)
    expect(screen.getByRole("button", { name: /confirmar/i })).toBeDisabled()

    avancar(1000)
    expect(screen.getByRole("button", { name: /confirmar/i })).toBeEnabled()
    expect(screen.getByRole("button", { name: /cancelar/i })).toBeEnabled()
  })

  it("mostra a contagem, para o bloqueio nao parecer travamento", () => {
    // Sem o contador o usuario acha que a tela quebrou e recarrega.
    render(<ModalConfirmacaoBlock {...props} />)
    expect(screen.getByText(/libera em 3s/i)).toBeInTheDocument()
    avancar(1000)
    expect(screen.getByText(/libera em 2s/i)).toBeInTheDocument()
  })

  it("reinicia a contagem a cada abertura", () => {
    // Reaproveitar a contagem anterior entregaria o botao liberado de imediato
    // na segunda confirmacao — justo quando o automatismo e maior.
    const { rerender } = render(<ModalConfirmacaoBlock {...props} />)
    avancar(3000)
    expect(screen.getByRole("button", { name: /confirmar/i })).toBeEnabled()

    rerender(<ModalConfirmacaoBlock {...props} aberto={false} />)
    rerender(<ModalConfirmacaoBlock {...props} aberto />)
    expect(screen.getByRole("button", { name: /confirmar/i })).toBeDisabled()
  })

  it("nao confirma enquanto grava", () => {
    render(<ModalConfirmacaoBlock {...props} carregando />)
    avancar(3000)
    expect(screen.getByRole("button", { name: /gravando/i })).toBeDisabled()
  })

  it("o resumo aparece desde o primeiro instante", () => {
    // O ponto do bloqueio e dar tempo de LER: se o texto so aparecesse depois,
    // os 3 segundos nao serviriam para nada.
    render(<ModalConfirmacaoBlock {...props} />)
    expect(screen.getByText("Confirma?")).toBeInTheDocument()
    expect(screen.getByText("Fechar venda")).toBeInTheDocument()
  })
})
