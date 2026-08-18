import type { PaymentProvider, PixPaymentResult, LinkPaymentResult, PaymentStatusResult } from "./types"

/**
 * Mock Payment Provider — used in development.
 * Replace with Mercado Pago or Asaas implementation when ready.
 */
export const mockPaymentProvider: PaymentProvider = {
  name: "mock",

  async generatePix({ amount, description, expirationMinutes = 30 }): Promise<PixPaymentResult> {
    const id = `pix_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const expiresAt = new Date(Date.now() + expirationMinutes * 60 * 1000)

    // Generate a fake Pix code
    const copyPaste = `00020126580014br.gov.bcb.pix0136${id}5204000053039865802BR5913MerlosStore6009SAO_PAULO62070503***6304${amount.toFixed(2)}`

    // In production, this would be a real QR Code base64
    const qrcodeBase64 = `data:image/svg+xml;base64,${Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#f0f0f0"/><text x="100" y="90" text-anchor="middle" font-size="14" fill="#333">PIX Mock</text><text x="100" y="115" text-anchor="middle" font-size="16" font-weight="bold" fill="#333">R$ ${amount.toFixed(2)}</text><text x="100" y="140" text-anchor="middle" font-size="10" fill="#666">${description.slice(0, 30)}</text></svg>`
    ).toString("base64")}`

    return { externalId: id, qrcodeBase64, copyPaste, expiresAt }
  },

  async generatePaymentLink({ amount, description }): Promise<LinkPaymentResult> {
    const id = `link_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24h

    return {
      externalId: id,
      paymentUrl: `https://pay.mock.dev/${id}?amount=${amount}&desc=${encodeURIComponent(description)}`,
      expiresAt,
    }
  },

  async getPaymentStatus(externalId: string): Promise<PaymentStatusResult> {
    return {
      externalId,
      status: "pending",
    }
  },

  async refund() {
    return { success: true }
  },
}
