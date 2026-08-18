import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import {
  uploadToCloudinary,
  getFileTypeFromMime,
  getCloudinaryResourceType,
} from "@/lib/media/upload"
import { usuarioDaSessao, semSessao } from "@/lib/sessao"
import { lojaAtiva, lojaParaGravar, faltaLoja } from "@/lib/loja"

/**
 * POST: Upload media file to Cloudinary and save to database
 * Accepts multipart/form-data with a 'file' field
 */
export async function POST(req: Request) {
  try {
    const usuario = await usuarioDaSessao()
    if (!usuario) return semSessao()

    const storeId = lojaParaGravar(usuario, lojaAtiva(req))
    if (!storeId) return faltaLoja()

    const formData = await req.formData()
    const file = formData.get("file") as File | null
    const folder = (formData.get("folder") as string) || "general"
    const productId = formData.get("productId") as string | null
    const tags = (formData.get("tags") as string) || ""
    // `uploadedBy` do formData e ignorado: quem subiu vem da sessao.

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const mimeType = file.type
    const fileType = getFileTypeFromMime(mimeType)
    const resourceType = getCloudinaryResourceType(fileType)

    // Upload to Cloudinary
    const result = await uploadToCloudinary(buffer, {
      folder: `merlos-store/${folder}`,
      resourceType,
      filename: file.name,
    })

    // Save to database
    const mediaFile = await prisma.mediaFile.create({
      data: {
        storeId,
        originalName: file.name,
        fileKey: result.publicId,
        fileUrl: result.url,
        thumbnailUrl: result.thumbnailUrl || null,
        fileType,
        mimeType,
        fileSize: result.bytes,
        width: result.width || null,
        height: result.height || null,
        duration: result.duration ? Math.round(result.duration) : null,
        productId: productId || null,
        folder,
        tags: tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
        uploadedBy: usuario.id,
      },
    })

    return NextResponse.json(mediaFile, { status: 201 })
  } catch (error) {
    console.error("[Media Upload] Error:", error)
    return NextResponse.json(
      { error: "Erro ao fazer upload" },
      { status: 500 }
    )
  }
}
