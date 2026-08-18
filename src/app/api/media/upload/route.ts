import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import {
  subirArquivo,
  getFileTypeFromMime,
  urlInterna,
  urlInternaThumb,
} from "@/lib/media/upload"
import { usuarioDaSessao, semSessao } from "@/lib/sessao"
import { lojaAtiva, lojaParaGravar, faltaLoja } from "@/lib/loja"
import { recusaPeloCabecalho, recusaDoArquivo } from "@/lib/media/limites"

/**
 * POST: sobe o arquivo para o MinIO e grava a linha (ADR 0006).
 * Accepts multipart/form-data with a 'file' field
 */
export async function POST(req: Request) {
  try {
    const usuario = await usuarioDaSessao()
    if (!usuario) return semSessao()

    const storeId = lojaParaGravar(usuario, lojaAtiva(req))
    if (!storeId) return faltaLoja()

    // ANTES do `formData()`, que le o corpo inteiro na memoria. O cabecalho e
    // do cliente e pode mentir — por isso o tamanho real e conferido logo
    // abaixo —, mas no caso honesto (video de 1 GB do celular) isto evita
    // carregar tudo so para depois recusar.
    const cedo = recusaPeloCabecalho(req.headers)
    if (cedo) return NextResponse.json({ error: cedo.erro }, { status: cedo.status })

    const formData = await req.formData()
    const file = formData.get("file") as File | null
    const folder = (formData.get("folder") as string) || "general"
    const productId = formData.get("productId") as string | null
    const tags = (formData.get("tags") as string) || ""
    // `uploadedBy` do formData e ignorado: quem subiu vem da sessao.

    if (!file) {
      return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 })
    }

    // Tamanho real e tipo. A lista de tipos e fechada: `image/svg+xml` executa
    // script quando aberto no navegador, e a galeria mostra imagem inline.
    const recusa = recusaDoArquivo(file)
    if (recusa) return NextResponse.json({ error: recusa.erro }, { status: recusa.status })

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const mimeType = file.type
    const fileType = getFileTypeFromMime(mimeType)

    const result = await subirArquivo(buffer, {
      storeId,
      pasta: folder,
      nomeOriginal: file.name,
      mimeType,
    })

    // O id sai daqui, e nao do banco, porque `fileUrl` aponta para a rota
    // `/api/media/{id}/raw` — sem saber o id antes, seria preciso gravar e
    // depois atualizar a mesma linha so para preencher a URL.
    const id = crypto.randomUUID()

    const mediaFile = await prisma.mediaFile.create({
      data: {
        id,
        storeId,
        originalName: file.name,
        fileKey: result.chave,
        fileUrl: urlInterna(id),
        thumbnailKey: result.chaveThumb || null,
        thumbnailUrl: result.chaveThumb ? urlInternaThumb(id) : null,
        fileType,
        mimeType,
        fileSize: result.bytes,
        width: result.width || null,
        height: result.height || null,
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
