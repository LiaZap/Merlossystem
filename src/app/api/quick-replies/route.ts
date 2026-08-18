import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { usuarioDaSessao, semSessao } from "@/lib/sessao"
import { escopoDaLoja, lojaAtiva, lojaParaGravar, faltaLoja } from "@/lib/loja"
import { z } from "zod"

const quickReplySchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  category: z.string().optional().nullable(),
  shortcut: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
})

export async function GET(req: Request) {
  const usuario = await usuarioDaSessao()
  if (!usuario) return semSessao()

  const { searchParams } = new URL(req.url)
  const search = searchParams.get("search") || ""
  const category = searchParams.get("category") || ""

  const where: Record<string, unknown> = { ...escopoDaLoja(usuario, lojaAtiva(req)) }
  if (search) {
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { shortcut: { contains: search, mode: "insensitive" } },
      { content: { contains: search, mode: "insensitive" } },
    ]
  }
  if (category) where.category = category

  const replies = await prisma.quickReply.findMany({
    where,
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json(replies)
}

export async function POST(req: Request) {
  try {
    const usuario = await usuarioDaSessao()
    if (!usuario) return semSessao()

    const storeId = lojaParaGravar(usuario, lojaAtiva(req))
    if (!storeId) return faltaLoja()

    const body = await req.json()
    const data = quickReplySchema.parse(body)

    const reply = await prisma.quickReply.create({ data: { ...data, storeId } })

    return NextResponse.json(reply, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    return NextResponse.json({ error: "Erro ao criar resposta rápida" }, { status: 500 })
  }
}
