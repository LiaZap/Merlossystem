import { prisma } from "@/lib/db/prisma"
import { getAdapterDaConta } from "@/lib/channels"
import { contaDaConversa, credenciaisDaConta } from "@/lib/roteamento"
import { urlAssinada } from "@/lib/media/armazenamento"
import type { ChannelType, ContentType } from "@/lib/channels/types"

/**
 * Entrega de uma mensagem ao canal externo.
 *
 * Existe como funcao separada porque DOIS caminhos entregam a mesma mensagem:
 * o envio normal (POST /api/messages) e o reenvio de uma mensagem que falhou
 * (POST /api/messages/[id]/reenviar). Quando isto vivia dentro do route
 * handler, o reenvio teria que duplicar a resolucao do destinatario, a escolha
 * da conta, a assinatura da URL de midia e o switch por tipo — quatro lugares
 * para divergir. Regra da base: uma regra, um lugar.
 */

/** Conversa ja resolvida DENTRO do escopo da loja por quem chama. */
export type ConversaParaEnvio = {
  id: string
  storeId: string
  channel: string
  contact: {
    phone: string | null
    whatsappId: string | null
    instagramId: string | null
    facebookId: string | null
    tiktokId: string | null
  }
}

export type ResultadoEnvio =
  | { ok: true; externalId?: string }
  | { ok: false; erro: string }

/**
 * Para qual identificador do canal a mensagem vai.
 *
 * Cada canal tem o seu: no WhatsApp o telefone serve de fallback quando o
 * contato ainda nao tem `whatsappId` (contato criado pelo CRM, nao por
 * mensagem recebida). Nos outros nao ha fallback possivel.
 */
export function destinatarioDoCanal(
  channel: string,
  contact: ConversaParaEnvio["contact"]
): string | null {
  switch (channel) {
    case "whatsapp":
      return contact.whatsappId || contact.phone || null
    case "instagram":
      return contact.instagramId
    case "facebook":
      return contact.facebookId
    case "tiktok":
      return contact.tiktokId
    default:
      return null
  }
}

/**
 * Entrega ao canal. NAO grava nada no banco: quem chama decide o que persistir
 * a partir do resultado (mensagem `sent` ou `failed`).
 */
export async function entregarNoCanal(opts: {
  conversa: ConversaParaEnvio
  contentType: ContentType
  content?: string
  mediaFileId?: string
  mediaCaption?: string
}): Promise<ResultadoEnvio> {
  const { conversa } = opts
  const channel = conversa.channel as ChannelType

  const destinatario = destinatarioDoCanal(conversa.channel, conversa.contact)
  if (!destinatario) {
    return { ok: false, erro: `Contato nao tem identificador para o canal ${channel}` }
  }

  // URL ASSINADA, nao `fileUrl`: quem baixa a midia e a Meta/uazapi, do lado
  // de fora, e `fileUrl` aponta para a nossa rota autenticada — eles
  // receberiam 401 e a mensagem chegaria sem imagem (ADR 0006).
  //
  // `findFirst` + storeId da conversa, nao `findUnique` por id: o id vem do
  // corpo do request, e o guard de soft delete nao alcanca `findUnique`.
  let mediaUrl: string | undefined
  if (opts.mediaFileId) {
    const arquivo = await prisma.mediaFile.findFirst({
      where: { id: opts.mediaFileId, storeId: conversa.storeId },
    })
    if (!arquivo) return { ok: false, erro: "Arquivo de midia nao encontrado nesta loja" }
    mediaUrl = await urlAssinada(arquivo.fileKey)
  }

  const precisaDeMidia = opts.contentType !== "text"
  if (precisaDeMidia && !mediaUrl) {
    return { ok: false, erro: `Envio de ${opts.contentType} exige um arquivo de midia` }
  }

  // Responde pela MESMA conta em que a conversa entrou: a cliente que
  // escreveu para o SAC nao pode receber resposta pelo numero de vendas.
  const conta = await contaDaConversa(conversa.id)
  const credenciais = conta ? await credenciaisDaConta(conta.id) : null
  const adapter = getAdapterDaConta(channel, credenciais, conta?.provedor)

  const texto = opts.content || ""
  let resultado
  try {
    switch (opts.contentType) {
      case "image":
        resultado = await adapter.sendImage(destinatario, mediaUrl!, opts.mediaCaption)
        break
      case "video":
        resultado = await adapter.sendVideo(destinatario, mediaUrl!, opts.mediaCaption)
        break
      case "audio":
        resultado = await adapter.sendAudio(destinatario, mediaUrl!)
        break
      case "document":
        resultado = await adapter.sendDocument(destinatario, mediaUrl!, "document")
        break
      default:
        resultado = await adapter.sendText(destinatario, texto)
    }
  } catch (e) {
    // O adapter pode lancar (rede caiu, DNS, timeout). Sem este catch a
    // excecao subia e a mensagem nao era gravada nem como falha — era o
    // caminho pelo qual a mensagem simplesmente desaparecia da tela.
    return { ok: false, erro: e instanceof Error ? e.message : "Falha de rede no envio" }
  }

  if (!resultado.success) {
    return { ok: false, erro: resultado.error || "O canal recusou a mensagem" }
  }
  return { ok: true, externalId: resultado.externalId }
}
