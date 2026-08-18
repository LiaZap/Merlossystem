"use client"

import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { AlertTriangle } from "lucide-react"

/**
 * Confirmacao de acao critica, com bloqueio de 3 segundos.
 *
 * Regra da base (CLAUDE.md): acao critica bloqueia a tela por 3s, nao fecha por
 * ESC nem por clique fora, e so entao libera Confirmar e Cancelar.
 *
 * O ponto nao e atrasar: e **quebrar o automatismo**. Quem clica "salvar" dez
 * vezes por hora nao le mais o texto do dialogo — o bloqueio obriga a olhar o
 * resumo antes de a mao alcancar o botao.
 */

interface ModalConfirmacaoBlockProps {
  aberto: boolean
  titulo: string
  /** Resumo do que vai acontecer. Aparece como texto ou como conteudo rico. */
  mensagem?: string
  children?: React.ReactNode
  /** Rotulo do botao de confirmar. Padrao: "Confirmar". */
  rotuloConfirmar?: string
  onConfirmar: () => void
  onCancelar: () => void
  carregando?: boolean
  /** Segundos de bloqueio. Padrao 3 — so mude com motivo. */
  segundos?: number
}

export function ModalConfirmacaoBlock({
  aberto,
  titulo,
  mensagem,
  children,
  rotuloConfirmar = "Confirmar",
  onConfirmar,
  onCancelar,
  carregando = false,
  segundos = 3,
}: ModalConfirmacaoBlockProps) {
  const [restante, setRestante] = useState(segundos)

  useEffect(() => {
    if (!aberto) return
    // Reinicia a cada abertura: reaproveitar a contagem anterior entregaria o
    // botao liberado de imediato na segunda vez.
    setRestante(segundos)
    const id = setInterval(() => {
      setRestante((r) => (r <= 1 ? 0 : r - 1))
    }, 1000)
    return () => clearInterval(id)
  }, [aberto, segundos])

  const bloqueado = restante > 0

  return (
    <Dialog
      open={aberto}
      /**
       * `open` e controlado pelo pai, e o pedido de fechamento so vira
       * `onCancelar` quando ja liberou. Enquanto bloqueado, ESC e clique fora
       * pedem para fechar, ninguem atende, e o dialogo continua aberto.
       */
      onOpenChange={(open) => {
        if (!open && !bloqueado && !carregando) onCancelar()
      }}
    >
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" />
            {titulo}
          </DialogTitle>
        </DialogHeader>

        {mensagem && <p className="text-sm text-muted-foreground">{mensagem}</p>}
        {children}

        <div
          className="flex items-center justify-end gap-2 pt-2"
          // Leitor de tela anuncia quando os botoes liberam.
          aria-live="polite"
        >
          {bloqueado && (
            <span className="mr-auto text-xs text-muted-foreground">
              Confira o resumo — libera em {restante}s
            </span>
          )}
          <Button variant="outline" onClick={onCancelar} disabled={bloqueado || carregando}>
            Cancelar
          </Button>
          <Button onClick={onConfirmar} disabled={bloqueado || carregando}>
            {carregando ? "Gravando..." : rotuloConfirmar}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
