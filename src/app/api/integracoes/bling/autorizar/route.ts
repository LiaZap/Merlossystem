import { NextResponse } from "next/server"
import { usuarioDaSessao, semSessao } from "@/lib/sessao"
import { BLING_ENDPOINTS, configDoApp, ehBlingConfigError } from "@/lib/bling/config"
import { criarState } from "@/lib/bling/estado"

/**
 * Inicia a autorizacao do Bling.
 *
 * Rota de configuracao — so `admin` chega aqui (src/lib/rbac.ts). O Bling e
 * conta unica da rede (decisao 6), entao nao ha loja a escolher.
 *
 * Devolve a URL em JSON em vez de redirecionar: quem chama e um `fetch` da
 * tela, e seguir um 302 para outro dominio dentro de fetch nao abre nada para
 * o usuario. A tela faz `window.location = url`.
 */
export async function GET() {
  const usuario = await usuarioDaSessao()
  if (!usuario) return semSessao()

  try {
    const cfg = configDoApp()
    const url = new URL(BLING_ENDPOINTS.autorizar)
    url.searchParams.set("response_type", "code")
    url.searchParams.set("client_id", cfg.clientId)
    // `state` assinado: sem ele, um callback forjado trocaria a conta Bling da
    // rede inteira. Vale 1 minuto, como o proprio code do Bling.
    url.searchParams.set("state", criarState(usuario.id))

    return NextResponse.json({ url: url.toString() })
  } catch (e) {
    if (ehBlingConfigError(e)) {
      return NextResponse.json({ error: e.message }, { status: 503 })
    }
    console.error("[Bling] Erro ao montar autorizacao:", e)
    return NextResponse.json({ error: "Erro ao iniciar autorizacao" }, { status: 500 })
  }
}
