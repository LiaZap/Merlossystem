import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { usuarioDaSessao, semSessao } from "@/lib/sessao"
import { escopoDaLoja, lojaAtiva, lojaParaGravar, faltaLoja } from "@/lib/loja"
import { z } from "zod"

const lookbookSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  coverMediaId: z.string().optional().nullable(),
  productIds: z.array(z.string()).default([]),
  mediaIds: z.array(z.string()).default([]),
  active: z.boolean().default(true),
})

export async function GET(req: Request) {
  const usuario = await usuarioDaSessao()
  if (!usuario) return semSessao()

  const lookbooks = await prisma.lookbook.findMany({
    where: escopoDaLoja(usuario, lojaAtiva(req)),
    orderBy: { createdAt: "desc" },
  })
  return NextResponse.json(lookbooks)
}

export async function POST(req: Request) {
  try {
    const usuario = await usuarioDaSessao()
    if (!usuario) return semSessao()

    const storeId = lojaParaGravar(usuario, lojaAtiva(req))
    if (!storeId) return faltaLoja()

    const body = await req.json()
    const data = lookbookSchema.parse(body)

    const lookbook = await prisma.lookbook.create({ data: { ...data, storeId } })
    return NextResponse.json(lookbook, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    return NextResponse.json({ error: "Erro ao criar lookbook" }, { status: 500 })
  }
}
