import { NextResponse } from "next/server"
import { hash } from "bcryptjs"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/db/prisma"
import { authOptions } from "@/lib/auth"
import { z } from "zod"

const registerSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
  role: z.enum(["admin", "agent", "viewer"]).optional(),
})

/**
 * POST: cria usuario.
 *
 * Fica fora da protecao de sessao do middleware porque precisa funcionar uma
 * vez com o banco vazio (bootstrap do primeiro admin). Depois disso exige
 * sessao de admin — antes, qualquer visitante criava conta `admin` e entrava
 * no sistema inteiro.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { name, email, password, role } = registerSchema.parse(body)

    const ehBootstrap = (await prisma.user.count()) === 0

    if (!ehBootstrap) {
      const session = await getServerSession(authOptions)
      if (!session?.user) {
        return NextResponse.json({ error: "Nao autenticado" }, { status: 401 })
      }
      if (session.user.role !== "admin") {
        return NextResponse.json(
          { error: "Apenas administradores podem criar usuarios" },
          { status: 403 }
        )
      }
    }

    // O primeiro usuario nasce admin (nao ha quem o promova). Os demais nascem
    // `agent`, salvo escolha explicita de um admin.
    const roleFinal = ehBootstrap ? "admin" : role ?? "agent"

    const existingUser = await prisma.user.findUnique({
      where: { email },
    })

    if (existingUser) {
      return NextResponse.json(
        { error: "Email já cadastrado" },
        { status: 409 }
      )
    }

    const passwordHash = await hash(password, 12)

    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        role: roleFinal,
      },
    })

    return NextResponse.json(
      { id: user.id, name: user.name, email: user.email, role: user.role },
      { status: 201 }
    )
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0].message },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { error: "Erro ao criar conta" },
      { status: 500 }
    )
  }
}
