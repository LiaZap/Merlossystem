/**
 * uazapi — pontos de contato com o servico externo.
 *
 * O uazapi NAO e a API oficial do WhatsApp: e uma camada sobre o WhatsApp Web.
 * Isso muda tres coisas em relacao ao adapter da Meta:
 *   1. o numero pareia por QR code e a sessao CAI — precisa reconectar;
 *   2. nao existe template aprovado nem janela de 24h;
 *   3. o numero pode ser BANIDO pelo WhatsApp — e uso fora dos termos.
 * Por isso os dois provedores convivem (`whatsapp_oficial` e `uazapi`) e a loja
 * escolhe em qual numero usa cada um. Ver docs/integracoes.md.
 *
 * CONFIRMADO (docs.uazapi.com, consultado em 17/08/2026):
 *   - a instalacao tem HOST PROPRIO (cada cliente recebe um subdominio); nao ha
 *     dominio unico como no Bling ou no TikTok Shop — por isso vem de ambiente;
 *   - o acesso e por INSTANCIA: cada numero e uma instancia com token proprio;
 *   - o webhook e configurado por instancia, com eventos separados para
 *     mensagem recebida, mensagem enviada, status da conexao e QR code.
 *
 * NAO CONFIRMADO — a documentacao e Swagger renderizado por JS e nao pode ser
 * lida por fetch. Foram usados o padrao publico do uazapiGO e os SDKs:
 *   - os caminhos exatos em UAZAPI_ENDPOINTS;
 *   - o nome do header do token (`token`);
 *   - os nomes dos campos do corpo (`number`, `text`, `file`).
 *
 * A incerteza esta CONCENTRADA aqui: quando alguem abrir o Swagger da propria
 * instalacao (a URL do painel + /docs), e este arquivo que muda — o adapter,
 * o webhook e as rotas nao precisam ser tocados.
 */

export class UazapiConfigError extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = "UazapiConfigError"
  }
}

/** Erro cruza o limite do bundle do Next; `instanceof` nao sobrevive. */
export function ehUazapiConfigError(e: unknown): e is UazapiConfigError {
  return e instanceof Error && e.name === "UazapiConfigError"
}

/**
 * Host da instalacao. Sem dominio fixo: cada cliente do uazapi tem o seu.
 * Sem isto configurado, conectar um numero falha de imediato — melhor do que
 * montar um adapter que erra a cada envio.
 */
export function baseDaApi(): string {
  const base = process.env.UAZAPI_BASE_URL
  if (!base) {
    throw new UazapiConfigError(
      "uazapi nao configurado: falta UAZAPI_BASE_URL (o host da sua instalacao)"
    )
  }
  return base.replace(/\/+$/, "")
}

/** ⚠️ CONFERIR no Swagger da propria instalacao (URL do painel + /docs). */
export const UAZAPI_ENDPOINTS = {
  /** Envio de texto. Corpo: `{ number, text }`. */
  texto: "/send/text",
  /** Envio de midia. Corpo: `{ number, type, file, text?, docName? }`. */
  midia: "/send/media",
  /** Estado da instancia (`connected`, `disconnected`, `connecting`). */
  status: "/instance/status",
  /** Inicia o pareamento e devolve o QR code. */
  conectar: "/instance/connect",
  /** Derruba a sessao sem apagar a instancia. */
  desconectar: "/instance/disconnect",
} as const

/**
 * Header que carrega o token da INSTANCIA (nao um bearer de conta).
 * ⚠️ CONFERIR: e o ponto mais provavel de divergencia entre versoes.
 */
export const HEADER_TOKEN = "token"

/**
 * Tipo de midia do uazapi para cada `ContentType` que o sistema envia.
 * `sticker` e `location` nao passam por aqui: o gateway nao envia nenhum dos
 * dois hoje.
 */
export const TIPO_DE_MIDIA = {
  image: "image",
  video: "video",
  audio: "audio",
  document: "document",
} as const
