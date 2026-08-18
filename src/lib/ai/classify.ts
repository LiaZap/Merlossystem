import { getAnthropicClient } from "./client"
import { CLASSIFY_PROMPT } from "./prompts"

export interface MessageClassification {
  intent: string
  urgency: "low" | "medium" | "high" | "critical"
  sentiment: "positive" | "neutral" | "negative"
  product_mentioned: string | null
  tags_suggested: string[]
}

export async function classifyMessage(
  messageText: string,
  contactContext?: string
): Promise<MessageClassification> {
  const client = getAnthropicClient()

  const context = contactContext
    ? `\n\nContexto do contato: ${contactContext}`
    : ""

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 300,
    messages: [
      {
        role: "user",
        content: `${CLASSIFY_PROMPT}${context}\n\nMensagem da cliente: "${messageText}"`,
      },
    ],
  })

  const textBlock = response.content.find((b) => b.type === "text")
  const text = textBlock?.text || ""

  try {
    // Extract JSON from response (might have markdown wrapping)
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0])
    }
  } catch {
    // fallback
  }

  return {
    intent: "outro",
    urgency: "medium",
    sentiment: "neutral",
    product_mentioned: null,
    tags_suggested: [],
  }
}
