"use client"

import { useState } from "react"
import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ArrowRight, Loader2 } from "lucide-react"
import Image from "next/image"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    })

    setLoading(false)

    if (result?.error) {
      setError("Email ou senha inválidos")
      return
    }

    router.push("/inbox")
    router.refresh()
  }

  return (
    <div>
      {/* Mobile logo */}
      <div className="lg:hidden mb-8 flex justify-center">
        <Image src="/logo-dark.png" alt="Merlos Store" width={140} height={56} className="object-contain" priority />
      </div>

      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-neutral-900 tracking-tight">
          Bem-vindo de volta
        </h1>
        <p className="text-sm text-neutral-500 mt-1.5">
          Acesse sua conta para continuar
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
          <Label htmlFor="email" className="text-[13px] font-medium text-neutral-700">
            Email
          </Label>
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
          <div className="flex items-center justify-between">
            <Label htmlFor="password" className="text-[13px] font-medium text-neutral-700">
              Senha
            </Label>
            <button type="button" className="text-xs text-neutral-500 hover:text-neutral-700 transition-colors">
              Esqueci a senha
            </button>
          </div>
          <Input
            id="password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
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
              Entrar
              <ArrowRight className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>
      </form>

      <p className="text-center text-sm text-neutral-500 mt-8">
        Não tem conta?{" "}
        <Link href="/register" className="text-neutral-900 font-medium hover:underline underline-offset-4">
          Criar conta
        </Link>
      </p>
    </div>
  )
}
