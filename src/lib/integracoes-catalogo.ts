/**
 * Catalogo dos provedores: dado puro, SEM dependencia de servidor.
 *
 * Existe separado de `integracoes.ts` porque aquele arquivo importa o cofre de
 * credenciais, que usa `node:crypto`. Um componente `"use client"` que
 * precisasse so da lista de chaves esperadas arrastava o cofre para o bundle do
 * navegador e o build quebrava com `UnhandledSchemeError: node:crypto`.
 *
 * Regra: nada aqui pode importar nada. E o que torna o arquivo seguro para os
 * dois lados. `tests/cliente-sem-servidor.test.ts` trava isso.
 */

/**
 * Provedores que o cofre aceita.
 *
 * `facebook` nao estava na lista de integracoes pedida (Bling, TikTok Shop,
 * Instagram, WhatsApp), mas o sistema JA tem canal de Facebook Messenger
 * (`src/lib/channels/facebook.ts`) com webhook proprio. Sem provedor para ele,
 * o webhook nunca resolveria a conta e o canal ficaria mudo.
 */
export const PROVEDORES = [
  "bling",
  "tiktok_shop",
  "instagram",
  "facebook",
  /** WhatsApp pela API oficial da Meta (Cloud API). */
  "whatsapp_oficial",
  /** WhatsApp pelo uazapi — API nao-oficial sobre o WhatsApp Web. */
  "uazapi",
] as const
export type Provedor = (typeof PROVEDORES)[number]

/** Provedores que entregam mensagem de cliente (tem conversa e contato). */
export const PROVEDORES_DE_CANAL: readonly Provedor[] = [
  "instagram",
  "facebook",
  "whatsapp_oficial",
  "uazapi",
  "tiktok_shop",
]

/**
 * Canal de cada provedor de mensagem.
 *
 * Dois provedores servem o MESMO canal `whatsapp`: a API oficial da Meta e o
 * uazapi. A loja escolhe qual usar em cada numero, e os dois implementam a
 * mesma interface `ChannelAdapter` — quem envia nao precisa saber a diferenca.
 */
export const CANAL_DO_PROVEDOR: Partial<Record<Provedor, string>> = {
  whatsapp_oficial: "whatsapp",
  uazapi: "whatsapp",
  instagram: "instagram",
  facebook: "facebook",
  tiktok_shop: "tiktok",
}

/** Estados possiveis de uma conta conectada. */
export const STATUS = ["desconectado", "conectado", "expirado", "erro"] as const

/**
 * Provedores que sao da REDE, nao de uma loja: conta unica, e a separacao por
 * loja acontece dentro do provedor (Bling usa deposito — decisao 6).
 */
export const PROVEDORES_DA_REDE: readonly Provedor[] = ["bling"]

export function ehDaRede(provedor: string): boolean {
  return PROVEDORES_DA_REDE.includes(provedor as Provedor)
}

/**
 * Chaves de credencial que cada provedor precisa para o envio funcionar.
 *
 * Sem isto declarado, quem conecta uma conta pela tela descobre o nome da chave
 * por tentativa e erro — e uma credencial com a chave errada e gravada,
 * cifrada, e so falha na hora de enviar.
 *
 * `bling` fica de fora: quem preenche e o proprio OAuth, nao a mao.
 */
export const CHAVES_ESPERADAS: Partial<Record<Provedor, string[]>> = {
  whatsapp_oficial: ["phone_id", "access_token"],
  /** Token da INSTANCIA. Da acesso total aquele numero — nao ha escopo. */
  uazapi: ["token"],
  instagram: ["page_access_token"],
  facebook: ["page_access_token"],
}

/**
 * O que e a `referenciaExterna` de cada provedor, em portugues.
 *
 * Isto NAO e enfeite de tela: e o identificador pelo qual o webhook encontra a
 * conta (`contaDoEvento`). Digitando outra coisa, a integracao grava sem erro
 * nenhum e o canal fica mudo — a mensagem chega, o roteamento nao acha a conta
 * e o evento e descartado em silencio.
 *
 * Cada rotulo corresponde ao campo que o adapter le do payload:
 *   whatsapp_oficial -> value.metadata.phone_number_id  (channels/whatsapp.ts)
 *   instagram        -> entry.id                        (channels/instagram.ts)
 *   facebook         -> entry.id                        (channels/facebook.ts)
 *   uazapi           -> body.instance                   (channels/uazapi.ts)
 */
export const REFERENCIA_DO_PROVEDOR: Partial<
  Record<Provedor, { rotulo: string; ajuda: string }>
> = {
  whatsapp_oficial: {
    rotulo: "ID do número (phone_number_id)",
    ajuda:
      "Meta Business > WhatsApp > Configuração da API. É o mesmo valor da credencial phone_id.",
  },
  instagram: {
    rotulo: "ID da conta do Instagram",
    ajuda: "ID da conta profissional ligada à página — o `entry.id` do webhook da Meta.",
  },
  facebook: {
    rotulo: "ID da página do Facebook",
    ajuda: "Página > Sobre > ID da Página. É o `entry.id` do webhook da Meta.",
  },
  uazapi: {
    rotulo: "Nome da instância",
    ajuda: "O nome da instância no painel do uazapi — o campo `instance` do webhook.",
  },
}

/** Explicacao de cada credencial, para a tela nao virar adivinhacao. */
export const AJUDA_DA_CHAVE: Record<string, string> = {
  phone_id: "ID do número que envia as mensagens (Meta Business).",
  access_token: "Token permanente do app da Meta. Não volta pela API depois de salvo.",
  page_access_token: "Token da página, gerado no app da Meta com permissão de mensagens.",
  token: "Token da instância no uazapi. Dá acesso total ao número — não há escopo.",
}
