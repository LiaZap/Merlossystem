"use client"

import { useState } from "react"
import { Pencil, Trash2, Plus } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Breadcrumb } from "@/components/ui/breadcrumb"

interface TeamMember {
  id: string
  name: string
  email: string
  role: "admin" | "agent"
  status: "active" | "inactive"
}

const initialMembers: TeamMember[] = [
  {
    id: "1",
    name: "Camila Santos",
    email: "admin@merlosstore.com",
    role: "admin",
    status: "active",
  },
  {
    id: "2",
    name: "Jéssica Oliveira",
    email: "jessica@merlosstore.com",
    role: "agent",
    status: "active",
  },
  {
    id: "3",
    name: "Bruna Lima",
    email: "bruna@merlosstore.com",
    role: "agent",
    status: "active",
  },
]

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

export default function SettingsTeamPage() {
  const [members, setMembers] = useState<TeamMember[]>(initialMembers)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null)

  const [formName, setFormName] = useState("")
  const [formEmail, setFormEmail] = useState("")
  const [formRole, setFormRole] = useState<"admin" | "agent">("agent")

  function resetForm() {
    setFormName("")
    setFormEmail("")
    setFormRole("agent")
    setEditingMember(null)
  }

  function openCreateDialog() {
    resetForm()
    setDialogOpen(true)
  }

  function openEditDialog(member: TeamMember) {
    setEditingMember(member)
    setFormName(member.name)
    setFormEmail(member.email)
    setFormRole(member.role)
    setDialogOpen(true)
  }

  function handleSubmit() {
    if (!formName.trim() || !formEmail.trim()) {
      toast.error("Preencha todos os campos")
      return
    }

    if (editingMember) {
      setMembers((prev) =>
        prev.map((m) =>
          m.id === editingMember.id
            ? { ...m, name: formName, email: formEmail, role: formRole }
            : m
        )
      )
      toast.success("Membro atualizado com sucesso")
    } else {
      const newMember: TeamMember = {
        id: crypto.randomUUID(),
        name: formName,
        email: formEmail,
        role: formRole,
        status: "active",
      }
      setMembers((prev) => [...prev, newMember])
      toast.success("Convite enviado com sucesso")
    }

    setDialogOpen(false)
    resetForm()
  }

  function handleRemove(id: string) {
    setMembers((prev) => prev.filter((m) => m.id !== id))
    toast.success("Membro removido")
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Breadcrumb items={[{ label: "Configurações", href: "/settings" }, { label: "Equipe" }]} className="mb-4" />
          <h1 className="text-2xl font-bold">Equipe</h1>
          <p className="text-muted-foreground mt-1">
            Gerencie os membros da sua equipe
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <Button onClick={openCreateDialog}>
                <Plus className="size-4" data-icon="inline-start" />
                Convidar Membro
              </Button>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingMember ? "Editar Membro" : "Convidar Membro"}
              </DialogTitle>
              <DialogDescription>
                {editingMember
                  ? "Atualize as informações do membro da equipe."
                  : "Preencha os dados para enviar um convite."}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="member-name">Nome</Label>
                <Input
                  id="member-name"
                  placeholder="Nome completo"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="member-email">Email</Label>
                <Input
                  id="member-email"
                  type="email"
                  placeholder="email@exemplo.com"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Cargo</Label>
                <Select value={formRole} onValueChange={(val) => val && setFormRole(val as "admin" | "agent")}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecione o cargo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="agent">Agente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter>
              <Button onClick={handleSubmit}>
                {editingMember ? "Salvar" : "Enviar Convite"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-xl ring-1 ring-foreground/10 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Membro</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Cargo</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => (
              <TableRow key={member.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarFallback className="bg-neutral-900 text-white text-xs">
                        {getInitials(member.name)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="font-medium">{member.name}</span>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {member.email}
                </TableCell>
                <TableCell>
                  <Badge variant={member.role === "admin" ? "default" : "secondary"}>
                    {member.role === "admin" ? "Admin" : "Agente"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge
                    className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                  >
                    Ativa
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Editar membro"
                      onClick={() => openEditDialog(member)}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Remover membro"
                      onClick={() => handleRemove(member.id)}
                    >
                      <Trash2 className="size-3.5 text-red-500" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
