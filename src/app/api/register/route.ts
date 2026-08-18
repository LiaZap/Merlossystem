import { NextResponse } from "next/server"
import { hash } from "bcryptjs"
import { prisma } from "@/lib/db/prisma"
import { z } from "zod"

const registerSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  email: z.string().email("Email inválido"),
  password: z.string().min(8, "Senha deve ter pelo menos 8 caracteres"),
})

/**
 * POST: cria o PRIMEIRO admin. So isso.
 *
 * Fica fora da protecao de sessao do middleware porque precisa funcionar uma
 * vez com o banco vazio. Depois do primeiro usuario, esta rota recusa: quem
 * cadastra equipe e `POST /api/usuarios`, na tela de Equipe.
 *
 * Antes esta rota TAMBEM cadastrava a equipe, e com o papel `"agent"` — que
 * nao existe no RBAC (`src/lib/rbac.ts`) nem satisfaz a constraint
 * `users_loja_por_papel`, cujos ramos exigem `admin|gerente` sem loja ou
 * `vendedor|viewer` com loja. Resultado: toda criacao depois do bootstrap
 * batia no banco e falhava, e quando passasse criaria alguem sem acesso a
 * nada. Um caminho so, em `/api/usuarios`, com os papeis de verdade.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { name, email, password } = registerSchema.parse(body)

    const ehBootstrap = (await prisma.user.count()) === 0

    if (!ehBootstrap) {
      return NextResponse.json(
        {
          error:
            "O sistema já tem administrador. Novos acessos são criados em Configurações > Equipe.",
        },
        { status: 403 }
      )
    }

    // O primeiro usuario nasce admin: nao ha quem o promova. Papel de gestao
    // tem `storeId` nulo — ele alcanca as duas lojas.
    const roleFinal = "admin"

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
