"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ArrowRight, Loader2 } from "lucide-react"
import Image from "next/image"

export default function RegisterPage() {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || "Erro ao criar conta")
        setLoading(false)
        return
      }

      router.push("/login")
    } catch {
      setError("Erro ao criar conta")
      setLoading(false)
    }
  }

  return (
    <div>
      {/* Mobile logo */}
      <div className="lg:hidden mb-8 flex justify-center">
        <Image src="/logo-dark.png" alt="Merlos Store" width={140} height={56} className="object-contain" priority />
      </div>

      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-neutral-900 tracking-tight">
          Criar sua conta
        </h1>
        <p className="text-sm text-neutral-500 mt-1.5">
          Preencha os dados para começar
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-red-50 text-red-600 text-sm p-3.5 rounded-xl border border-red-100"
          >
            {error}
          </motion.div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="name" className="text-[13px] font-medium text-neutral-700">Nome</Label>
          <Input
            id="name"
            type="text"
            placeholder="Seu nome completo"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="h-11 rounded-xl bg-white border-neutral-200 focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400 text-sm transition-all placeholder:text-neutral-400"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-[13px] font-medium text-neutral-700">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="seu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="h-11 rounded-xl bg-white border-neutral-200 focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400 text-sm transition-all placeholder:text-neutral-400"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password" className="text-[13px] font-medium text-neutral-700">Senha</Label>
          <Input
            id="password"
            type="password"
            placeholder="Mínimo 6 caracteres"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className="h-11 rounded-xl bg-white border-neutral-200 focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400 text-sm transition-all placeholder:text-neutral-400"
          />
        </div>

        <Button
          type="submit"
          disabled={loading}
          className="w-full h-11 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white font-medium text-sm transition-all duration-200 shadow-sm hover:shadow-md"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              Criar Conta
              <ArrowRight className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>
      </form>

      <p className="text-center text-sm text-neutral-500 mt-8">
        Já tem conta?{" "}
        <Link href="/login" className="text-neutral-900 font-medium hover:underline underline-offset-4">
          Entrar
        </Link>
      </p>
    </div>
  )
}
