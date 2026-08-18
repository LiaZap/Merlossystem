import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db/prisma"
import { usuarioDaSessao, semSessao } from "@/lib/sessao"
import { escopoDaLoja, lojaAtiva, lojaParaGravar, faltaLoja } from "@/lib/loja"
import { z } from "zod"

const templateSchema = z.object({
  name: z.string().min(1),
  category: z.string(), // marketing | utility | authentication
  language: z.string().default("pt_BR"),
  headerType: z.string().optional().nullable(),
  headerContent: z.string().optional().nullable(),
  body: z.string().min(1),
  footer: z.string().optional().nullable(),
  buttons: z.array(z.record(z.string(), z.unknown())).optional().nullable(),
})

export async function GET(req: Request) {
  const usuario = await usuarioDaSessao()
  if (!usuario) return semSessao()

  const { searchParams } = new URL(req.url)
  const status = searchParams.get("status") || ""
  const category = searchParams.get("category") || ""

  const where: Record<string, unknown> = { ...escopoDaLoja(usuario, lojaAtiva(req)) }
  if (status && status !== "all") where.status = status
  if (category && category !== "all") where.category = category

  const templates = await prisma.whatsappTemplate.findMany({
    where,
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json(templates)
}

export async function POST(req: Request) {
  try {
    const usuario = await usuarioDaSessao()
    if (!usuario) return semSessao()

    const storeId = lojaParaGravar(usuario, lojaAtiva(req))
    if (!storeId) return faltaLoja()

    const body = await req.json()
    const data = templateSchema.parse(body)

    const template = await prisma.whatsappTemplate.create({
      data: {
        storeId,
        ...data,
        buttons: data.buttons ? (data.buttons as Prisma.InputJsonValue) : undefined,
      },
    })

    return NextResponse.json(template, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    return NextResponse.json({ error: "Erro ao criar template" }, { status: 500 })
  }
}
