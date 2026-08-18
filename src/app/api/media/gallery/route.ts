import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { usuarioDaSessao, semSessao } from "@/lib/sessao"
import { escopoDaLoja, lojaAtiva } from "@/lib/loja"
import { limiteDaPagina, paginaAtual } from "@/lib/paginacao"

/**
 * GET: List media files with filters
 * Query params: folder, fileType, tags, productId, search, page, limit
 */
export async function GET(req: Request) {
  const usuario = await usuarioDaSessao()
  if (!usuario) return semSessao()

  const { searchParams } = new URL(req.url)
  const folder = searchParams.get("folder") || ""
  const fileType = searchParams.get("fileType") || ""
  const tag = searchParams.get("tag") || ""
  const productId = searchParams.get("productId") || ""
  const search = searchParams.get("search") || ""
  const page = paginaAtual(searchParams.get("page"))
  const limit = limiteDaPagina(searchParams.get("limit"), 30)

  const where: Record<string, unknown> = { ...escopoDaLoja(usuario, lojaAtiva(req)) }

  if (folder && folder !== "all") where.folder = folder
  if (fileType && fileType !== "all") where.fileType = fileType
  if (tag) where.tags = { has: tag }
  if (productId) where.productId = productId
  if (search) {
    where.OR = [
      { originalName: { contains: search, mode: "insensitive" } },
      { tags: { has: search } },
    ]
  }

  const [files, total] = await Promise.all([
    prisma.mediaFile.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        product: { select: { id: true, name: true } },
      },
    }),
    prisma.mediaFile.count({ where }),
  ])

  return NextResponse.json({ files, total, page, limit })
}
