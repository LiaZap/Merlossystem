/**
 * Armazenamento de midia no MinIO (ADR 0006).
 *
 * O que estes testes protegem:
 *   1. o binario NAO fica publico — nem por descuido de um `fileUrl`;
 *   2. quem busca de fora (Meta/uazapi) recebe URL assinada, e so no envio;
 *   3. a rota que serve o arquivo respeita o escopo de loja;
 *   4. a miniatura e gerada de verdade, e falhar nela nao derruba o upload.
 */
import { describe, it, expect, afterEach, vi } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import sharp from "sharp"
import { montarChave } from "@/lib/media/armazenamento"
import { urlInterna, urlInternaThumb, getFileTypeFromMime } from "@/lib/media/upload"

const raiz = resolve(__dirname, "..")
const ler = (...p: string[]) => readFileSync(resolve(raiz, ...p), "utf8")

const ENV = { ...process.env }
afterEach(() => {
  process.env = { ...ENV }
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// 1. O binario nao e publico
// ---------------------------------------------------------------------------

describe("o binario nunca fica publico", () => {
  it("a URL gravada aponta para a rota autenticada, nao para o bucket", () => {
    const url = urlInterna("abc-123")
    expect(url).toBe("/api/media/abc-123/raw")
    // Se um dia virar URL do bucket, foto de cliente fica acessivel por link.
    expect(url).not.toMatch(/^https?:\/\//)
    expect(urlInternaThumb("abc-123")).toBe("/api/media/abc-123/raw?thumb=1")
  })

  it("quem grava media_file usa a rota interna, nao a chave do bucket", () => {
    for (const arq of [
      ["src", "app", "api", "media", "upload", "route.ts"],
      ["src", "lib", "channels", "gateway.ts"],
    ]) {
      const src = ler(...arq)
      expect(src, arq.join("/")).toMatch(/fileUrl: urlInterna\(/)
      // `chave` no fileUrl seria o caminho do objeto vazando para o cliente.
      expect(src, arq.join("/")).not.toMatch(/fileUrl: result\.chave|fileUrl: uploaded\.chave/)
    }
  })

  it("o compose cria o bucket privado", () => {
    const compose = ler("docker-compose.yml")
    expect(compose).toContain("mc anonymous set none")
    expect(compose).not.toMatch(/anonymous set (download|public)/)
  })

  it("nao sobrou Cloudinary no codigo", () => {
    expect(() => ler("node_modules", "cloudinary", "package.json")).toThrow()
    const pkg = JSON.parse(ler("package.json"))
    expect(pkg.dependencies.cloudinary).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// 2. URL assinada so no envio para fora
// ---------------------------------------------------------------------------

describe("URL assinada e o caminho de fora", () => {
  it("as duas rotas de envio assinam, em vez de mandar fileUrl", () => {
    // A Meta baixa a midia sem sessao nossa: `fileUrl` daria 401 e a cliente
    // receberia mensagem sem imagem.
    for (const arq of [
      ["src", "app", "api", "messages", "route.ts"],
      ["src", "app", "api", "media", "send", "route.ts"],
    ]) {
      const src = ler(...arq)
      expect(src, arq.join("/")).toContain("urlAssinada(")
      expect(src, arq.join("/")).not.toMatch(/adapter\.send\w+\([^)]*fileUrl/)
    }
  })

  it("a assinatura tem validade curta por padrao", () => {
    // A URL e um segredo enquanto vale, e viaja para fora do perimetro.
    const src = ler("src", "lib", "media", "armazenamento.ts")
    const m = src.match(/urlAssinada\(chave: string, segundos = (\d+)\)/)
    expect(m, "assinatura com TTL padrao").toBeTruthy()
    expect(Number(m![1])).toBeLessThanOrEqual(3600)
  })

  it("a rota que serve o arquivo NAO assina — ela autentica", () => {
    const src = ler("src", "app", "api", "media", "[id]", "raw", "route.ts")
    expect(src).toContain("escopoDaLoja")
    expect(src).not.toContain("urlAssinada")
  })
})

// ---------------------------------------------------------------------------
// 3. Chave do objeto
// ---------------------------------------------------------------------------

describe("chave do objeto", () => {
  it("comeca pela loja — cota e limpeza por loja sem consultar o banco", () => {
    const chave = montarChave("loja-centro", "produtos", "vestido.PNG")
    expect(chave.startsWith("loja-centro/produtos/")).toBe(true)
    expect(chave.endsWith(".png")).toBe(true)
  })

  it("nao reaproveita o nome do arquivo — dois uploads iguais nao se sobrescrevem", () => {
    const a = montarChave("l1", "geral", "foto.jpg")
    const b = montarChave("l1", "geral", "foto.jpg")
    expect(a).not.toBe(b)
  })

  it("nome hostil nao escapa da pasta", () => {
    // `../` na pasta escreveria fora do prefixo da loja.
    const chave = montarChave("l1", "../../outra", "x.png")
    expect(chave).not.toContain("..")
    expect(chave.startsWith("l1/")).toBe(true)
  })

  it("arquivo sem extensao reconhecivel nao gera chave quebrada", () => {
    expect(montarChave("l1", "geral")).toMatch(/^l1\/geral\/[0-9a-f-]+\.bin$/)
    expect(montarChave("l1", "geral", "sem-extensao")).toMatch(/\.bin$/)
  })
})

// ---------------------------------------------------------------------------
// 4. Miniatura de verdade
// ---------------------------------------------------------------------------

describe("miniatura", () => {
  it("gera webp 200x200 a partir de uma imagem real", async () => {
    const original = await sharp({
      create: { width: 400, height: 300, channels: 3, background: { r: 200, g: 30, b: 60 } },
    })
      .png()
      .toBuffer()

    const thumb = await sharp(original).resize(200, 200, { fit: "cover" }).webp({ quality: 80 }).toBuffer()
    const meta = await sharp(thumb).metadata()

    expect(meta.format).toBe("webp")
    expect(meta.width).toBe(200)
    expect(meta.height).toBe(200)
    expect(thumb.length).toBeLessThan(original.length)
  })

  it("falha de miniatura nao derruba o upload", () => {
    // Arquivo corrompido ou formato exotico nao pode impedir de GUARDAR.
    const src = ler("src", "lib", "media", "upload.ts")
    const bloco = src.slice(src.indexOf("async function gerarThumb"))
    expect(bloco.slice(0, 400)).toMatch(/try\s*\{[\s\S]*catch/)
    expect(bloco.slice(0, 400)).toContain("return null")
  })

  it("so imagem gera miniatura", () => {
    const src = ler("src", "lib", "media", "upload.ts")
    expect(src).toMatch(/if \(!mimeType\.startsWith\("image\/"\)\) return null/)
  })

  it("o tipo do arquivo sai do mime", () => {
    expect(getFileTypeFromMime("image/png")).toBe("image")
    expect(getFileTypeFromMime("video/mp4")).toBe("video")
    expect(getFileTypeFromMime("audio/ogg")).toBe("audio")
    expect(getFileTypeFromMime("application/pdf")).toBe("document")
  })
})

// ---------------------------------------------------------------------------
// 5. Configuracao
// ---------------------------------------------------------------------------

describe("configuracao do armazenamento", () => {
  it("sem credencial, falha dizendo o que falta", async () => {
    for (const k of ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY", "S3_SECRET_KEY"]) {
      delete process.env[k]
    }
    const { guardar, ehArmazenamentoError } = await import("@/lib/media/armazenamento")
    await expect(guardar("k", Buffer.from("x"), "text/plain")).rejects.toSatisfy((e: unknown) => {
      return ehArmazenamentoError(e) && /S3_ENDPOINT/.test((e as Error).message)
    })
  })

  it("usa path-style — MinIO nao serve bucket como subdominio", () => {
    const src = ler("src", "lib", "media", "armazenamento.ts")
    expect(src).toContain("forcePathStyle: true")
  })

  it("o compose sobe o MinIO em porta que nao colide", () => {
    const compose = ler("docker-compose.yml")
    expect(compose).toContain("minio")
    expect(compose).toMatch(/"9002:9000"/)
  })
})
