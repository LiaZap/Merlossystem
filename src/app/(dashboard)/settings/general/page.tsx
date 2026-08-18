"use client"

import { useState } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { Save, Clock, Store, ImageIcon, Globe } from "lucide-react"
import { Breadcrumb } from "@/components/ui/breadcrumb"

interface DaySchedule {
  open: string
  close: string
  isOpen: boolean
}

interface FormState {
  storeName: string
  description: string
  phone: string
  timezone: string
  schedule: Record<string, DaySchedule>
}

const DAYS = [
  { key: "seg", label: "Segunda-feira", short: "Seg" },
  { key: "ter", label: "Terça-feira", short: "Ter" },
  { key: "qua", label: "Quarta-feira", short: "Qua" },
  { key: "qui", label: "Quinta-feira", short: "Qui" },
  { key: "sex", label: "Sexta-feira", short: "Sex" },
  { key: "sab", label: "Sábado", short: "Sáb" },
  { key: "dom", label: "Domingo", short: "Dom" },
]

const TIMEZONES = [
  { value: "America/Sao_Paulo", label: "Brasília (GMT-3)" },
  { value: "America/Manaus", label: "Manaus (GMT-4)" },
  { value: "America/Belem", label: "Belém (GMT-3)" },
  { value: "America/Fortaleza", label: "Fortaleza (GMT-3)" },
  { value: "America/Recife", label: "Recife (GMT-3)" },
  { value: "America/Cuiaba", label: "Cuiabá (GMT-4)" },
  { value: "America/Porto_Velho", label: "Porto Velho (GMT-4)" },
  { value: "America/Rio_Branco", label: "Rio Branco (GMT-5)" },
  { value: "America/Noronha", label: "Fernando de Noronha (GMT-2)" },
]

const defaultSchedule: Record<string, DaySchedule> = {
  seg: { open: "09:00", close: "18:00", isOpen: true },
  ter: { open: "09:00", close: "18:00", isOpen: true },
  qua: { open: "09:00", close: "18:00", isOpen: true },
  qui: { open: "09:00", close: "18:00", isOpen: true },
  sex: { open: "09:00", close: "18:00", isOpen: true },
  sab: { open: "09:00", close: "13:00", isOpen: true },
  dom: { open: "09:00", close: "18:00", isOpen: false },
}

export default function SettingsGeneralPage() {
  const [form, setForm] = useState<FormState>({
    storeName: "Merlos Store",
    description: "",
    phone: "",
    timezone: "America/Sao_Paulo",
    schedule: { ...defaultSchedule },
  })

  function updateField(field: keyof Omit<FormState, "schedule">, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function updateSchedule(day: string, field: keyof DaySchedule, value: string | boolean) {
    setForm((prev) => ({
      ...prev,
      schedule: {
        ...prev.schedule,
        [day]: { ...prev.schedule[day], [field]: value },
      },
    }))
  }

  function handleSave() {
    toast.success("Configurações salvas")
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <Breadcrumb items={[{ label: "Configurações", href: "/settings/general" }, { label: "Geral" }]} className="mb-4" />
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
          Configurações Gerais
        </h1>
        <p className="text-muted-foreground mt-1">
          Gerencie as informações básicas, logo e horário de funcionamento da sua loja.
        </p>
      </div>

      {/* Store Info Card */}
      <Card className="rounded-xl shadow-premium">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Store className="size-5 text-neutral-500" />
            <CardTitle>Informações da Loja</CardTitle>
          </div>
          <CardDescription>
            Dados básicos que aparecem para seus clientes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="storeName">Nome da Loja</Label>
            <Input
              id="storeName"
              value={form.storeName}
              onChange={(e) => updateField("storeName", e.target.value)}
              placeholder="Nome da sua loja"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Descrição</Label>
            <Textarea
              id="description"
              value={form.description}
              onChange={(e) => updateField("description", e.target.value)}
              placeholder="Descreva sua loja em poucas palavras..."
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Telefone</Label>
            <Input
              id="phone"
              value={form.phone}
              onChange={(e) => updateField("phone", e.target.value)}
              placeholder="(11) 99999-9999"
            />
          </div>
        </CardContent>
      </Card>

      {/* Logo Card */}
      <Card className="rounded-xl shadow-premium">
        <CardHeader>
          <div className="flex items-center gap-2">
            <ImageIcon className="size-5 text-neutral-500" />
            <CardTitle>Logo</CardTitle>
          </div>
          <CardDescription>
            A logo da sua loja exibida no chat e nas comunicações.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-6">
            <div className="relative size-20 overflow-hidden rounded-xl border border-neutral-200/60 bg-neutral-50 shadow-sm">
              <Image
                src="/logo-dark.png"
                alt="Logo da loja"
                fill
                className="object-contain p-2"
              />
            </div>
            <div className="space-y-2">
              <Button variant="outline" size="sm">
                Alterar Logo
              </Button>
              <p className="text-xs text-muted-foreground">
                PNG, JPG ou SVG. Tamanho máximo 2MB.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Business Hours Card */}
      <Card className="rounded-xl shadow-premium">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Clock className="size-5 text-neutral-500" />
            <CardTitle>Horário de Funcionamento</CardTitle>
          </div>
          <CardDescription>
            Defina os horários em que sua loja está disponível para atendimento.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {/* Header row */}
            <div className="grid grid-cols-[1fr_100px_100px_80px] gap-3 text-xs font-medium text-muted-foreground px-1">
              <span>Dia</span>
              <span>Abertura</span>
              <span>Fechamento</span>
              <span className="text-center">Aberto</span>
            </div>

            {DAYS.map((day) => {
              const schedule = form.schedule[day.key]
              return (
                <div
                  key={day.key}
                  className={`grid grid-cols-[1fr_100px_100px_80px] items-center gap-3 rounded-lg px-3 py-2.5 transition-colors ${
                    schedule.isOpen
                      ? "bg-neutral-50"
                      : "bg-neutral-50/50 opacity-60"
                  }`}
                >
                  <span className="text-sm font-medium text-neutral-700">
                    {day.label}
                  </span>
                  <Input
                    type="time"
                    value={schedule.open}
                    onChange={(e) =>
                      updateSchedule(day.key, "open", e.target.value)
                    }
                    disabled={!schedule.isOpen}
                    className="h-8 text-sm"
                  />
                  <Input
                    type="time"
                    value={schedule.close}
                    onChange={(e) =>
                      updateSchedule(day.key, "close", e.target.value)
                    }
                    disabled={!schedule.isOpen}
                    className="h-8 text-sm"
                  />
                  <div className="flex justify-center">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={schedule.isOpen}
                      onClick={() =>
                        updateSchedule(day.key, "isOpen", !schedule.isOpen)
                      }
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                        schedule.isOpen ? "bg-neutral-900" : "bg-neutral-300"
                      }`}
                    >
                      <span
                        className={`pointer-events-none block size-4 rounded-full bg-white shadow-sm ring-0 transition-transform ${
                          schedule.isOpen ? "translate-x-4" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Timezone Card */}
      <Card className="rounded-xl shadow-premium">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Globe className="size-5 text-neutral-500" />
            <CardTitle>Fuso Horário</CardTitle>
          </div>
          <CardDescription>
            Fuso horário usado para os horários de funcionamento e relatórios.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-w-sm space-y-2">
            <Label htmlFor="timezone">Fuso Horário</Label>
            <Select
              value={form.timezone}
              onValueChange={(val) => val && updateField("timezone", val)}
            >
              <SelectTrigger id="timezone" className="w-full">
                <SelectValue placeholder="Selecione o fuso horário" />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz.value} value={tz.value}>
                    {tz.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end pb-6">
        <Button
          onClick={handleSave}
          className="bg-neutral-900 text-white hover:bg-neutral-800"
          size="lg"
        >
          <Save className="size-4 mr-1.5" />
          Salvar Configurações
        </Button>
      </div>
    </div>
  )
}
