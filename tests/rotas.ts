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
