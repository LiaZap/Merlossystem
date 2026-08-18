import { NextResponse } from "next/server"
import { z } from "zod"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db/prisma"
import { usuarioDaSessao, semSessao } from "@/lib/sessao"
import { ehGestao, gerarSlug } from "@/lib/loja"

const lojaSchema = z.object({
  nome: z.string().trim().min(1, "Informe o nome da loja"),
  /** Opcional: sai do nome quando nao vem. */
  slug: z.string().trim().optional(),
  /** Id do deposito no Bling. Sem ele a leitura de saldo responde 409. */
  blingDepositoId: z.string().trim().optional().nullable(),
})

/**
 * GET: lojas que o usuario alcanca.
 *
 * Gestao (admin, gerente) recebe as duas — e o que alimenta o seletor.
 * Vendedor e viewer recebem so a propria, para a interface poder mostrar em
 * qual loja ele esta sem dar a entender que existe escolha.
 *
 * Criar/editar/excluir loja e configuracao e fica so com admin (src/lib/rbac.ts).
 */
export async function GET() {
  const usuario = await usuarioDaSessao()
  if (!usuario) return semSessao()

  const gestao = ehGestao(usuario.role)
  const lojas = await prisma.store.findMany({
    where: {
      ativo: true,
      isDeleted: false,
      ...(gestao ? {} : { id: usuario.storeId ?? "__sem_loja__" }),
    },
    // `blingDepositoId` so para gestao: e configuracao, e a tela de lojas
    // precisa dele para mostrar quais lojas ainda estao sem de-para.
    select: { id: true, nome: true, slug: true, ...(gestao && { blingDepositoId: true }) },
    orderBy: { nome: "asc" },
  })

  return NextResponse.json({ lojas, podeTrocar: gestao })
}

/**
 * Cadastra uma loja. So admin (excecao `/api/lojas` em src/lib/rbac.ts).
 *
 * Sem esta rota o sistema multi-loja nao tinha como nascer: as lojas so
 * existiam se alguem as criasse direto no banco.
 */
export async function POST(req: Request) {
  try {
    const usuario = await usuarioDaSessao()
    if (!usuario) return semSessao()

    const data = lojaSchema.parse(await req.json())
    const slug = gerarSlug(data.slug || data.nome)
    if (!slug) {
      return NextResponse.json(
        { error: "Nao consegui gerar um identificador a partir desse nome" },
        { status: 400 }
      )
    }

    const loja = await prisma.store.create({
      data: {
        nome: data.nome,
        slug,
        blingDepositoId: data.blingDepositoId || null,
        modifiedBy: usuario.id,
      },
      select: { id: true, nome: true, slug: true, blingDepositoId: true, ativo: true },
    })

    return NextResponse.json(loja, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    // O slug entra na URL de webhook: duas lojas com o mesmo valor fariam a
    // mensagem cair na loja errada.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        { error: "Ja existe uma loja com esse identificador. Use outro nome." },
        { status: 409 }
      )
    }
    console.error("[Lojas] Erro ao criar:", error)
    return NextResponse.json({ error: "Erro ao criar a loja" }, { status: 500 })
  }
}
