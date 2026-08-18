/**
 * Inventario das rotas de API lido do disco — fonte unica dos testes de
 * autenticacao e RBAC. Nao e arquivo de teste (nao casa com *.test.ts).
 *
 * Ler o disco em vez de manter uma lista na mao e o que faz o teste pegar rota
 * NOVA: quem cria `src/app/api/foo/route.ts` sem pensar em permissao quebra o
 * teste na hora.
 */
import { readdirSync, readFileSync } from "node:fs"
import { join, resolve, sep } from "node:path"

const API_DIR = resolve(__dirname, "..", "src", "app", "api")

export type Rota = {
  /** Forma de arquivo: /api/contacts/[id] */
  rota: string
  /** Caminho como chega em runtime: /api/contacts/abc123 */
  caminho: string
  /** Metodos HTTP exportados pelo route.ts */
  metodos: string[]
  /** Conteudo do route.ts, para checagens estaticas */
  fonte: string
}

const METODOS_HTTP = ["GET", "POST", "PUT", "PATCH", "DELETE"]

function walk(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name)
    if (e.isDirectory()) walk(full, acc)
    else if (e.name === "route.ts") acc.push(full)
  }
  return acc
}

/** /api/contacts/[id]/tags -> /api/contacts/abc123/tags */
function paraCaminhoReal(rota: string): string {
  return rota
    .replace(/\[\.\.\.[^\]]+\]/g, "session")
    .replace(/\[[^\]]+\]/g, "abc123")
}

/**
 * Modulos compartilhados aos quais uma rota pode delegar, com a marca que
 * denuncia a delegacao no fonte.
 *
 * As varreduras de envio (conta de entrada, provedor do adapter, URL assinada)
 * precisam disto: o codigo de entrega saiu dos route handlers e virou
 * `lib/chat/enviar.ts`, porque DUAS rotas entregam a mesma mensagem (envio e
 * reenvio) e duplicar significava quatro lugares para divergir. O invariante e
 * o mesmo; mudou de endereco.
 */
const DELEGACOES: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["entregarNoCanal", ["src", "lib", "chat", "enviar.ts"]],
]

/**
 * Fonte efetiva de uma rota: ela mesma mais os modulos aos quais delega.
 *
 * Usar nas varreduras que perguntam "esta rota faz X?" quando X pode viver num
 * helper compartilhado. Centralizar codigo deixa de quebrar um teste que
 * deveria continuar passando — e nao fazer X continua quebrando, como deve.
 */
export function fonteEfetiva(...caminhoDaRota: readonly string[]): string {
  const raiz = resolve(__dirname, "..")
  const propria = readFileSync(resolve(raiz, ...caminhoDaRota), "utf8")
  const extras = DELEGACOES.filter(([marca]) => propria.includes(marca)).map(
    ([, arquivo]) => readFileSync(resolve(raiz, ...arquivo), "utf8")
  )
  return [propria, ...extras].join("\n")
}

export function listarRotas(): Rota[] {
  return walk(API_DIR).map((arquivo) => {
    const rota =
      "/api" + arquivo.slice(API_DIR.length).split(sep).slice(0, -1).join("/")
    const src = readFileSync(arquivo, "utf8")
    const metodos = METODOS_HTTP.filter((m) =>
      new RegExp(`export\\s+(async\\s+)?function\\s+${m}\\b`).test(src)
    )
    // /api/auth/[...nextauth] reexporta o handler do NextAuth
    if (metodos.length === 0 && /as\s+GET/.test(src)) metodos.push("GET", "POST")
    return { rota, caminho: paraCaminhoReal(rota), metodos, fonte: src }
  })
}
