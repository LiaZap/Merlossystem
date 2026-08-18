"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import {
  CHAVES_ESPERADAS,
  REFERENCIA_DO_PROVEDOR,
  AJUDA_DA_CHAVE,
  type Provedor,
} from "@/lib/integracoes-catalogo"

/**
 * Conectar uma conta de canal por token.
 *
 * Antes a tela so tinha botao para Bling e TikTok, que conectam por OAuth.
 * Instagram, Facebook, WhatsApp oficial e uazapi conectam por token e nao
 * tinham NENHUM caminho na interface — o backend aceitava (`POST
 * /api/integracoes`), mas nao havia como chegar la sem chamar a API na mao.
 *
 * Os campos sao gerados a partir de `CHAVES_ESPERADAS`, a mesma constante que o
 * servidor usa para recusar credencial incompleta. Assim o formulario nao pode
 * divergir do que o envio precisa: acrescentar uma chave no backend faz o campo
 * aparecer aqui sozinho.
 */

const ROTULO: Record<string, string> = {
  whatsapp_oficial: "WhatsApp (API oficial)",
  uazapi: "WhatsApp (uazapi)",
  instagram: "Instagram",
  facebook: "Facebook",
}

/** Provedores que conectam por token — os de OAuth tem botao proprio. */
const POR_TOKEN = ["whatsapp_oficial", "uazapi", "instagram", "facebook"] as const

export function ConectarConta({ onConectado }: { onConectado: () => void }) {
  const [aberto, setAberto] = useState(false)
  const [provedor, setProvedor] = useState<Provedor>("whatsapp_oficial")
  const [rotulo, setRotulo] = useState("")
  const [referencia, setReferencia] = useState("")
  const [credenciais, setCredenciais] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState(false)

  const chaves = CHAVES_ESPERADAS[provedor] ?? []
  const ajudaReferencia = REFERENCIA_DO_PROVEDOR[provedor]

  function trocarProvedor(novo: Provedor) {
    setProvedor(novo)
    // Credencial de um provedor nao serve para outro, e deixar o valor antigo
    // no campo faria salvar o token errado sem ninguem perceber.
    setCredenciais({})
    setReferencia("")
  }

  async function salvar() {
    const faltando = chaves.filter((k) => !credenciais[k]?.trim())
    if (!rotulo.trim() || !referencia.trim() || faltando.length > 0) {
      toast.error("Preencha o apelido, o identificador da conta e todas as credenciais.")
      return
    }

    setSalvando(true)
    try {
      const res = await fetch("/api/integracoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provedor,
          rotulo: rotulo.trim(),
          referenciaExterna: referencia.trim(),
          credenciais,
        }),
      })
      const dados = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(dados.error || "Não foi possível conectar a conta.")
        return
      }

      toast.success(
        provedor === "uazapi"
          ? "Conta criada. Agora leia o QR code para parear o número."
          : "Conta conectada."
      )
      setAberto(false)
      setRotulo("")
      setReferencia("")
      setCredenciais({})
      onConectado()
    } finally {
      setSalvando(false)
    }
  }

  return (
    <>
      <Button variant="outline" onClick={() => setAberto(true)}>
        Conectar Instagram, Facebook ou WhatsApp
      </Button>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Conectar conta de canal</DialogTitle>
            <DialogDescription>
              Cada conta pertence a uma loja: a resposta sai pelo mesmo número ou
              perfil em que a mensagem entrou.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="provedor">Canal</Label>
              <select
                id="provedor"
                value={provedor}
                onChange={(e) => trocarProvedor(e.target.value as Provedor)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {POR_TOKEN.map((p) => (
                  <option key={p} value={p}>
                    {ROTULO[p]}
                  </option>
                ))}
              </select>
              {provedor === "uazapi" && (
                <p className="text-xs text-amber-700">
                  O uazapi não é a API oficial do WhatsApp. O número pode ser
                  bloqueado pela Meta.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="rotulo">Apelido da conta</Label>
              <Input
                id="rotulo"
                value={rotulo}
                placeholder="ex.: WhatsApp Centro"
                onChange={(e) => setRotulo(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Só para você reconhecer a conta nesta tela.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="referencia">
                {ajudaReferencia?.rotulo ?? "Identificador da conta"}
              </Label>
              <Input
                id="referencia"
                value={referencia}
                onChange={(e) => setReferencia(e.target.value)}
              />
              {ajudaReferencia && (
                <p className="text-xs text-muted-foreground">{ajudaReferencia.ajuda}</p>
              )}
            </div>

            {chaves.map((chave) => (
              <div key={chave} className="space-y-2">
                <Label htmlFor={chave}>{chave}</Label>
                <Input
                  id={chave}
                  type="password"
                  value={credenciais[chave] ?? ""}
                  onChange={(e) =>
                    setCredenciais((c) => ({ ...c, [chave]: e.target.value }))
                  }
                />
                {AJUDA_DA_CHAVE[chave] && (
                  <p className="text-xs text-muted-foreground">{AJUDA_DA_CHAVE[chave]}</p>
                )}
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={salvando}>
              {salvando ? "Conectando..." : "Conectar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
