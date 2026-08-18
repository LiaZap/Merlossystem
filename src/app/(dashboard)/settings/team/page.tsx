"use client"

import { useEffect, useState, useCallback } from "react"
import { UserPlus, Pencil, UserX, UserCheck, Users } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Breadcrumb } from "@/components/ui/breadcrumb"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ModalConfirmacaoBlock } from "@/components/modal-confirmacao-block"
import {
  PAPEIS,
  ROTULO_DO_PAPEL,
  DESCRICAO_DO_PAPEL,
  PAPEIS_SEM_LOJA,
  type Papel,
} from "@/lib/usuarios"

/**
 * Equipe — quem acessa o sistema, com qual papel e em qual loja.
 *
 * Esta tela era inteiramente falsa: tres pessoas escritas no codigo, guardadas
 * num `useState`, e apenas dois papeis ("Admin" e "Agente"). Nenhum dos dois
 * corresponde ao RBAC do sistema, que trabalha com admin, gerente, vendedor e
 * viewer (docs/rbac.md). Editar ali nao gravava em lugar nenhum.
 */

type Membro = {
  id: string
  name: string
  email: string
  role: string
  storeId: string | null
  isActive: boolean
  lastLoginAt: string | null
}

type Loja = { id: string; nome: string }

const CORES_DO_PAPEL: Record<string, string> = {
  admin: "bg-neutral-900 text-white hover:bg-neutral-900",
  gerente: "bg-blue-100 text-blue-900 hover:bg-blue-100",
  vendedor: "bg-emerald-100 text-emerald-900 hover:bg-emerald-100",
  viewer: "bg-neutral-100 text-neutral-700 hover:bg-neutral-100",
}

function formatarAcesso(iso: string | null) {
  if (!iso) return "nunca entrou"
  return new Date(iso).toLocaleDateString("pt-BR")
}

export default function SettingsTeamPage() {
  const [membros, setMembros] = useState<Membro[]>([])
  const [lojas, setLojas] = useState<Loja[]>([])
  const [carregando, setCarregando] = useState(true)
  const [semPermissao, setSemPermissao] = useState(false)
  const [salvando, setSalvando] = useState(false)

  const [dialogoAberto, setDialogoAberto] = useState(false)
  const [editando, setEditando] = useState<Membro | null>(null)
  const [paraDesativar, setParaDesativar] = useState<Membro | null>(null)

  const [nome, setNome] = useState("")
  const [email, setEmail] = useState("")
  const [senha, setSenha] = useState("")
  const [papel, setPapel] = useState<Papel>("vendedor")
  const [lojaId, setLojaId] = useState("")

  const exigeLoja = !PAPEIS_SEM_LOJA.includes(papel)

  const carregar = useCallback(async () => {
    const [resUsuarios, resLojas] = await Promise.all([
      fetch("/api/usuarios?detalhe=1"),
      fetch("/api/lojas"),
    ])

    if (resUsuarios.status === 403) {
      setSemPermissao(true)
      setCarregando(false)
      return
    }
    if (resUsuarios.ok) setMembros(await resUsuarios.json())
    if (resLojas.ok) {
      const dados = await resLojas.json()
      setLojas(dados.lojas ?? [])
    }
    setCarregando(false)
  }, [])

  useEffect(() => {
    void carregar()
  }, [carregar])

  function abrirNovo() {
    setEditando(null)
    setNome("")
    setEmail("")
    setSenha("")
    setPapel("vendedor")
    setLojaId("")
    setDialogoAberto(true)
  }

  function abrirEdicao(m: Membro) {
    setEditando(m)
    setNome(m.name)
    setEmail(m.email)
    setSenha("")
    setPapel(m.role as Papel)
    setLojaId(m.storeId ?? "")
    setDialogoAberto(true)
  }

  async function salvar() {
    if (exigeLoja && !lojaId) {
      toast.error(`${ROTULO_DO_PAPEL[papel]} precisa estar em uma loja.`)
      return
    }
    setSalvando(true)
    try {
      // Papel de gestao alcanca as duas lojas: manda `null` de proposito. Sem
      // isso a constraint `users_loja_por_papel` recusa a gravacao.
      const corpo = {
        name: nome,
        role: papel,
        storeId: exigeLoja ? lojaId : null,
        ...(senha ? { password: senha } : {}),
        ...(editando ? {} : { email }),
      }

      const res = await fetch(
        editando ? `/api/usuarios/${editando.id}` : "/api/usuarios",
        {
          method: editando ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(corpo),
        }
      )
      const dados = await res.json().catch(() => ({}))

      if (!res.ok) {
        toast.error(dados.error || "Não foi possível salvar.")
        return
      }

      toast.success(editando ? "Acesso atualizado." : "Acesso criado.")
      setDialogoAberto(false)
      await carregar()
    } finally {
      setSalvando(false)
    }
  }

  async function alternarAtivo(m: Membro) {
    const res = m.isActive
      ? await fetch(`/api/usuarios/${m.id}`, { method: "DELETE" })
      : await fetch(`/api/usuarios/${m.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: true }),
        })

    const dados = await res.json().catch(() => ({}))
    setParaDesativar(null)
    if (!res.ok) {
      toast.error(dados.error || "Não foi possível alterar o acesso.")
      return
    }
    toast.success(m.isActive ? "Acesso desativado." : "Acesso reativado.")
    await carregar()
  }

  const migalhas = (
    <Breadcrumb
      items={[{ label: "Configurações", href: "/settings" }, { label: "Equipe" }]}
      className="mb-4"
    />
  )

  if (semPermissao) {
    return (
      <div className="space-y-6">
        {migalhas}
        <Card>
          <CardHeader>
            <CardTitle>Equipe</CardTitle>
            <CardDescription>
              Apenas administradores gerenciam os acessos ao sistema.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          {migalhas}
          <h1 className="text-2xl font-bold">Equipe</h1>
          <p className="mt-1 text-muted-foreground">
            Quem acessa o sistema, com qual papel e em qual loja.
          </p>
        </div>
        <Button onClick={abrirNovo}>
          <UserPlus className="mr-2 h-4 w-4" />
          Novo acesso
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {carregando ? (
            <p className="p-6 text-sm text-muted-foreground">Carregando...</p>
          ) : membros.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-10 text-center">
              <Users className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Nenhum acesso cadastrado.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Papel</TableHead>
                  <TableHead>Loja</TableHead>
                  <TableHead>Último acesso</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {membros.map((m) => (
                  <TableRow key={m.id} className={m.isActive ? "" : "opacity-50"}>
                    <TableCell className="font-medium">
                      {m.name}
                      {!m.isActive && (
                        <Badge variant="outline" className="ml-2 text-[10px]">
                          desativado
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{m.email}</TableCell>
                    <TableCell>
                      <Badge
                        className={CORES_DO_PAPEL[m.role] ?? "bg-muted text-foreground"}
                        title={DESCRICAO_DO_PAPEL[m.role as Papel]}
                      >
                        {ROTULO_DO_PAPEL[m.role as Papel] ?? m.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {m.storeId
                        ? (lojas.find((l) => l.id === m.storeId)?.nome ?? "—")
                        : "as duas"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatarAcesso(m.lastLoginAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => abrirEdicao(m)}>
                        <Pencil className="h-4 w-4" />
                        <span className="sr-only">Editar {m.name}</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          m.isActive ? setParaDesativar(m) : void alternarAtivo(m)
                        }
                      >
                        {m.isActive ? (
                          <UserX className="h-4 w-4 text-destructive" />
                        ) : (
                          <UserCheck className="h-4 w-4" />
                        )}
                        <span className="sr-only">
                          {m.isActive ? "Desativar" : "Reativar"} {m.name}
                        </span>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogoAberto} onOpenChange={setDialogoAberto}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>{editando ? "Editar acesso" : "Novo acesso"}</DialogTitle>
            <DialogDescription>
              {editando
                ? "Altere o papel, a loja ou defina uma senha nova."
                : "Não há convite por e-mail: defina a senha e entregue à pessoa."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome</Label>
              <Input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                value={email}
                disabled={!!editando}
                onChange={(e) => setEmail(e.target.value)}
              />
              {editando && (
                <p className="text-xs text-muted-foreground">
                  O e-mail é o login e não muda por aqui.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="senha">
                {editando ? "Nova senha (vazio mantém a atual)" : "Senha inicial"}
              </Label>
              <Input
                id="senha"
                type="text"
                value={senha}
                placeholder="mínimo 8 caracteres"
                onChange={(e) => setSenha(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="papel">Papel</Label>
              <select
                id="papel"
                value={papel}
                onChange={(e) => setPapel(e.target.value as Papel)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {PAPEIS.map((p) => (
                  <option key={p} value={p}>
                    {ROTULO_DO_PAPEL[p]}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">{DESCRICAO_DO_PAPEL[papel]}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="loja">Loja</Label>
              <select
                id="loja"
                value={lojaId}
                disabled={!exigeLoja}
                onChange={(e) => setLojaId(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50"
              >
                <option value="">
                  {exigeLoja ? "Escolha a loja" : "Alcança as duas lojas"}
                </option>
                {lojas.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogoAberto(false)}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={salvando}>
              {salvando ? "Salvando..." : editando ? "Salvar" : "Criar acesso"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Tirar o acesso de alguem no meio do expediente derruba o atendimento
          dela na hora: acao critica leva a confirmacao com bloqueio de 3s,
          como manda a regra da base. */}
      <ModalConfirmacaoBlock
        aberto={paraDesativar !== null}
        titulo="Desativar acesso"
        mensagem={
          paraDesativar
            ? `${paraDesativar.name} perde o login imediatamente. O histórico de mensagens e pedidos continua no sistema.`
            : ""
        }
        rotuloConfirmar="Desativar"
        onConfirmar={() => paraDesativar && void alternarAtivo(paraDesativar)}
        onCancelar={() => setParaDesativar(null)}
      />
    </div>
  )
}
