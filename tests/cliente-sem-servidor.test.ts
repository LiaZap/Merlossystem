/**
 * Componente de cliente nao pode arrastar codigo de servidor.
 *
 * O erro que este teste fecha aconteceu de verdade: um componente `"use
 * client"` importou `@/lib/integracoes` so para ler a lista de credenciais
 * esperadas. Aquele modulo importa o cofre, o cofre importa `node:crypto`, e o
 * build parou com `UnhandledSchemeError: Reading from "node:crypto" is not
 * handled by plugins`.
 *
 * O `tsc` passa, o lint passa e os testes passam — so o build reclama, e num
 * projeto grande isso e descoberto tarde. Aqui a checagem custa milissegundos.
 */
import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync, existsSync } from "node:fs"
import { resolve } from "node:path"

const raiz = resolve(__dirname, "..")
const src = resolve(raiz, "src")

/** Modulos do Node que nao existem no navegador. */
const SO_NO_SERVIDOR = /from\s+"node:|require\("node:|from\s+"(fs|crypto|net|dns|child_process)"/

function arquivosDeCodigo(): string[] {
  return readdirSync(src, { recursive: true })
    .map(String)
    .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
    .map((f) => resolve(src, f))
}

const ler = (caminho: string) => readFileSync(caminho, "utf8")

/** Resolve `@/lib/x` para o arquivo em disco. */
function resolverImport(especificador: string): string | null {
  if (!especificador.startsWith("@/")) return null
  const base = resolve(src, especificador.slice(2))
  for (const tentativa of [`${base}.ts`, `${base}.tsx`, resolve(base, "index.ts")]) {
    if (existsSync(tentativa)) return tentativa
  }
  return null
}

function importsDe(codigo: string): string[] {
  return Array.from(codigo.matchAll(/from\s+"(@\/[^"]+)"/g)).map((m) => m[1])
}

/**
 * Segue os imports a partir de um componente de cliente e devolve o primeiro
 * caminho que chega em codigo de servidor. `null` = limpo.
 *
 * Profundidade limitada porque o objetivo e pegar o erro comum (client -> lib
 * -> lib de servidor), nao mapear o grafo inteiro.
 */
function caminhoAteOServidor(arquivo: string, profundidade = 4, visto = new Set<string>()): string[] | null {
  if (profundidade === 0 || visto.has(arquivo)) return null
  visto.add(arquivo)

  const codigo = ler(arquivo)
  if (SO_NO_SERVIDOR.test(codigo)) return [arquivo]

  for (const especificador of importsDe(codigo)) {
    const alvo = resolverImport(especificador)
    if (!alvo) continue
    // Componente marcado como cliente nao pode ser a origem do problema:
    // o Next ja o compila para o navegador.
    const adiante = caminhoAteOServidor(alvo, profundidade - 1, visto)
    if (adiante) return [arquivo, ...adiante]
  }
  return null
}

const curto = (p: string) => p.slice(raiz.length + 1).replace(/\\/g, "/")

describe("componentes de cliente nao importam codigo de servidor", () => {
  const clientes = arquivosDeCodigo().filter((f) => {
    const inicio = ler(f).slice(0, 200)
    return inicio.includes('"use client"') || inicio.includes("'use client'")
  })

  it("existem componentes de cliente para verificar", () => {
    expect(clientes.length).toBeGreaterThan(10)
  })

  it("nenhum alcanca node:crypto, fs ou child_process", () => {
    const culpados = clientes
      .map((f) => ({ arquivo: f, caminho: caminhoAteOServidor(f) }))
      .filter((r) => r.caminho !== null)
      .map((r) => r.caminho!.map(curto).join("\n      -> "))

    expect(culpados, `cadeia ate o servidor:\n      ${culpados.join("\n\n      ")}`).toEqual([])
  })
})

describe("o catalogo de provedores continua puro", () => {
  it("nao importa nada", () => {
    // E o que o torna seguro para os dois lados. Um unico import aqui e o
    // caminho de volta para o bug.
    const codigo = ler(resolve(src, "lib", "integracoes-catalogo.ts"))
    expect(codigo).not.toMatch(/^import\s/m)
  })

  it("o modulo de servidor continua reexportando o catalogo", () => {
    // Para os importadores antigos de `@/lib/integracoes` nao quebrarem.
    const codigo = ler(resolve(src, "lib", "integracoes.ts"))
    expect(codigo).toContain('export * from "./integracoes-catalogo"')
  })
})
