import { NextResponse } from "next/server"
import { summarizeConversation } from "@/lib/ai/summarize"
import { prisma } from "@/lib/db/prisma"
import { usuarioDaSessao, semSessao } from "@/lib/sessao"
import { escopoDaLoja, lojaAtiva, foraDaLoja } from "@/lib/loja"
import { z } from "zod"

const schema = z.object({
  conversationId: z.string(),
})

export async function POST(req: Request) {
  try {
    const usuario = await usuarioDaSessao()
    if (!usuario) return semSessao()

    const body = await req.json()
    const { conversationId } = schema.parse(body)

    // Resolver a conversa ANTES de resumir: o resumo le TODAS as mensagens
    // dela. Sem escopo, um vendedor do Centro recebia o historico inteiro de
    // uma cliente do Cerro Azul destilado em texto, e ainda sobrescrevia o
    // aiSummary da conversa da outra loja.
    const alvo = await prisma.conversation.findFirst({
      where: { id: conversationId, ...escopoDaLoja(usuario, lojaAtiva(req)) },
      select: { id: true },
    })
    if (!alvo) return foraDaLoja("Conversa")

    const summary = await summarizeConversation(conversationId)

    // Save summary to conversation
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { aiSummary: summary },
    })

    return NextResponse.json({ summary })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    console.error("[AI Summarize] Error:", error)
    return NextResponse.json({ error: "Erro ao resumir" }, { status: 500 })
  }
}
