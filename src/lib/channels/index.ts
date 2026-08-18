import type { ChannelAdapter, ChannelType } from "./types"
import { whatsappAdapter, criarWhatsappAdapter } from "./whatsapp"
import { instagramAdapter, criarInstagramAdapter } from "./instagram"
import { facebookAdapter, criarFacebookAdapter } from "./facebook"
import { tiktokAdapter } from "./tiktok"
import { criarUazapiAdapter } from "./uazapi"

const adapters: Record<ChannelType, ChannelAdapter> = {
  whatsapp: whatsappAdapter,
  instagram: instagramAdapter,
  facebook: facebookAdapter,
  tiktok: tiktokAdapter,
}

export function getAdapter(channel: ChannelType): ChannelAdapter {
  const adapter = adapters[channel]
  if (!adapter) throw new Error(`Unknown channel: ${channel}`)
  return adapter
}

/**
 * Adapter da CONTA por onde a conversa entrou — e por onde a resposta sai.
 *
 * `credenciais` vem do cofre, decifradas na hora do uso
 * (`src/lib/roteamento.ts`). Sem credencial (conversa criada antes do
 * roteamento por conta, ou conta ainda nao conectada), cai no adapter do
 * ambiente — o comportamento de antes.
 *
 * WhatsApp, Instagram e Facebook aceitam credencial por conta. TikTok ainda nao:
 * o adapter dele nao tem configuracao nenhuma hoje, entao nao ha o que injetar.
 *
 * `provedor` so importa no WhatsApp, o unico canal com DOIS provedores: a API
 * oficial da Meta e o uazapi. Sem ele, o WhatsApp cai na Meta — o
 * comportamento de antes da etapa 7.
 *
 * As chaves de cada provedor estao declaradas em `CHAVES_ESPERADAS`
 * (`src/lib/integracoes.ts`) e a rota de conectar recusa credencial incompleta —
 * senao o erro so apareceria na primeira tentativa de envio.
 */
export function getAdapterDaConta(
  channel: ChannelType,
  credenciais: Record<string, string> | null,
  provedor?: string
): ChannelAdapter {
  if (!credenciais) return getAdapter(channel)

  // O uazapi e o unico caso em que o canal nao determina o adapter.
  if (provedor === "uazapi") {
    if (credenciais.token) {
      return criarUazapiAdapter({ token: credenciais.token, base: credenciais.base })
    }
    return getAdapter(channel)
  }

  switch (channel) {
    case "whatsapp":
      if (credenciais.phone_id && credenciais.access_token) {
        return criarWhatsappAdapter({
          phoneId: credenciais.phone_id,
          accessToken: credenciais.access_token,
        })
      }
      break

    case "instagram":
      if (credenciais.page_access_token) {
        return criarInstagramAdapter({
          pageAccessToken: credenciais.page_access_token,
          instagramAccountId: credenciais.instagram_account_id,
        })
      }
      break

    case "facebook":
      if (credenciais.page_access_token) {
        return criarFacebookAdapter({ pageAccessToken: credenciais.page_access_token })
      }
      break
  }

  // Credencial ausente ou incompleta: cai no adapter do ambiente. Melhor do que
  // montar um adapter que falha em toda chamada — e o nome das chaves esta
  // declarado em CHAVES_ESPERADAS (src/lib/integracoes.ts).
  return getAdapter(channel)
}

export { whatsappAdapter, instagramAdapter, facebookAdapter, tiktokAdapter }
export { criarUazapiAdapter }
export type { ChannelAdapter, ChannelType } from "./types"
