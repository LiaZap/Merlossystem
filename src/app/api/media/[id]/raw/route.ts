import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { usuarioDaSessao, semSessao } from "@/lib/sessao"
import { escopoDaLoja, lojaAtiva } from "@/lib/loja"
import { ler, ehArmazenamentoError } from "@/lib/media/armazenamento"

/**
 * Serve o binario da midia (ADR 0006).
 *
 * O bucket e privado e nao tem URL publica: e por aqui que a galeria, o chat e
 * o catalogo exibem imagem. A vantagem de passar por rota nossa e que o
 * **escopo de loja vale para o arquivo tambem** — sem isso, bastaria ter o link
 * de uma foto para ver a midia da outra loja, mesmo com a API toda escopada.
 *
 * `?thumb=1` devolve a miniatura, quando existe.
 *
 * Quem precisa buscar de FORA (a Meta, ao enviar midia para a cliente) nao
 * passa por aqui — recebe URL assinada de validade curta no momento do envio.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const usuario = await usuarioDaSessao()
  if (!usuario) return semSessao()

  const { id } = await params
  const arquivo = await prisma.mediaFile.findFirst({
    where: { id, ...escopoDaLoja(usuario, lojaAtiva(req)) },
    select: { fileKey: true, thumbnailKey: true, mimeType: true, originalName: true },
  })

  // Midia de outra loja responde igual a inexistente.
  if (!arquivo) {
    return NextResponse.json({ error: "Arquivo nao encontrado" }, { status: 404 })
  }

  const querThumb = new URL(req.url).searchParams.get("thumb") === "1"
  // Sem miniatura (video, documento, imagem que o sharp nao decodificou), cai
  // no original: melhor entregar a imagem grande do que um quadrado vazio.
  const chave = querThumb && arquivo.thumbnailKey ? arquivo.thumbnailKey : arquivo.fileKey

  try {
    const { corpo, mimeType } = await ler(chave)

    return new NextResponse(new Uint8Array(corpo), {
      headers: {
        "Content-Type": mimeType || arquivo.mimeType || "application/octet-stream",
        "Content-Length": String(corpo.length),
        // `private`: o arquivo passou por checagem de sessao e loja, entao nao
        // pode ser guardado por proxy compartilhado. `immutable` porque a
        // chave nunca e reescrita — editar midia gera objeto novo.
        "Cache-Control": "private, max-age=31536000, immutable",
        "Content-Disposition": `inline; filename="${encodeURIComponent(arquivo.originalName ?? "arquivo")}"`,
      },
    })
  } catch (e) {
    if (ehArmazenamentoError(e)) {
      console.error("[Media/raw] Armazenamento:", e.message)
      return NextResponse.json({ error: e.message }, { status: 503 })
    }
    // Linha no banco sem objeto no bucket: o registro existe, o arquivo nao.
    console.error("[Media/raw] Objeto ausente:", chave, e)
    return NextResponse.json({ error: "Arquivo indisponivel no armazenamento" }, { status: 404 })
  }
}
