"use client"

import { motion } from "framer-motion"
import Image from "next/image"

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen flex">
      {/* Left side - branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-[#141414] relative overflow-hidden items-center justify-center">
        {/* Subtle gradient circles */}
        <div className="absolute top-1/4 -left-20 w-96 h-96 rounded-full bg-neutral-800/30 blur-3xl" />
        <div className="absolute bottom-1/4 right-0 w-80 h-80 rounded-full bg-neutral-700/20 blur-3xl" />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="relative z-10 px-16 max-w-lg"
        >
          {/* Logo */}
          <Image
            src="/logo-light.png"
            alt="Merlos Store"
            width={180}
            height={72}
            className="object-contain mb-10"
            priority
          />

          <h2 className="text-2xl font-light text-white/90 leading-relaxed mb-4">
            Plataforma Unificada de Atendimento
          </h2>
          <p className="text-neutral-500 text-sm leading-relaxed">
            Conversas, clientes e pedidos das duas lojas num lugar só.
          </p>

          {/* Decorative dots */}
          <div className="flex gap-1.5 mt-10">
            <div className="w-8 h-1 rounded-full bg-white/40" />
            <div className="w-1 h-1 rounded-full bg-white/20" />
            <div className="w-1 h-1 rounded-full bg-white/20" />
          </div>
        </motion.div>
      </div>

      {/* Right side - form */}
      <div className="flex-1 flex items-center justify-center bg-[#fafaf8] px-6">
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-[400px]"
        >
          {children}
        </motion.div>
      </div>
    </div>
  )
}
