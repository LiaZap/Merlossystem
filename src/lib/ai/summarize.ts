import { getAnthropicClient } from "./client"
import { SUMMARIZE_PROMPT } from "./prompts"
import { prisma } from "@/lib/db/prisma"

export async function summarizeConversation(
  conversationId: string
): Promise<string> {
  const client = getAnthropicClient()

  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    select: {
      senderType: true,
      content: true,
      contentType: true,
    },
  })

  if (messages.length === 0) return "Conversa sem mensagens."

  const history = messages
    .map((m) => {
      const role = m.senderType === "customer" ? "Cliente" : "Atendente"
      return `${role}: ${m.content || `[${m.contentType}]`}`
    })
    .join("\n")

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 300,
    messages: [
      {
        role: "user",
        content: `${SUMMARIZE_PROMPT}\n\n--- CONVERSA ---\n${history}`,
      },
    ],
  })

  const textBlock = response.content.find((b) => b.type === "text")
  return textBlock?.text || "Não foi possível gerar resumo."
}
