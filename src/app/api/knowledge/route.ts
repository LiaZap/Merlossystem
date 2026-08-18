import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { usuarioDaSessao, semSessao } from "@/lib/sessao"
import { escopoDaLoja, lojaAtiva, lojaParaGravar, faltaLoja } from "@/lib/loja"
import { z } from "zod"

const articleSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  category: z.string().optional().nullable(),
  tags: z.array(z.string()).default([]),
  isPublic: z.boolean().default(false),
  // `createdBy` NAO entra aqui: o autor vem da sessao.
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
      { content: { contains: search, mode: "insensitive" } },
      { tags: { has: search } },
    ]
  }
  if (category && category !== "all") where.category = category

  const articles = await prisma.knowledgeArticle.findMany({
    where,
    include: { author: { select: { id: true, name: true } } },
    orderBy: { updatedAt: "desc" },
  })

  return NextResponse.json(articles)
}

export async function POST(req: Request) {
  try {
    const usuario = await usuarioDaSessao()
    if (!usuario) return semSessao()

    const body = await req.json()
    const data = articleSchema.parse(body)

    const storeId = lojaParaGravar(usuario, lojaAtiva(req))
    if (!storeId) return faltaLoja()

    const article = await prisma.knowledgeArticle.create({
      data: { ...data, storeId, createdBy: usuario.id },
    })
    return NextResponse.json(article, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    return NextResponse.json({ error: "Erro ao criar artigo" }, { status: 500 })
  }
}
