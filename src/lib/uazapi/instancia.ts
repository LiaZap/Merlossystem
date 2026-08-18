import {
  baseDaApi,
  UAZAPI_ENDPOINTS,
  HEADER_TOKEN,
  UazapiConfigError,
} from "./config"

/**
 * Ciclo de vida da sessao de um numero no uazapi.
 *
 * Isto nao existe na API oficial da Meta e e a diferenca operacional que mais
 * pesa: a sessao do WhatsApp Web CAI (celular sem bateria, sem internet, sessao
 * derrubada pelo proprio WhatsApp) e alguem precisa ler o QR code de novo. Sem
 * uma tela para isso, o numero fica mudo e ninguem descobre ate um cliente
 * reclamar.
 */

export type EstadoInstancia = {
  /** Estado bruto do uazapi, normalizado. */
  status: "conectado" | "desconectado" | "conectando" | "desconhecido"
  /** Base64 ou data URL do QR, quando esta esperando pareamento. */
  qrcode?: string
  /** Numero pareado, quando conectado. */
  numero?: string
}

/** Estados do uazapi -> os nossos. ⚠️ CONFERIR os nomes na instalacao. */
function normalizar(bruto: unknown): EstadoInstancia["status"] {
  switch (String(bruto ?? "").toLowerCase()) {
    case "connected":
    case "open":
      return "conectado"
    case "connecting":
    case "qrcode":
    case "pairing":
      return "conectando"
    case "disconnected":
    case "close":
    case "closed":
      return "desconectado"
    default:
      return "desconhecido"
  }
}

async function chamar(
  caminho: string,
  token: string,
  metodo: "GET" | "POST"
): Promise<Record<string, unknown>> {
  let res: Response
  try {
    res = await fetch(`${baseDaApi()}${caminho}`, {
      method: metodo,
      headers: { [HEADER_TOKEN]: token },
    })
  } catch (e) {
    throw new UazapiConfigError(`uazapi inacessivel: ${(e as Error).message}`)
  }

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new UazapiConfigError(
      `uazapi respondeu ${res.status}: ${data?.error ?? data?.message ?? "sem detalhe"}`
    )
  }
  return data
}

function ler(d: Record<string, unknown>): EstadoInstancia {
  const instancia = (d.instance ?? d) as Record<string, unknown>
  return {
    status: normalizar(instancia.status ?? d.status ?? d.state),
    qrcode: (d.qrcode ?? instancia.qrcode ?? d.qr) as string | undefined,
    numero: (instancia.owner ?? d.owner ?? d.number) as string | undefined,
  }
}

/** Estado atual, sem mexer na sessao. */
export async function estadoDaInstancia(token: string): Promise<EstadoInstancia> {
  return ler(await chamar(UAZAPI_ENDPOINTS.status, token, "GET"))
}

/**
 * Inicia o pareamento e devolve o QR code para a tela exibir.
 *
 * O QR expira em segundos e o uazapi gera outro; a tela precisa reconsultar.
 */
export async function iniciarPareamento(token: string): Promise<EstadoInstancia> {
  return ler(await chamar(UAZAPI_ENDPOINTS.conectar, token, "POST"))
}
