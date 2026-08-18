/**
 * Middleware atras de proxy — os dois defeitos que so apareceram em producao
 * (EasyPanel), nao em dev.
 *
 * 1. `callbackUrl` montado com `req.nextUrl.href` virava
 *    `https://0.0.0.0:3000/inbox`: atras do proxy, `href` resolve para o
 *    endereco INTERNO do container. Depois do login o usuario ia para um
 *    endereco morto.
 * 2. A raiz `/` redirecionava por `src/app/page.tsx`, e sem sessao isso virava
 *    dois saltos encadeados (`/` -> `/inbox` -> `/login`). O roteador do
 *    cliente quebrava no meio com "Minified React error #310" — tela branca
 *    com "Application error" em producao, enquanto `/login` funcionava.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const raiz = resolve(__dirname, "..")
const ler = (...p: string[]) => readFileSync(resolve(raiz, ...p), "utf8")
const middleware = ler("src", "middleware.ts")

describe("callbackUrl nao pode carregar o host", () => {
  it("usa caminho relativo, nao a URL absoluta da requisicao", () => {
    expect(middleware).toMatch(/callbackUrl", pathname \+ req\.nextUrl\.search/)
  })

  it("nunca usa req.nextUrl.href nem req.url como callbackUrl", () => {
    // Atras de proxy os dois trazem o endereco interno do container.
    expect(middleware).not.toMatch(/callbackUrl",\s*req\.(nextUrl\.href|url)/)
  })

  it("o host vem do cliente — usar ele no callback e open redirect", () => {
    // `href` deriva do header Host, que quem chama controla. Um Host forjado
    // mandaria a vitima para fora do dominio depois de autenticar.
    expect(middleware).toMatch(/open redirect/i)
  })
})

describe("a raiz e resolvida em um salto so", () => {
  it("`/` esta no matcher do middleware", () => {
    const bloco = middleware.slice(middleware.indexOf("matcher"))
    expect(bloco).toMatch(/"\/"/)
  })

  it("o middleware redireciona a raiz, em vez de deixar a pagina fazer isso", () => {
    expect(middleware).toMatch(/pathname === "\/"/)
  })

  it("a raiz nao manda callbackUrl para si mesma", () => {
    // `/login?callbackUrl=/` devolveria o usuario para a raiz, que redireciona
    // de novo — laco.
    expect(middleware).toMatch(/if \(pathname !== "\/"\)/)
  })
})
