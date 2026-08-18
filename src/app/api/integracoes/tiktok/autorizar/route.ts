import { NextResponse } from "next/server"
import { usuarioDaSessao, semSessao } from "@/lib/sessao"
import { TIKTOK_ENDPOINTS, configDoApp, ehTikTokConfigError } from "@/lib/tiktok/config"
import { criarState } from "@/lib/bling/estado"

/**
 * Inicia a autorizacao do TikTok Shop.
 *
 * Reusa o `state` assinado do Bling (`src/lib/bling/estado.ts`) — o mecanismo e
 * o mesmo e nao ha motivo para ter dois. Sem ele, um callback forjado conecta a
 * loja TikTok do atacante na nossa.
 *
 * Diferente do Bling, o TikTok Shop e por LOJA (cada uma tem a propria conta de
 * vendedor), entao a loja ativa entra no fluxo — o `state` carrega quem pediu, e
 * o callback usa a loja escolhida no seletor.
 */
export async function GET() {
  const usuario = await usuarioDaSessao()
  if (!usuario) return semSessao()

  try {
    const cfg = configDoApp()
    const url = new URL(TIKTOK_ENDPOINTS.autorizar)
    url.searchParams.set("service_id", cfg.appKey)
    url.searchParams.set("state", criarState(usuario.id))

    return NextResponse.json({ url: url.toString() })
  } catch (e) {
    if (ehTikTokConfigError(e)) {
      return NextResponse.json({ error: (e as Error).message }, { status: 503 })
    }
    console.error("[TikTok] Erro ao montar autorizacao:", e)
    return NextResponse.json({ error: "Erro ao iniciar autorizacao" }, { status: 500 })
  }
}
