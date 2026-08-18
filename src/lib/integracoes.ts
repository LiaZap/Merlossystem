import { z } from "zod"
import { resumoPublico } from "@/lib/cofre"

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

/** Chaves exigidas que nao vieram. Vazio = tudo certo. */
export function chavesFaltando(provedor: string, credenciais: Record<string, string>): string[] {
  const esperadas = CHAVES_ESPERADAS[provedor as Provedor]
  if (!esperadas) return []
  return esperadas.filter((k) => !credenciais[k])
}

export const integracaoSchema = z.object({
  provedor: z.enum(PROVEDORES),
  rotulo: z.string().min(1, "Informe um rotulo para reconhecer a conta"),
  referenciaExterna: z.string().min(1, "Informe o identificador da conta no provedor"),
  /** Pares chave/valor. Vao cifrados; nunca voltam pela API. */
  credenciais: z.record(z.string(), z.string()).default({}),
  expiraEm: z.string().datetime().optional().nullable(),
})

export const atualizacaoSchema = z.object({
  rotulo: z.string().min(1).optional(),
  status: z.enum(STATUS).optional(),
  credenciais: z.record(z.string(), z.string()).optional(),
  expiraEm: z.string().datetime().optional().nullable(),
})

/** Campos do registro que a API pode devolver. */
type RegistroInterno = {
  id: string
  storeId: string | null
  provedor: string
  rotulo: string
  status: string
  credenciaisCifradas: string | null
  referenciaExterna: string
  expiraEm: Date | null
  ultimoErro: string | null
  ultimaSincronizacao: Date | null
  createdAt: Date
  updatedAt: Date
  store?: { id: string; nome: string } | null
}

/**
 * Converte o registro do banco no que a API devolve.
 *
 * O segredo NAO sai daqui: `credenciaisCifradas` vira `credenciais`, um mapa
 * de chave -> valor mascarado. Ler o segredo e privilegio do servidor.
 */
export function paraApi(r: RegistroInterno) {
  return {
    id: r.id,
    storeId: r.storeId,
    loja: r.store ? { id: r.store.id, nome: r.store.nome } : null,
    escopo: r.storeId ? "loja" : "rede",
    provedor: r.provedor,
    rotulo: r.rotulo,
    status: r.status,
    referenciaExterna: r.referenciaExterna,
    credenciais: resumoPublico(r.credenciaisCifradas),
    expiraEm: r.expiraEm,
    expirada: r.expiraEm ? r.expiraEm.getTime() < Date.now() : false,
    ultimoErro: r.ultimoErro,
    ultimaSincronizacao: r.ultimaSincronizacao,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }
}
