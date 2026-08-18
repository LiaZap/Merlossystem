import { NextResponse, type NextRequest } from "next/server"
import { getToken } from "next-auth/jwt"
import { ehApiPublica } from "@/lib/api-publica"
import { podeAcessar } from "@/lib/rbac"

/**
 * Porta de entrada unica de autenticacao e autorizacao.
 *
 * Paginas: sem sessao -> redireciona para /login (com callbackUrl).
 * API:     sem sessao -> 401 JSON. Redirecionar um fetch para HTML de login
 *          faria o front receber 200 com pagina, e o erro apareceria como
 *          "JSON invalido" em vez de "nao autenticado".
 *          Com sessao mas sem permissao -> 403 JSON (regras em src/lib/rbac.ts).
 *
 * O matcher cobre `/api/:path*` inteiro: rota nova nasce protegida por padrao,
 * tanto na autenticacao quanto no RBAC. Para liberar uma rota e preciso
 * adiciona-la em src/lib/api-publica.ts — e toda entrada dessa lista tem que
 * ter a propria checagem dentro do route handler.
 */

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const ehApi = pathname.startsWith("/api")

  // A lista de excecoes vive em src/lib/api-publica.ts (testada em tests/).
  if (ehApi && ehApiPublica(pathname)) {
    return NextResponse.next()
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })

  if (!token) {
    if (ehApi) {
      return NextResponse.json({ error: "Nao autenticado" }, { status: 401 })
    }
    const login = new URL("/login", req.url)
    login.searchParams.set("callbackUrl", req.nextUrl.href)
    return NextResponse.redirect(login)
  }

  // RBAC so na API. As paginas continuam abertas a qualquer usuario logado —
  // esconder menu e outro assunto; o dado so sai pela API, e la esta travado.
  if (ehApi && !podeAcessar(token.role, pathname, req.method)) {
    return NextResponse.json(
      { error: "Sem permissao para esta operacao" },
      { status: 403 }
    )
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    "/api/:path*",
    "/inbox/:path*",
    "/contacts/:path*",
    "/pipeline/:path*",
    "/products/:path*",
    "/gallery/:path*",
    "/orders/:path*",
    "/returns/:path*",
    "/broadcasts/:path*",
    "/templates/:path*",
    "/knowledge-base/:path*",
    "/analytics/:path*",
    "/alerts/:path*",
    "/quick-replies/:path*",
    "/settings/:path*",
  ],
}
